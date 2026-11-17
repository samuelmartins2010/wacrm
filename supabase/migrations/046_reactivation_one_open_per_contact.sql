-- 046_reactivation_one_open_per_contact.sql
-- Anti-objetivo da spec: um contato em duas campanhas de reativação ao
-- mesmo tempo. Antes era só uma checagem no momento da aprovação; agora
-- o banco garante.

-- Se já houver duplicatas abertas, mantém a inscrição mais antiga e
-- cancela as demais (registrando o motivo) antes de criar o índice.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY created_at, id) AS rn
    FROM reactivation_enrollments
   WHERE status IN ('pending', 'active')
)
UPDATE reactivation_enrollments e
   SET status = 'cancelled',
       ended_at = NOW(),
       next_run_at = NULL,
       end_reason = 'duplicate_open_enrollment',
       updated_at = NOW()
  FROM ranked r
 WHERE r.id = e.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reactivation_one_open_per_contact
  ON reactivation_enrollments (contact_id)
  WHERE status IN ('pending', 'active');
