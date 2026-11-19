-- 058_conversation_events.sql
-- Inbox: notas internas e trocas de responsável na linha do tempo.
--
-- conversation_events guarda as notas internas (só a equipe vê; nada sai
-- para a Meta) e cada troca de responsável (assigned / transferred /
-- unassigned), com quem fez (user, automation, flow, ai). Eventos são
-- imutáveis e só funções SECURITY DEFINER gravam; o client só lê (RLS).
--
-- Transferir com observação = nota + troca na mesma transação. A
-- notificação de quem recebe (trigger da 027) passa a levar o início da
-- observação. Transferir para quem já é o responsável não gera evento de
-- troca nem notificação; com observação, grava só a nota.
--
-- account_id é sempre lido da conversa, nunca do parâmetro.

-- Nota tem texto visível? Espaços, quebras de linha, espaços Unicode
-- (NBSP, ideográfico…) e caracteres invisíveis (zero-width, BOM) não contam.
-- Usada no CHECK da tabela e nas funções, para as duas regras serem a mesma.
CREATE OR REPLACE FUNCTION _note_has_text(p_body TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT p_body ~ '[^[:space:]\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]'
$fn$;

CREATE TABLE IF NOT EXISTS conversation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('note', 'assigned', 'transferred', 'unassigned')),
  actor_kind      TEXT NOT NULL CHECK (actor_kind IN ('user', 'automation', 'flow', 'ai')),
  actor_user_id   UUID NULL,
  from_user_id    UUID NULL,
  to_user_id      UUID NULL,
  body            TEXT NULL,
  -- SET NULL: apagar a conversa de uma nota não trava por causa de um evento que aponta para ela.
  note_id         UUID NULL REFERENCES conversation_events(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Nota: até 2.000 caracteres no total e pelo menos um caractere visível
  -- (só espaço, quebra de linha ou caractere invisível é recusada). Nota
  -- nula também cai aqui. As funções gravam sem espaços nas pontas.
  CONSTRAINT conversation_events_note_body CHECK (
    type <> 'note'
    OR (body IS NOT NULL AND char_length(body) <= 2000 AND _note_has_text(body))
  ),
  CONSTRAINT conversation_events_body_only_note CHECK (type = 'note' OR body IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation
  ON conversation_events (conversation_id, created_at);

ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_events_select ON conversation_events;
CREATE POLICY conversation_events_select ON conversation_events FOR SELECT
  USING (is_account_member(account_id));
-- Sem policy de escrita; e sem privilégio de escrita para o client.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON conversation_events FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_events;
  END IF;
END $$;

-- ============================================================
-- Núcleo: troca de responsável com evento (interna)
-- ============================================================
-- Trava a conversa, confere o destino (membro da mesma conta), grava a
-- nota da observação (se houver) e, se o responsável muda, grava o evento
-- de troca e atualiza assigned_agent_id. Devolve o evento de troca; se só
-- a nota foi gravada, devolve a nota; se nada mudou, devolve NULL.
-- A nota é gravada ANTES do UPDATE e o id do evento fica em
-- app.assignment_event_id durante o UPDATE, para o trigger da notificação
-- achar a observação.
CREATE OR REPLACE FUNCTION _assign_with_event(
  p_conversation_id UUID,
  p_to_user_id UUID,
  p_actor_kind TEXT,
  p_actor_user_id UUID,
  p_note TEXT
) RETURNS conversation_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_current UUID;
  -- Observação sem texto visível = sem observação.
  v_note TEXT := CASE WHEN _note_has_text(p_note) THEN btrim(p_note, E' \t\r\n\f\x0B') END;
  v_note_row conversation_events;
  v_event conversation_events;
BEGIN
  SELECT account_id, assigned_agent_id INTO v_account_id, v_current
    FROM conversations WHERE id = p_conversation_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation % not found', p_conversation_id USING ERRCODE = 'P0002';
  END IF;

  IF p_to_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = p_to_user_id AND account_id = v_account_id
  ) THEN
    RAISE EXCEPTION 'assignee is not a member of this account' USING ERRCODE = '22023';
  END IF;

  IF v_note IS NOT NULL THEN
    INSERT INTO conversation_events (account_id, conversation_id, type, actor_kind, actor_user_id, body)
    VALUES (v_account_id, p_conversation_id, 'note', p_actor_kind, p_actor_user_id, v_note)
    RETURNING * INTO v_note_row;
  END IF;

  IF p_to_user_id IS NOT DISTINCT FROM v_current THEN
    RETURN v_note_row;  -- mesmo responsável: sem evento de troca, sem UPDATE
  END IF;

  INSERT INTO conversation_events (
    account_id, conversation_id, type, actor_kind, actor_user_id, from_user_id, to_user_id, note_id
  ) VALUES (
    v_account_id, p_conversation_id,
    CASE WHEN p_to_user_id IS NULL THEN 'unassigned'
         WHEN v_current IS NULL THEN 'assigned'
         ELSE 'transferred' END,
    p_actor_kind, p_actor_user_id, v_current, p_to_user_id, v_note_row.id
  ) RETURNING * INTO v_event;

  PERFORM set_config('app.assignment_event_id', v_event.id::text, true);
  UPDATE conversations SET assigned_agent_id = p_to_user_id, updated_at = NOW()
   WHERE id = p_conversation_id;
  PERFORM set_config('app.assignment_event_id', '', true);

  RETURN v_event;
END;
$$;

ALTER FUNCTION _assign_with_event(UUID, UUID, TEXT, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION _assign_with_event(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================
-- RPCs do client
-- ============================================================
CREATE OR REPLACE FUNCTION transfer_conversation(
  p_conversation_id UUID,
  p_to_user_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS conversation_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT account_id INTO v_account_id FROM conversations WHERE id = p_conversation_id;
  IF v_account_id IS NULL OR NOT is_account_member(v_account_id, 'agent') THEN
    RAISE EXCEPTION 'not allowed to transfer this conversation' USING ERRCODE = '42501';
  END IF;
  RETURN _assign_with_event(p_conversation_id, p_to_user_id, 'user', auth.uid(), p_note);
END;
$$;

CREATE OR REPLACE FUNCTION add_conversation_note(
  p_conversation_id UUID,
  p_body TEXT
) RETURNS conversation_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_row conversation_events;
BEGIN
  SELECT account_id INTO v_account_id FROM conversations WHERE id = p_conversation_id;
  IF v_account_id IS NULL OR NOT is_account_member(v_account_id, 'agent') THEN
    RAISE EXCEPTION 'not allowed to add a note to this conversation' USING ERRCODE = '42501';
  END IF;
  -- Guarda sem os espaços/quebras das pontas; o CHECK recusa nota vazia ou longa.
  INSERT INTO conversation_events (account_id, conversation_id, type, actor_kind, actor_user_id, body)
  VALUES (v_account_id, p_conversation_id, 'note', 'user', auth.uid(),
          btrim(p_body, E' \t\r\n\f\x0B'))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

ALTER FUNCTION transfer_conversation(UUID, UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION add_conversation_note(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION transfer_conversation(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION add_conversation_note(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transfer_conversation(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION add_conversation_note(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- Caminhos do servidor (fluxo, I.A): só service role
-- ============================================================
CREATE OR REPLACE FUNCTION record_assignment_event(
  p_conversation_id UUID,
  p_to_user_id UUID,
  p_actor_kind TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS conversation_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor_kind IS NULL OR p_actor_kind NOT IN ('user', 'automation', 'flow', 'ai') THEN
    RAISE EXCEPTION 'invalid actor_kind %', p_actor_kind USING ERRCODE = '22023';
  END IF;
  RETURN _assign_with_event(p_conversation_id, p_to_user_id, p_actor_kind, p_actor_user_id, p_note);
END;
$$;

ALTER FUNCTION record_assignment_event(UUID, UUID, TEXT, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION record_assignment_event(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_assignment_event(UUID, UUID, TEXT, UUID, TEXT) TO service_role;

-- ============================================================
-- Automação (055): agora grava o evento. Mesma assinatura e mesma
-- marca de profundidade; SECURITY DEFINER para chamar a função interna
-- (continua só service_role). Devolve o número de conversas do contato.
-- ============================================================
CREATE OR REPLACE FUNCTION automation_assign_conversation(
  p_account_id UUID, p_contact_id UUID, p_agent_id UUID, p_depth INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
  v_id UUID;
BEGIN
  PERFORM set_config('app.automation_depth', p_depth::text, true);
  FOR v_id IN
    SELECT id FROM conversations
     WHERE account_id = p_account_id AND contact_id = p_contact_id
     ORDER BY id
  LOOP
    PERFORM _assign_with_event(v_id, p_agent_id, 'automation', NULL, NULL);
    v_rows := v_rows + 1;
  END LOOP;
  PERFORM set_config('app.automation_depth', '', true);
  RETURN v_rows;
END;
$$;

ALTER FUNCTION automation_assign_conversation(UUID, UUID, UUID, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION automation_assign_conversation(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION automation_assign_conversation(UUID, UUID, UUID, INTEGER) TO service_role;

-- ============================================================
-- Atribuição em lote (056): grava um evento por conversa e continua
-- silenciando os eventos de automação (D10). Antes era SECURITY INVOKER e
-- o RLS de conversations (UPDATE = agent+) filtrava em silêncio; agora é
-- SECURITY DEFINER e repete a mesma regra: só entram conversas em que
-- quem chama é agent+ da conta (service role passa direto, como antes).
-- ============================================================
CREATE OR REPLACE FUNCTION conversations_bulk_assign(p_conversation_ids UUID[], p_agent_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
  v_conv RECORD;
  v_service BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  PERFORM set_config('app.automation_events', 'off', true);
  FOR v_conv IN
    SELECT id, account_id FROM conversations
     WHERE id = ANY (p_conversation_ids)
     ORDER BY id
  LOOP
    IF v_service OR is_account_member(v_conv.account_id, 'agent') THEN
      PERFORM _assign_with_event(v_conv.id, p_agent_id, 'user', auth.uid(), NULL);
      v_rows := v_rows + 1;
    END IF;
  END LOOP;
  PERFORM set_config('app.automation_events', '', true);
  RETURN v_rows;
END;
$$;

ALTER FUNCTION conversations_bulk_assign(UUID[], UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION conversations_bulk_assign(UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION conversations_bulk_assign(UUID[], UUID) TO authenticated, service_role;

-- ============================================================
-- Notificação de atribuição (027): igual, mais o início da observação
-- quando a troca veio com nota na mesma transação.
-- ============================================================
CREATE OR REPLACE FUNCTION notify_conversation_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name TEXT;
  v_actor_name TEXT;
  v_note TEXT;
  v_body TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.assigned_agent_id IS NULL
       OR NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Skip self-assignment — nothing to notify the agent about.
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), phone) INTO v_contact_name
  FROM contacts WHERE id = NEW.contact_id;

  IF auth.uid() IS NOT NULL THEN
    SELECT full_name INTO v_actor_name
    FROM profiles WHERE user_id = auth.uid();
  END IF;

  v_body := COALESCE(v_actor_name, 'Someone') || ' assigned you a conversation with '
    || COALESCE(v_contact_name, 'a contact');

  -- Observação da troca: o evento que _assign_with_event acabou de gravar
  -- (marcado em app.assignment_event_id, só nesta transação), criado agora
  -- e para esta conversa, com note_id.
  SELECT n.body INTO v_note
    FROM conversation_events e
    JOIN conversation_events n ON n.id = e.note_id
   WHERE e.id = NULLIF(current_setting('app.assignment_event_id', true), '')::uuid
     AND e.conversation_id = NEW.id
     AND e.created_at = now()
   ORDER BY e.created_at DESC
   LIMIT 1;
  IF v_note IS NOT NULL THEN
    v_body := v_body || ': ' || left(v_note, 140);
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, conversation_id, contact_id,
    actor_user_id, title, body
  ) VALUES (
    NEW.account_id,
    NEW.assigned_agent_id,
    'conversation_assigned',
    NEW.id,
    NEW.contact_id,
    auth.uid(),
    'New conversation assigned',
    v_body
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a notification failure block the assignment itself.
  RAISE WARNING 'Failed to create assignment notification for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION notify_conversation_assigned() OWNER TO postgres;
