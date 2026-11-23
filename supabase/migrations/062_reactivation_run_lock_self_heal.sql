-- 062: a trava de rodada da Reativação (045) se recria sozinha.
--
-- A trava é uma linha fixa (id = 1) em reactivation_run_lock. Se ela sumir
-- (limpeza manual, restauração parcial do banco), reactivation_try_lock
-- devolvia false para sempre e o cron nunca mais rodava ({locked: true}).
-- Agora a função recria a linha (INSERT ... ON CONFLICT DO NOTHING) antes
-- de tentar pegar a trava.
--
-- Duas rodadas ao mesmo tempo continuam impossíveis: se duas chamadas
-- recriam a linha juntas, a segunda espera a primeira terminar (conflito
-- de chave) e depois o UPDATE condicional encontra a trava ocupada. A
-- linha recriada nasce livre (holder null, locked_until -infinity), igual
-- à da 045. Mesma assinatura e mesmas permissões (só service role).

CREATE OR REPLACE FUNCTION reactivation_try_lock(p_holder UUID, p_ttl_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_got BOOLEAN;
BEGIN
  INSERT INTO reactivation_run_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

  UPDATE reactivation_run_lock
     SET holder = p_holder,
         locked_until = NOW() + make_interval(secs => p_ttl_seconds)
   WHERE id = 1
     AND (locked_until < NOW() OR holder = p_holder)
  RETURNING true INTO v_got;

  RETURN coalesce(v_got, false);
END;
$$;

REVOKE ALL ON FUNCTION reactivation_try_lock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reactivation_try_lock(UUID, INTEGER) TO service_role;
