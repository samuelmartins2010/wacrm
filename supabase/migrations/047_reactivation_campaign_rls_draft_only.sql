-- 047_reactivation_campaign_rls_draft_only.sql
-- A aprovação não pode ser pulada pelo client (supabase-js no navegador):
--   * admin cria/edita/apaga só RASCUNHOS e nunca muda o status;
--   * ativar, pausar, retomar e encerrar passam só pela API, que usa
--     service role (fora do RLS) depois de requireRole('admin');
--   * reactivation_settings só pela API (PUT /api/reactivation/settings),
--     e o banco recusa valores inválidos mesmo vindos da API.

DROP POLICY IF EXISTS reactivation_campaigns_write  ON reactivation_campaigns;
DROP POLICY IF EXISTS reactivation_campaigns_insert ON reactivation_campaigns;
DROP POLICY IF EXISTS reactivation_campaigns_update ON reactivation_campaigns;
DROP POLICY IF EXISTS reactivation_campaigns_delete ON reactivation_campaigns;

CREATE POLICY reactivation_campaigns_insert ON reactivation_campaigns FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'admin')
    AND status = 'draft' AND approved_by IS NULL AND approved_at IS NULL AND finished_at IS NULL
  );

CREATE POLICY reactivation_campaigns_update ON reactivation_campaigns FOR UPDATE
  USING (is_account_member(account_id, 'admin') AND status = 'draft')
  WITH CHECK (
    is_account_member(account_id, 'admin')
    AND status = 'draft' AND approved_by IS NULL AND approved_at IS NULL AND finished_at IS NULL
  );

CREATE POLICY reactivation_campaigns_delete ON reactivation_campaigns FOR DELETE
  USING (is_account_member(account_id, 'admin') AND status = 'draft');

-- Ajustes: só leitura pelo client.
DROP POLICY IF EXISTS reactivation_settings_write ON reactivation_settings;

-- Validação no banco (a API valida antes; isto é a última barreira).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reactivation_settings_daily_limit_max') THEN
    ALTER TABLE reactivation_settings
      ADD CONSTRAINT reactivation_settings_daily_limit_max CHECK (daily_limit BETWEEN 1 AND 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reactivation_settings_bands_order') THEN
    ALTER TABLE reactivation_settings
      ADD CONSTRAINT reactivation_settings_bands_order
      CHECK (band_late_days < band_cooling_days AND band_cooling_days < band_gone_days);
  END IF;
END $$;
