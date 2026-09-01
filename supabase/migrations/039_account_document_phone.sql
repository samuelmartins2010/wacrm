-- ============================================================
-- 039_account_document_phone.sql
--
-- Adds CNPJ/CPF and phone to `accounts`, required by the
-- superadmin "Nova Conta" form going forward.
--
-- Why nullable at the DB level despite being "required"
--   Existing accounts (teste, Daylana, smsolutions, etc.) have
--   neither field and are explicitly OUT of scope for backfill
--   (decision: only new accounts need this). A NOT NULL
--   constraint would be satisfied only by fabricating placeholder
--   data for every existing row, which is worse than just not
--   having the data. So: nullable here, enforced as required in
--   the application layer (POST /api/superadmin/accounts) for new
--   accounts only.
--
--   The CHECK constraints below still protect data quality for
--   whatever IS entered — NULL passes a CHECK by default in
--   Postgres, so legacy rows are unaffected, but a value that
--   doesn't fit the expected digit count is rejected outright,
--   catching truncation/typo bugs the app layer might miss.
--
-- Storage format: digits only, no formatting (dots/dashes/parens
-- stripped by the app before insert). Formatting for display is
-- the UI's job, not the database's.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS document text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_document_length_check'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_document_length_check
      CHECK (document IS NULL OR length(document) IN (11, 14));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_phone_length_check'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_phone_length_check
      CHECK (phone IS NULL OR length(phone) BETWEEN 10 AND 15);
  END IF;
END $$;

COMMENT ON COLUMN accounts.document IS 'CPF (11 digits) or CNPJ (14 digits), digits only. Required for new accounts at the app layer; nullable here for legacy rows.';
COMMENT ON COLUMN accounts.phone IS 'Client contact phone, digits only, with country code (e.g. 5511999998888). Required for new accounts at the app layer; nullable here for legacy rows.';
