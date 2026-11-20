-- 057: Inbox, filtro "Aguardando" e contadores dos filtros.
--
-- conversations.awaiting_since = desde quando o cliente espera uma
-- resposta HUMANA. Só zera com a resposta de um atendente:
--   messages.sender_type = 'agent' AND NOT sent_via_api AND status <> 'failed'
-- Robô (I.A, automação, fluxo, reativação = 'bot') e mensagem enviada
-- pela API v1 (sent_via_api) não zeram. Resposta que falhou também não;
-- se uma resposta enviada falhar depois, a espera volta.
--
-- Conversa encerrada não espera: encerrar zera awaiting_since, e mensagem
-- do cliente em conversa encerrada não começa espera. Ao reabrir, a
-- espera recomeça só com o que o cliente escreveu depois do encerramento
-- (conversations.closed_at) e ainda não teve resposta humana.
--
-- O filtro roda no banco (o Inbox lê no máximo 1.000 conversas por vez),
-- e os contadores vêm de inbox_filter_counts().

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS awaiting_since TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_via_api BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN conversations.awaiting_since IS
  'Desde quando o cliente espera resposta humana (null = não espera). Mantido por trigger em messages.';
COMMENT ON COLUMN conversations.closed_at IS
  'Último encerramento (status → closed). Mantido por trigger; só conta para a espera ao reabrir.';
COMMENT ON COLUMN messages.sent_via_api IS
  'Enviada pela API pública v1: conta como robô e não zera awaiting_since.';

-- ── Valor da espera de uma conversa ─────────────────────────────────
-- Primeira mensagem do cliente depois da última resposta humana e do
-- último encerramento (ou a primeira de todas, se não houve nenhum dos
-- dois). Encerrada = sem espera. Interna.
CREATE OR REPLACE FUNCTION _awaiting_since_value(p_conversation_id UUID, p_status TEXT, p_closed_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_floor TIMESTAMPTZ;
BEGIN
  IF p_status = 'closed' THEN
    RETURN NULL;
  END IF;

  SELECT max(created_at) INTO v_floor
    FROM messages
   WHERE conversation_id = p_conversation_id
     AND sender_type = 'agent' AND NOT sent_via_api AND status <> 'failed';
  v_floor := greatest(v_floor, p_closed_at);  -- greatest ignora NULL

  RETURN (SELECT min(created_at)
            FROM messages
           WHERE conversation_id = p_conversation_id
             AND sender_type = 'customer'
             AND (v_floor IS NULL OR created_at > v_floor));
END;
$$;

REVOKE ALL ON FUNCTION _awaiting_since_value(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- ── Recalcular a espera de uma conversa ──────────────────────────────
CREATE OR REPLACE FUNCTION recompute_awaiting_since(p_conversation_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  SELECT _awaiting_since_value(id, status, closed_at) INTO v_since
    FROM conversations WHERE id = p_conversation_id;

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
     WHERE id = NEW.conversation_id AND awaiting_since IS NULL AND status <> 'closed';
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

-- ── Encerrar e reabrir ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conversations_awaiting_on_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'closed' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'closed' THEN
      NEW.awaiting_since := NULL;
      NEW.closed_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'closed' THEN
    NEW.awaiting_since := _awaiting_since_value(NEW.id, NEW.status, NEW.closed_at);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION conversations_awaiting_on_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conversations_awaiting_on_status ON conversations;
CREATE TRIGGER conversations_awaiting_on_status
  BEFORE INSERT OR UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_awaiting_on_status();

-- ── Backfill das conversas que já existem ───────────────────────────
-- Encerradas: sem espera; closed_at aproximado pela última alteração.
UPDATE conversations
   SET closed_at = coalesce(closed_at, updated_at, now())
 WHERE status = 'closed' AND closed_at IS NULL;

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
   AND c.status <> 'closed'
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
