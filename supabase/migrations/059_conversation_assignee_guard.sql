-- 059: quem pode ser responsável por uma conversa.
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
-- Não apaga nem altera nada que já existe.

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
