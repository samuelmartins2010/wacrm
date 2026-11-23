-- 061: fila de eventos das automações (055) sem disparos atrasados.
--
-- 1) Um evento tag_added / conversation_assigned só dispara automações que
--    já estavam ATIVAS quando o evento foi criado. Ligar uma automação não
--    "recupera" atribuições ou etiquetas que estavam na fila.
--    automations.activated_at = quando foi ligada pela última vez (null
--    quando desligada), mantido por trigger.
-- 2) Evento com mais de 60 minutos sem processar é descartado: status
--    'expired' (expire_stale_automation_trigger_events, chamada pelo drain,
--    que registra no log do servidor quantos descartou). Cada descarte
--    também vira uma linha em automation_logs (status 'skipped', motivo
--    "evento vencido") para cada automação que ele teria disparado, e
--    aparece na tela de logs da automação. O claim nunca devolve evento
--    vencido.
--
-- Idempotente (pode rodar de novo). Numerada depois das 057–060 do Inbox
-- (PR #7): aplicar depois delas.

ALTER TABLE automations ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
COMMENT ON COLUMN automations.activated_at IS
  'Quando a automação foi ligada pela última vez (null = desligada). Eventos da fila criados antes disso não a disparam.';

CREATE OR REPLACE FUNCTION automations_set_activated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    IF TG_OP = 'INSERT' OR NOT OLD.is_active OR NEW.activated_at IS NULL THEN
      NEW.activated_at := now();
    END IF;
  ELSE
    NEW.activated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automations_set_activated_at ON automations;
CREATE TRIGGER automations_set_activated_at
  BEFORE INSERT OR UPDATE OF is_active ON automations
  FOR EACH ROW EXECUTE FUNCTION automations_set_activated_at();

-- Ativas hoje: a última alteração é a melhor aproximação de quando foram
-- ligadas (sem perder nada que já esteja dentro dos 60 minutos).
UPDATE automations SET activated_at = coalesce(updated_at, created_at)
 WHERE is_active AND activated_at IS NULL;

-- 'expired' entra nos status possíveis.
ALTER TABLE automation_trigger_events DROP CONSTRAINT IF EXISTS automation_trigger_events_status_check;
ALTER TABLE automation_trigger_events ADD CONSTRAINT automation_trigger_events_status_check
  CHECK (status IN ('pending', 'processing', 'done', 'skipped', 'expired'));

-- 'skipped' entra nos status de automation_logs (descarte de evento vencido).
ALTER TABLE automation_logs DROP CONSTRAINT IF EXISTS automation_logs_status_check;
ALTER TABLE automation_logs ADD CONSTRAINT automation_logs_status_check
  CHECK (status IN ('success', 'partial', 'failed', 'cancelled', 'waiting', 'skipped'));

-- Descarta os pendentes vencidos e registra o descarte nos logs de cada
-- automação que o evento teria disparado (mesma regra do app: tipo do
-- gatilho, ativa desde antes do evento, etiqueta/atendente do gatilho
-- quando configurados). Devolve quantos eventos descartou.
CREATE OR REPLACE FUNCTION expire_stale_automation_trigger_events(p_account_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE automation_trigger_events
       SET status = 'expired', processed_at = now()
     WHERE status = 'pending'
       AND created_at < now() - interval '60 minutes'
       AND (p_account_id IS NULL OR account_id = p_account_id)
    RETURNING *
  ), logged AS (
    INSERT INTO automation_logs (automation_id, user_id, account_id, contact_id, trigger_event,
                                 steps_executed, status, error_message)
    SELECT a.id, a.user_id, a.account_id,
           (SELECT c.id FROM contacts c WHERE c.id = e.contact_id),
           e.trigger_type, '[]'::jsonb, 'skipped', 'evento vencido'
      FROM expired e
      JOIN automations a
        ON a.account_id = e.account_id
       AND a.trigger_type = e.trigger_type
       AND a.is_active
       AND a.activated_at <= e.created_at
     WHERE e.depth <= 1
       AND CASE e.trigger_type
             WHEN 'tag_added' THEN coalesce(a.trigger_config->>'tag_id', '') IN ('', coalesce(e.context->>'tag_id', ''))
             WHEN 'conversation_assigned' THEN coalesce(a.trigger_config->>'agent_id', '') IN ('', coalesce(e.context->>'agent_id', ''))
             ELSE false
           END
    RETURNING 1
  )
  SELECT (SELECT count(*)::int FROM expired) INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION expire_stale_automation_trigger_events(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_stale_automation_trigger_events(UUID) TO service_role;

-- O claim (055) passa a ignorar eventos vencidos.
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
        AND created_at >= now() - interval '60 minutes'
      ORDER BY created_at, id
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING e.*;
$$;
