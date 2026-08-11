-- 037_trial_expiry.sql
--
-- Every account starts life as status = 'trial' (default set in
-- migration 036), but nothing ever set a `renewal_date` for organic
-- signups — only the superadmin panel set it manually. This migration
-- makes `handle_new_user` stamp every freshly-created account with a
-- 10-day renewal_date automatically, so the trial actually has a
-- deadline unless a superadmin later overrides it.
--
-- Scope note: this fires for EVERY new auth.users row, including the
-- throwaway personal account created for someone who's about to
-- redeem a team invite. That's harmless — the redeem flow moves the
-- person to the inviter's account (a different `accounts` row,
-- untouched by this), so the abandoned personal account's expiry
-- never gets checked again for them.
--
-- Enforcement itself (blocking access once renewal_date has passed)
-- lives in src/middleware.ts, not here — this migration only sets
-- the deadline.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id, renewal_date)
  VALUES (
    COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'),
    NEW.id,
    (now() + interval '10 days')::date
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
