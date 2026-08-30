-- ============================================================
-- 038_platform_admin_rbac_audit.sql
--
-- Replaces the single-email `SUPER_ADMIN_EMAIL` gate on
-- `/superadmin` with a real admin table + roles, and adds an
-- immutable audit log for every administrative action.
--
-- Why now
--   The superadmin routes already use the service-role key,
--   which bypasses RLS entirely across every tenant's data. That
--   power currently has zero audit trail and a single point of
--   failure (one env var comparison). This migration closes that
--   gap before any new superadmin UI is built on top of it.
--
-- What this migration does
--   1. `platform_admin_role_enum`: superadmin | financeiro |
--      suporte | comercial (matches the personas in the backoffice
--      brief; only 'superadmin' is wired to anything yet).
--   2. `platform_admins`: one row per internal staff member with
--      backoffice access. RLS enabled, NO policies — this table is
--      only ever read/written via the service-role client on the
--      server, never exposed to `authenticated`/`anon`.
--   3. `platform_admin_audit_log`: append-only log of every
--      superadmin mutation. RLS enabled, NO policies, and a
--      trigger that rejects UPDATE/DELETE unconditionally — even
--      the service role cannot edit or delete a row, only insert.
--
-- What this migration does NOT do
--   - It does not seed any admin. You must manually insert your
--     own user as 'superadmin' after running this (see the
--     accompanying instructions) — otherwise the next deploy
--     locks everyone out of /superadmin.
--   - It does not implement per-role permission granularity beyond
--     the enum. Today only 'superadmin' can do anything; that is a
--     deliberate placeholder until the real permissions matrix is
--     designed (README's "Configurações > Permissões" screen).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- TYPE
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_admin_role_enum') THEN
    CREATE TYPE platform_admin_role_enum AS ENUM ('superadmin', 'financeiro', 'suporte', 'comercial');
  END IF;
END $$;

-- ============================================================
-- TABLE: platform_admins
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role       platform_admin_role_enum NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON platform_admins(user_id);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: authenticated/anon get zero access.
-- Only the service-role client (used exclusively in
-- src/lib/superadmin/*) can read or write this table.
REVOKE ALL ON TABLE platform_admins FROM authenticated, anon;

-- ============================================================
-- TABLE: platform_admin_audit_log (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_admin_audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id uuid REFERENCES auth.users(id),
  admin_email   text,
  admin_role    platform_admin_role_enum,
  action        text NOT NULL,
  target_type   text,
  target_id     text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created_at ON platform_admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_admin_user ON platform_admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_target ON platform_admin_audit_log(target_type, target_id);

ALTER TABLE platform_admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform_admin_audit_log FROM authenticated, anon;
-- service_role gets INSERT/SELECT explicitly; UPDATE/DELETE are
-- blocked below by trigger regardless of role, including service_role.
GRANT SELECT, INSERT ON TABLE platform_admin_audit_log TO service_role;
GRANT USAGE ON SEQUENCE platform_admin_audit_log_id_seq TO service_role;

-- Immutability trigger: no UPDATE, no DELETE, ever, from anyone.
CREATE OR REPLACE FUNCTION reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform_admin_audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_audit_no_update ON platform_admin_audit_log;
CREATE TRIGGER trg_platform_audit_no_update
  BEFORE UPDATE OR DELETE ON platform_admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
