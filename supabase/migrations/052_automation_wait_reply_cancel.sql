-- 052_automation_wait_reply_cancel.sql
-- D4 / A1:
--   * contato que responde durante um wait cancela o restante da
--     automação, a menos que ela tenha "continuar mesmo se o contato
--     responder" (continue_on_reply, padrão desligado);
--   * uma execução por automação/contato: o banco não aceita duas
--     esperas abertas da mesma automação para o mesmo contato.

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS continue_on_reply BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE automation_pending_executions
  DROP CONSTRAINT IF EXISTS automation_pending_executions_status_check;
ALTER TABLE automation_pending_executions
  ADD CONSTRAINT automation_pending_executions_status_check
  CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled'));

ALTER TABLE automation_logs
  DROP CONSTRAINT IF EXISTS automation_logs_status_check;
ALTER TABLE automation_logs
  ADD CONSTRAINT automation_logs_status_check
  CHECK (status IN ('success', 'partial', 'failed', 'cancelled'));

-- Esperas duplicadas já existentes: mantém a mais antiga.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY automation_id, contact_id ORDER BY created_at, id) AS rn
    FROM automation_pending_executions
   WHERE status IN ('pending', 'running') AND contact_id IS NOT NULL
)
UPDATE automation_pending_executions p
   SET status = 'cancelled'
  FROM ranked r
 WHERE r.id = p.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_one_open_wait_per_contact
  ON automation_pending_executions (automation_id, contact_id)
  WHERE status IN ('pending', 'running') AND contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_pending_contact_open
  ON automation_pending_executions (account_id, contact_id)
  WHERE status = 'pending';
