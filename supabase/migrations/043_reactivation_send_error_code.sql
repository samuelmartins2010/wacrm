-- 043_reactivation_send_error_code.sql
-- Guarda o código numérico do erro da Meta (resposta imediata ou webhook
-- de status) para classificar falhas sem depender do texto.
ALTER TABLE reactivation_sends
  ADD COLUMN IF NOT EXISTS error_code INTEGER;
