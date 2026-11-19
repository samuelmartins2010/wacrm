-- 049_conversation_bot_handoff.sql
-- D7: depois de um handoff (nó handoff, fallback esgotado ou nó removido),
-- a I.A e as automações de conteúdo ficam em silêncio naquela conversa
-- até ela ser encerrada ou reaberta.
--   * bot_handoff_at marca o silêncio (o fluxo grava junto com
--     ai_autoreply_disabled = true);
--   * ao encerrar (→ closed) ou reabrir (closed → outro status), o trigger
--     limpa a marca e reativa a I.A só se foi o handoff que a pausou —
--     uma pausa manual (sem bot_handoff_at) é preservada.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS bot_handoff_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION conversations_clear_bot_handoff()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = 'closed' OR OLD.status = 'closed')
     AND OLD.bot_handoff_at IS NOT NULL THEN
    NEW.bot_handoff_at := NULL;
    NEW.ai_autoreply_disabled := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_clear_bot_handoff ON conversations;
CREATE TRIGGER conversations_clear_bot_handoff
  BEFORE UPDATE OF status ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION conversations_clear_bot_handoff();
