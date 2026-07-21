-- 036_saas_subscriptions.sql
-- Adds subscription management fields to the accounts table.
-- Safe to run multiple times (IF NOT EXISTS / idempotent DDL).

-- ============================================================
-- TYPES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status_enum') THEN
    CREATE TYPE account_status_enum AS ENUM ('active', 'suspended', 'trial');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_plan_enum') THEN
    CREATE TYPE account_plan_enum AS ENUM ('basic', 'pro');
  END IF;
END $$;

-- ============================================================
-- COLUMNS
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status       account_status_enum NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS plan         account_plan_enum   NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS renewal_date DATE,
  ADD COLUMN IF NOT EXISTS notes        TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- ============================================================
-- INDEX (for filtering by status in the super admin panel)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

-- ============================================================
-- RLS: Super admin reads via service role (bypasses RLS).
-- Regular accounts read their own row via existing policy.
-- No new policies needed.
-- ============================================================
