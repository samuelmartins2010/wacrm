-- 045_reactivation_run_lock.sql
-- Uma rodada do cron da reativação por vez.
--
-- Por que não pg_try_advisory_lock: o runner fala com o banco pelo
-- PostgREST (supabase-js); cada RPC pode cair numa conexão diferente
-- do pool. A trava de sessão ficaria presa à conexão que a pegou e o
-- "soltar" poderia rodar em outra — vazando a trava. Uma linha com
-- prazo (lease) dá a mesma semântica de "try lock" sem depender da
-- conexão: pegar é um UPDATE atômico que só passa se a trava estiver
-- livre/vencida; se o processo morrer, ela vence sozinha.

CREATE TABLE IF NOT EXISTS reactivation_run_lock (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  holder       UUID,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT '-infinity'
);
INSERT INTO reactivation_run_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE reactivation_run_lock ENABLE ROW LEVEL SECURITY;  -- sem policies: só service role

CREATE OR REPLACE FUNCTION reactivation_try_lock(p_holder UUID, p_ttl_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH got AS (
    UPDATE reactivation_run_lock
       SET holder = p_holder,
           locked_until = NOW() + make_interval(secs => p_ttl_seconds)
     WHERE id = 1
       AND (locked_until < NOW() OR holder = p_holder)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM got);
$$;

CREATE OR REPLACE FUNCTION reactivation_release_lock(p_holder UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE reactivation_run_lock
     SET holder = NULL, locked_until = '-infinity'
   WHERE id = 1 AND holder = p_holder;
$$;

REVOKE ALL ON FUNCTION reactivation_try_lock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reactivation_release_lock(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reactivation_try_lock(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION reactivation_release_lock(UUID) TO service_role;
