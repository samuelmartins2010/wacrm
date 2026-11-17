-- 040_reactivation.sql
-- Reativação de contatos inativos (docs/superpowers/specs/2026-11-17-reativacao-design.md).
-- Safe to run multiple times (IF NOT EXISTS / idempotent DDL).

-- ============================================================
-- CONTACTS: opt-out de campanhas + última mensagem recebida
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS do_not_contact        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS do_not_contact_source TEXT,
  ADD COLUMN IF NOT EXISTS last_inbound_at       TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_do_not_contact_source_check'
  ) THEN
    ALTER TABLE contacts ADD CONSTRAINT contacts_do_not_contact_source_check
      CHECK (do_not_contact_source IS NULL OR do_not_contact_source IN ('reativacao_sair', 'manual'));
  END IF;
END $$;

-- Backfill: última mensagem do cliente em qualquer conversa.
UPDATE contacts c
SET last_inbound_at = s.max_at
FROM (
  SELECT cv.contact_id, MAX(m.created_at) AS max_at
  FROM messages m
  JOIN conversations cv ON cv.id = m.conversation_id
  WHERE m.sender_type = 'customer'
  GROUP BY cv.contact_id
) s
WHERE s.contact_id = c.id
  AND c.last_inbound_at IS DISTINCT FROM s.max_at;

CREATE INDEX IF NOT EXISTS idx_contacts_account_last_inbound
  ON contacts(account_id, last_inbound_at);

-- ============================================================
-- SETTINGS (1 linha por conta)
-- ============================================================
CREATE TABLE IF NOT EXISTS reactivation_settings (
  account_id            UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  band_late_days        INTEGER NOT NULL DEFAULT 30  CHECK (band_late_days > 0),
  band_cooling_days     INTEGER NOT NULL DEFAULT 60  CHECK (band_cooling_days > 0),
  band_gone_days        INTEGER NOT NULL DEFAULT 120 CHECK (band_gone_days > 0),
  rest_days             INTEGER NOT NULL DEFAULT 60  CHECK (rest_days >= 0),
  recent_outbound_days  INTEGER NOT NULL DEFAULT 7   CHECK (recent_outbound_days >= 0),
  daily_limit           INTEGER NOT NULL DEFAULT 50  CHECK (daily_limit > 0),
  send_window           JSONB   NOT NULL DEFAULT '{"mon_fri":[9,19],"sat":[9,13],"sun":null}'::jsonb,
  optout_keywords       TEXT[]  NOT NULL DEFAULT ARRAY['SAIR','PARAR','STOP'],
  optout_reply          TEXT    NOT NULL DEFAULT 'Pronto, você não vai mais receber nossas mensagens de campanha.',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS reactivation_campaigns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'active', 'paused', 'finished')),
  pause_reason     TEXT,
  bands            TEXT[] NOT NULL DEFAULT ARRAY['late','cooling','gone'],
  tag_ids          UUID[] NOT NULL DEFAULT '{}',
  exclude_tag_ids  UUID[] NOT NULL DEFAULT '{}',
  steps            JSONB  NOT NULL DEFAULT '[]'::jsonb,
  send_window      JSONB,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reactivation_campaigns_account
  ON reactivation_campaigns(account_id, created_at DESC);

-- ============================================================
-- ENROLLMENTS (um contato numa campanha)
-- ============================================================
CREATE TABLE IF NOT EXISTS reactivation_enrollments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES reactivation_campaigns(id) ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','replied','completed','opted_out','failed','removed','cancelled')),
  current_step  INTEGER NOT NULL DEFAULT 0,
  next_run_at   TIMESTAMPTZ,
  replied_at    TIMESTAMPTZ,
  replied_step  INTEGER,
  ended_at      TIMESTAMPTZ,
  end_reason    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_reactivation_enrollments_due
  ON reactivation_enrollments(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_reactivation_enrollments_contact
  ON reactivation_enrollments(contact_id, ended_at);

-- ============================================================
-- SENDS (um toque enviado)
-- ============================================================
CREATE TABLE IF NOT EXISTS reactivation_sends (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enrollment_id       UUID NOT NULL REFERENCES reactivation_enrollments(id) ON DELETE CASCADE,
  step                INTEGER NOT NULL,
  attempts            INTEGER NOT NULL DEFAULT 0,
  whatsapp_message_id TEXT,
  message_id          UUID REFERENCES messages(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent','delivered','read','failed')),
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, step)
);

CREATE INDEX IF NOT EXISTS idx_reactivation_sends_wamid
  ON reactivation_sends(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_sends_account_updated
  ON reactivation_sends(account_id, updated_at);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE reactivation_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactivation_campaigns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactivation_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactivation_sends       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reactivation_settings_select ON reactivation_settings;
DROP POLICY IF EXISTS reactivation_settings_write  ON reactivation_settings;
CREATE POLICY reactivation_settings_select ON reactivation_settings FOR SELECT
  USING (is_account_member(account_id, 'agent'));
CREATE POLICY reactivation_settings_write ON reactivation_settings FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS reactivation_campaigns_select ON reactivation_campaigns;
DROP POLICY IF EXISTS reactivation_campaigns_write  ON reactivation_campaigns;
CREATE POLICY reactivation_campaigns_select ON reactivation_campaigns FOR SELECT
  USING (is_account_member(account_id, 'agent'));
CREATE POLICY reactivation_campaigns_write ON reactivation_campaigns FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- Inscrições e envios: leitura para agentes; escrita só via service role.
DROP POLICY IF EXISTS reactivation_enrollments_select ON reactivation_enrollments;
CREATE POLICY reactivation_enrollments_select ON reactivation_enrollments FOR SELECT
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS reactivation_sends_select ON reactivation_sends;
CREATE POLICY reactivation_sends_select ON reactivation_sends FOR SELECT
  USING (is_account_member(account_id, 'agent'));
