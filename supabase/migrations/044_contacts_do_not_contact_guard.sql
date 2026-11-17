-- 044_contacts_do_not_contact_guard.sql
-- "Não quer receber campanhas" (decisão D2):
--   * qualquer membro (agent+) pode MARCAR (false → true);
--   * só admin pode DESMARCAR (true → false);
--   * toda mudança grava quem fez e quando — o banco carimba, ninguém
--     edita do_not_contact_at / _source / _by diretamente.
-- O RLS de contacts (017) permite UPDATE para agent, então a regra
-- precisa viver num trigger. Chamadas sem usuário (service role: webhook
-- "SAIR", jobs) passam direto e definem a origem elas mesmas.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS do_not_contact_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION contacts_guard_do_not_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;  -- service role / sistema
  END IF;

  IF NEW.do_not_contact IS DISTINCT FROM OLD.do_not_contact THEN
    IF OLD.do_not_contact AND NOT NEW.do_not_contact
       AND NOT is_account_member(NEW.account_id, 'admin') THEN
      RAISE EXCEPTION 'Somente administradores podem desmarcar "não quer receber campanhas".'
        USING ERRCODE = '42501';
    END IF;
    NEW.do_not_contact_at := NOW();
    NEW.do_not_contact_by := v_uid;
    NEW.do_not_contact_source := 'manual';
    RETURN NEW;
  END IF;

  IF NEW.do_not_contact_at IS DISTINCT FROM OLD.do_not_contact_at
     OR NEW.do_not_contact_source IS DISTINCT FROM OLD.do_not_contact_source
     OR NEW.do_not_contact_by IS DISTINCT FROM OLD.do_not_contact_by THEN
    RAISE EXCEPTION 'Os dados de auditoria de "não quer receber campanhas" são gravados automaticamente.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_guard_do_not_contact ON contacts;
CREATE TRIGGER contacts_guard_do_not_contact
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION contacts_guard_do_not_contact();
