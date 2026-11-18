-- 054_automation_logs_waiting.sql
-- A4: execução parada num wait aparece como "Aguardando", nunca como
-- "sucesso" com pendência aberta.
ALTER TABLE automation_logs
  DROP CONSTRAINT IF EXISTS automation_logs_status_check;
ALTER TABLE automation_logs
  ADD CONSTRAINT automation_logs_status_check
  CHECK (status IN ('success', 'partial', 'failed', 'cancelled', 'waiting'));
