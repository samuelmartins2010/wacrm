-- 055_automation_trigger_events.sql
-- D3 / A7: tag_added e conversation_assigned passam a disparar, venha a
-- mudança da tela (supabase-js direto no navegador), da API pública, de
-- um fluxo ou de um passo de automação.
--
-- Captura no banco: um trigger em contact_tags (INSERT) e outro em
-- conversations (assigned_agent_id passou a ter alguém) gravam um evento
-- em automation_trigger_events. O servidor processa a fila logo depois
-- da gravação (drain) e o cron das automações drena o que sobrar.
--
-- Proteção contra loop (profundidade 1): passos de automação gravam pelas
-- funções automation_add_tag / automation_assign_conversation, que
-- marcam a transação com app.automation_depth. O evento herda essa
-- profundidade; o drain só dispara eventos de profundidade 0 ou 1, e uma
-- execução disparada por evento carrega a profundidade dele — o que ela
-- mudar gera eventos de profundidade 2, que ficam registrados como
-- 'skipped'.

CREATE TABLE IF NOT EXISTS automation_trigger_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('tag_added', 'conversation_assigned')),
  contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  depth        SMALLINT NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'done', 'skipped')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_automation_trigger_events_pending
  ON automation_trigger_events (account_id, created_at) WHERE status = 'pending';
ALTER TABLE automation_trigger_events ENABLE ROW LEVEL SECURITY;  -- sem policies: só service role

CREATE OR REPLACE FUNCTION automation_current_depth()
RETURNS SMALLINT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.automation_depth', true), ''), '0')::SMALLINT;
$$;

CREATE OR REPLACE FUNCTION contact_tags_emit_tag_added()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO automation_trigger_events (account_id, trigger_type, contact_id, context, depth)
  SELECT c.account_id, 'tag_added', NEW.contact_id, jsonb_build_object('tag_id', NEW.tag_id), automation_current_depth()
    FROM contacts c WHERE c.id = NEW.contact_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contact_tags_emit_tag_added ON contact_tags;
CREATE TRIGGER contact_tags_emit_tag_added
  AFTER INSERT ON contact_tags
  FOR EACH ROW EXECUTE FUNCTION contact_tags_emit_tag_added();

CREATE OR REPLACE FUNCTION conversations_emit_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_agent_id IS NOT NULL
     AND NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO automation_trigger_events (account_id, trigger_type, contact_id, context, depth)
    VALUES (NEW.account_id, 'conversation_assigned', NEW.contact_id,
            jsonb_build_object('agent_id', NEW.assigned_agent_id, 'conversation_id', NEW.id),
            automation_current_depth());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS conversations_emit_assigned ON conversations;
CREATE TRIGGER conversations_emit_assigned
  AFTER UPDATE OF assigned_agent_id ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_emit_assigned();

-- Passos de automação gravam por aqui, marcando a profundidade.
CREATE OR REPLACE FUNCTION automation_add_tag(p_contact_id UUID, p_tag_id UUID, p_depth INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  PERFORM set_config('app.automation_depth', p_depth::text, true);
  INSERT INTO contact_tags (contact_id, tag_id) VALUES (p_contact_id, p_tag_id)
  ON CONFLICT (contact_id, tag_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.automation_depth', '', true);
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION automation_assign_conversation(
  p_account_id UUID, p_contact_id UUID, p_agent_id UUID, p_depth INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  PERFORM set_config('app.automation_depth', p_depth::text, true);
  UPDATE conversations SET assigned_agent_id = p_agent_id, updated_at = NOW()
   WHERE account_id = p_account_id AND contact_id = p_contact_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.automation_depth', '', true);
  RETURN v_rows;
END;
$$;

-- O drain pega um lote de eventos pendentes de forma atômica.
CREATE OR REPLACE FUNCTION claim_automation_trigger_events(p_account_id UUID, p_limit INTEGER)
RETURNS SETOF automation_trigger_events
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE automation_trigger_events e
     SET status = 'processing'
   WHERE e.id IN (
     SELECT id FROM automation_trigger_events
      WHERE status = 'pending' AND (p_account_id IS NULL OR account_id = p_account_id)
      ORDER BY created_at, id
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING e.*;
$$;

REVOKE ALL ON FUNCTION automation_add_tag(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION automation_assign_conversation(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_automation_trigger_events(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION automation_add_tag(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION automation_assign_conversation(UUID, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION claim_automation_trigger_events(UUID, INTEGER) TO service_role;
