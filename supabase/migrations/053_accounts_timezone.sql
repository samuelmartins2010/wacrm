-- 053_accounts_timezone.sql
-- A3: condições de horário das automações usam o fuso da conta, nunca o
-- do servidor. Padrão America/Sao_Paulo; nome IANA (ex.: Europe/Lisbon).
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE OR REPLACE FUNCTION accounts_check_timezone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', NEW.timezone USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_check_timezone ON accounts;
CREATE TRIGGER accounts_check_timezone
  BEFORE INSERT OR UPDATE OF timezone ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_check_timezone();
