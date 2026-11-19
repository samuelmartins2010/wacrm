-- 057: Inbox, filtro "Aguardando" e contadores dos filtros.
--
-- conversations.awaiting_since = desde quando o cliente espera uma
-- resposta HUMANA. Só zera com a resposta de um atendente:
--   messages.sender_type = 'agent' AND NOT sent_via_api AND status <> 'failed'
-- Robô (I.A, automação, fluxo, reativação = 'bot') e mensagem enviada
-- pela API v1 (sent_via_api) não zeram. Resposta que falhou também não;
-- se uma resposta enviada falhar depois, a espera volta.
--
-- O filtro roda no banco (o Inbox lê no máximo 1.000 conversas por vez),
-- e os contadores vêm de inbox_filter_counts().

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS awaiting_since TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_via_api BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN conversations.awaiting_since IS
  'Desde quando o cliente espera resposta humana (null = não espera). Mantido por trigger em messages.';
COMMENT ON COLUMN messages.sent_via_api IS
  'Enviada pela API pública v1: conta como robô e não zera awaiting_since.';

-- ── Recalcular a espera de uma conversa ──────────────────────────────
-- Primeira mensagem do cliente depois da última resposta humana (ou a
-- primeira de todas, se nunca houve resposta humana). Interna.
CREATE OR REPLACE FUNCTION recompute_awaiting_since(p_conversation_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_human TIMESTAMPTZ;
  v_since TIMESTAMPTZ;
BEGIN
  SELECT max(created_at) INTO v_last_human
    FROM messages
   WHERE conversation_id = p_conversation_id
     AND sender_type = 'agent' AND NOT sent_via_api AND status <> 'failed';

  SELECT min(created_at) INTO v_since
    FROM messages
   WHERE conversation_id = p_conversation_id
     AND sender_type = 'customer'
     AND (v_last_human IS NULL OR created_at > v_last_human);

  UPDATE conversations SET awaiting_since = v_since
   WHERE id = p_conversation_id AND awaiting_since IS DISTINCT FROM v_since;

  RETURN v_since;
END;
$$;

REVOKE ALL ON FUNCTION recompute_awaiting_since(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recompute_awaiting_since(UUID) TO service_role;

-- ── Nova mensagem ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION messages_awaiting_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type = 'customer' THEN
    UPDATE conversations
       SET awaiting_since = coalesce(awaiting_since, NEW.created_at, now())
     WHERE id = NEW.conversation_id AND awaiting_since IS NULL;
  ELSIF NEW.sender_type = 'agent' AND NOT NEW.sent_via_api AND NEW.status <> 'failed' THEN
    UPDATE conversations SET awaiting_since = NULL
     WHERE id = NEW.conversation_id AND awaiting_since IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION messages_awaiting_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_awaiting_after_insert ON messages;
CREATE TRIGGER messages_awaiting_after_insert
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_awaiting_after_insert();

-- ── Resposta humana que passa a falhar (ou deixa de falhar) ─────────
CREATE OR REPLACE FUNCTION messages_awaiting_after_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recompute_awaiting_since(NEW.conversation_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION messages_awaiting_after_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_awaiting_after_status ON messages;
CREATE TRIGGER messages_awaiting_after_status
  AFTER UPDATE OF status ON messages
  FOR EACH ROW
  WHEN (NEW.sender_type = 'agent' AND NOT NEW.sent_via_api
        AND (OLD.status = 'failed') IS DISTINCT FROM (NEW.status = 'failed'))
  EXECUTE FUNCTION messages_awaiting_after_status();

-- ── Backfill das conversas que já existem ───────────────────────────
WITH last_human AS (
  SELECT conversation_id, max(created_at) AS at
    FROM messages
   WHERE sender_type = 'agent' AND NOT sent_via_api AND status <> 'failed'
   GROUP BY conversation_id
), waiting AS (
  SELECT m.conversation_id, min(m.created_at) AS since
    FROM messages m
    LEFT JOIN last_human h ON h.conversation_id = m.conversation_id
   WHERE m.sender_type = 'customer' AND (h.at IS NULL OR m.created_at > h.at)
   GROUP BY m.conversation_id
)
UPDATE conversations c
   SET awaiting_since = w.since
  FROM waiting w
 WHERE w.conversation_id = c.id
   AND c.awaiting_since IS DISTINCT FROM w.since;

-- ── Índices dos filtros ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_awaiting
  ON conversations(account_id, awaiting_since)
  WHERE awaiting_since IS NOT NULL AND status <> 'closed';

CREATE INDEX IF NOT EXISTS idx_conversations_assignee_open
  ON conversations(account_id, assigned_agent_id)
  WHERE status <> 'closed';

-- ── Contadores dos filtros do Inbox ─────────────────────────────────
-- SECURITY INVOKER: a RLS de conversations limita às contas de quem chama.
CREATE OR REPLACE FUNCTION inbox_filter_counts()
RETURNS TABLE(mine INT, unassigned INT, awaiting INT, unread INT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE status <> 'closed' AND assigned_agent_id = auth.uid())::int,
    count(*) FILTER (WHERE status <> 'closed' AND assigned_agent_id IS NULL)::int,
    count(*) FILTER (WHERE status <> 'closed' AND awaiting_since IS NOT NULL)::int,
    count(*) FILTER (WHERE unread_count > 0)::int
  FROM conversations;
$$;

REVOKE ALL ON FUNCTION inbox_filter_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inbox_filter_counts() TO authenticated, service_role;
