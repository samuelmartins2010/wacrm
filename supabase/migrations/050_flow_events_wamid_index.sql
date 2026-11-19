-- 050_flow_events_wamid_index.sql
-- F6: o webhook de status procura o message_sent de um fluxo pelo id da
-- mensagem na Meta; sem índice isso varreria todos os eventos.
CREATE INDEX IF NOT EXISTS idx_flow_run_events_sent_wamid
  ON flow_run_events ((payload->>'whatsapp_message_id'))
  WHERE event_type = 'message_sent';
