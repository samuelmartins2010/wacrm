-- 039_reactivation_review_fixes.sql
-- Correções da revisão final da Reativação.

-- 1) Limite diário conta tentativas, não recibos de entrega/leitura:
--    attempted_at só muda quando o runner tenta enviar.
ALTER TABLE reactivation_sends
  ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ;
UPDATE reactivation_sends SET attempted_at = created_at WHERE attempted_at IS NULL;
ALTER TABLE reactivation_sends ALTER COLUMN attempted_at SET DEFAULT NOW();
ALTER TABLE reactivation_sends ALTER COLUMN attempted_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reactivation_sends_account_attempted
  ON reactivation_sends(account_id, attempted_at);

-- 2) "Recebeu mensagem nossa nos últimos N dias" passa a incluir
--    transmissões (broadcast_recipients não grava em messages).
CREATE OR REPLACE FUNCTION reactivation_candidates(p_account_id UUID)
RETURNS TABLE (
  contact_id               UUID,
  name                     TEXT,
  phone                    TEXT,
  company                  TEXT,
  do_not_contact           BOOLEAN,
  last_inbound_at          TIMESTAMPTZ,
  tag_ids                  UUID[],
  has_active_enrollment    BOOLEAN,
  last_enrollment_ended_at TIMESTAMPTZ,
  last_outbound_at         TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.phone,
    c.company,
    c.do_not_contact,
    c.last_inbound_at,
    COALESCE(
      (SELECT array_agg(ct.tag_id) FROM contact_tags ct WHERE ct.contact_id = c.id),
      '{}'::uuid[]
    ),
    EXISTS (
      SELECT 1 FROM reactivation_enrollments e
      WHERE e.contact_id = c.id AND e.status IN ('pending', 'active')
    ),
    (SELECT MAX(e.ended_at) FROM reactivation_enrollments e WHERE e.contact_id = c.id),
    GREATEST(
      (
        SELECT MAX(m.created_at)
        FROM conversations cv
        JOIN messages m ON m.conversation_id = cv.id
        WHERE cv.contact_id = c.id AND m.sender_type IN ('agent', 'bot')
      ),
      (
        SELECT MAX(COALESCE(br.sent_at, br.created_at))
        FROM broadcast_recipients br
        WHERE br.contact_id = c.id AND br.status NOT IN ('pending', 'failed')
      )
    )
  FROM contacts c
  WHERE c.account_id = p_account_id
    AND c.last_inbound_at IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION reactivation_candidates(UUID) TO authenticated, service_role;
