-- 060: o responsável de uma conversa só muda junto com um evento.
--
-- Toda troca de assigned_agent_id passa por _assign_with_event (058), que
-- grava o evento em conversation_events e marca a transação com
-- app.assignment_event_id antes do UPDATE. Este trigger recusa qualquer
-- troca sem essa marca — tela, API, service role ou postgres — e confere
-- que a marca aponta para um evento REAL desta conversa com este destino
-- (a marca sozinha poderia ser forjada com set_config; o evento só nasce
-- pelas funções SECURITY DEFINER).
--
-- Caminhos que continuam (todos via _assign_with_event): transferência
-- pela tela, atribuição por automação e em massa, fluxo e I.A
-- (record_assignment_event), reabertura pelo cliente e perda de acesso
-- (059). Conversa nova não nasce com responsável (nenhum caminho do app
-- faz isso; atribuir é sempre um passo com evento).
--
-- Roda depois da validação de quem pode ser responsável (059,
-- conversations_check_assignee — ordem alfabética), para "outra conta" e
-- "só visualiza" continuarem com a mensagem específica.
-- Não altera dados existentes.

CREATE OR REPLACE FUNCTION conversations_require_assignment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mark TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NOT NULL THEN
      RAISE EXCEPTION 'assignee changes must go through transfer_conversation' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  v_mark := nullif(current_setting('app.assignment_event_id', true), '');
  IF v_mark IS NULL
     OR v_mark !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NOT EXISTS (
       SELECT 1 FROM conversation_events
        WHERE id = v_mark::uuid
          AND conversation_id = NEW.id
          AND type IN ('assigned', 'transferred', 'unassigned')
          AND to_user_id IS NOT DISTINCT FROM NEW.assigned_agent_id
     ) THEN
    RAISE EXCEPTION 'assignee changes must go through transfer_conversation' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION conversations_require_assignment_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conversations_require_assignment_event ON conversations;
CREATE TRIGGER conversations_require_assignment_event
  BEFORE INSERT OR UPDATE OF assigned_agent_id ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_require_assignment_event();
