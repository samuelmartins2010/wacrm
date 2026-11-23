-- 059: quem pode ser responsável por uma conversa, reabertura pelo cliente
-- e conversas de quem perde acesso à conta.
--
-- O responsável (conversations.assigned_agent_id) precisa ser dono, admin
-- ou atendente da MESMA conta da conversa. Recusa:
--   * usuário de outra conta → 'assignee is not a member of this account'
--   * quem só visualiza       → 'assignee has a view-only role in this account'
-- (ERRCODE 22023 nos dois casos).
--
-- É um trigger na própria tabela, então vale para todos os caminhos:
-- tela (UPDATE direto), API, transferência, automação, fluxo, I.A e
-- atribuição em massa. Só confere quando o responsável muda (ou a
-- conversa nasce com um): uma conversa cujo responsável perdeu acesso
-- depois continua podendo ser editada e encerrada até alguém trocar.
--
-- Não apaga dados; só amplia as listas de tipos de conversation_events.

CREATE OR REPLACE FUNCTION conversations_check_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role account_role_enum;
BEGIN
  IF NEW.assigned_agent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id
     AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN
    RETURN NEW;
  END IF;

  SELECT account_role INTO v_role
    FROM profiles
   WHERE user_id = NEW.assigned_agent_id AND account_id = NEW.account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignee is not a member of this account' USING ERRCODE = '22023';
  END IF;
  IF v_role = 'viewer' THEN
    RAISE EXCEPTION 'assignee has a view-only role in this account' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION conversations_check_assignee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conversations_check_assignee ON conversations;
CREATE TRIGGER conversations_check_assignee
  BEFORE INSERT OR UPDATE OF assigned_agent_id, account_id ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_check_assignee();

-- ============================================================
-- Eventos novos em conversation_events
--   type 'reopened'   → reaberta pelo cliente (actor_kind 'customer')
--   actor_kind 'system' → o próprio banco tirou o responsável
--     (saiu da conta, virou só visualização), a pedido de actor_user_id
--     quando houver.
-- ============================================================
ALTER TABLE conversation_events DROP CONSTRAINT IF EXISTS conversation_events_type_check;
ALTER TABLE conversation_events ADD CONSTRAINT conversation_events_type_check
  CHECK (type IN ('note', 'assigned', 'transferred', 'unassigned', 'reopened'));
ALTER TABLE conversation_events DROP CONSTRAINT IF EXISTS conversation_events_actor_kind_check;
ALTER TABLE conversation_events ADD CONSTRAINT conversation_events_actor_kind_check
  CHECK (actor_kind IN ('user', 'automation', 'flow', 'ai', 'system', 'customer'));

-- Pode ser responsável? (mesma regra do trigger acima)
CREATE OR REPLACE FUNCTION _can_be_assignee(p_user_id UUID, p_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE user_id = p_user_id AND account_id = p_account_id AND account_role <> 'viewer'
  )
$$;

REVOKE ALL ON FUNCTION _can_be_assignee(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Mensagem do cliente reabre conversa encerrada
--   * status → 'open' (o trigger da 057 recalcula a espera e o da 049
--     encerra o silêncio dos robôs de um handoff — D7);
--   * a espera começa nessa mensagem;
--   * evento 'reopened';
--   * responsável que saiu da conta ou só visualiza → Sem dono, com
--     evento 'unassigned' (actor_kind 'system').
-- Roda depois de messages_awaiting_after_insert (ordem alfabética).
-- ============================================================
CREATE OR REPLACE FUNCTION messages_reopen_on_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv conversations;
BEGIN
  SELECT * INTO v_conv FROM conversations WHERE id = NEW.conversation_id FOR UPDATE;
  IF NOT FOUND OR v_conv.status <> 'closed' THEN
    RETURN NULL;
  END IF;

  UPDATE conversations SET status = 'open', updated_at = now() WHERE id = v_conv.id;
  UPDATE conversations SET awaiting_since = coalesce(awaiting_since, NEW.created_at, now())
   WHERE id = v_conv.id;

  INSERT INTO conversation_events (account_id, conversation_id, type, actor_kind)
  VALUES (v_conv.account_id, v_conv.id, 'reopened', 'customer');

  IF v_conv.assigned_agent_id IS NOT NULL
     AND NOT _can_be_assignee(v_conv.assigned_agent_id, v_conv.account_id) THEN
    PERFORM _assign_with_event(v_conv.id, NULL, 'system', NULL, NULL);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION messages_reopen_on_customer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_reopen_on_customer ON messages;
CREATE TRIGGER messages_reopen_on_customer
  AFTER INSERT ON messages
  FOR EACH ROW
  WHEN (NEW.sender_type = 'customer')
  EXECUTE FUNCTION messages_reopen_on_customer();

-- ============================================================
-- Membro removido ou que passou a só visualizar: as conversas
-- NÃO encerradas dele voltam para Sem dono, com evento. Encerradas
-- ficam como estão (se o cliente escrever, a reabertura resolve).
-- remove_account_member troca o account_id; set_member_role troca o papel.
-- ============================================================
CREATE OR REPLACE FUNCTION profiles_unassign_on_access_loss()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  IF OLD.account_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id
     AND NOT (NEW.account_role = 'viewer' AND OLD.account_role IS DISTINCT FROM 'viewer') THEN
    RETURN NULL;
  END IF;

  FOR v_conv_id IN
    SELECT id FROM conversations
     WHERE account_id = OLD.account_id
       AND assigned_agent_id = OLD.user_id
       AND status <> 'closed'
     ORDER BY id
  LOOP
    PERFORM _assign_with_event(v_conv_id, NULL, 'system', auth.uid(), NULL);
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION profiles_unassign_on_access_loss() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_unassign_on_access_loss ON profiles;
CREATE TRIGGER profiles_unassign_on_access_loss
  AFTER UPDATE OF account_id, account_role OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_unassign_on_access_loss();

-- ============================================================
-- Handoff da I.A sem tirar a conversa de um humano
--   record_assignment_event ganha p_only_if_unassigned: com a linha da
--   conversa travada, só atribui se ela ainda não tem responsável. A I.A
--   lê a conversa segundos antes (chamada ao modelo); se um atendente
--   clicou "Assumir" nesse meio-tempo, a I.A não passa por cima.
--   A versão de 5 parâmetros (058) sai; nada no banco depende dela e as
--   chamadas existentes continuam válidas (o novo parâmetro tem default).
-- ============================================================
DROP FUNCTION IF EXISTS record_assignment_event(UUID, UUID, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION record_assignment_event(
  p_conversation_id UUID,
  p_to_user_id UUID,
  p_actor_kind TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_only_if_unassigned BOOLEAN DEFAULT false
) RETURNS conversation_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current UUID;
BEGIN
  IF p_actor_kind IS NULL OR p_actor_kind NOT IN ('user', 'automation', 'flow', 'ai') THEN
    RAISE EXCEPTION 'invalid actor_kind %', p_actor_kind USING ERRCODE = '22023';
  END IF;
  IF p_only_if_unassigned THEN
    SELECT assigned_agent_id INTO v_current
      FROM conversations WHERE id = p_conversation_id
       FOR UPDATE;
    IF v_current IS NOT NULL THEN
      RETURN NULL;  -- já tem responsável: não mexe, não grava nada
    END IF;
  END IF;
  RETURN _assign_with_event(p_conversation_id, p_to_user_id, p_actor_kind, p_actor_user_id, p_note);
END;
$$;

ALTER FUNCTION record_assignment_event(UUID, UUID, TEXT, UUID, TEXT, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION record_assignment_event(UUID, UUID, TEXT, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_assignment_event(UUID, UUID, TEXT, UUID, TEXT, BOOLEAN) TO service_role;
