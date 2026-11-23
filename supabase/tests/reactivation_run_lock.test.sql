-- Trava de rodada do cron da reativação (migration 045).
begin;
select plan(11);
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000aaaa', 60), 'primeira rodada pega a trava');
select ok(not reactivation_try_lock('00000000-0000-0000-0000-00000000bbbb', 60), 'segunda rodada simultânea não pega');
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000aaaa', 60), 'o dono pode renovar');
select reactivation_release_lock('00000000-0000-0000-0000-00000000bbbb');
select ok(not reactivation_try_lock('00000000-0000-0000-0000-00000000bbbb', 60), 'quem não é dono não solta a trava');
select reactivation_release_lock('00000000-0000-0000-0000-00000000aaaa');
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000bbbb', 60), 'depois de soltar, outra rodada pega');
update reactivation_run_lock set locked_until = now() - interval '1 second';
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000cccc', 60), 'trava vencida (processo morto) é retomada');

-- 062: a linha fixa some (limpeza manual, restauração parcial) → a trava se recria sozinha
delete from reactivation_run_lock;
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000dddd', 60), 'sem a linha fixa, a rodada recria a trava e pega');
select is((select count(*) from reactivation_run_lock), 1::bigint, 'recria uma linha só (id = 1)');
select ok(not reactivation_try_lock('00000000-0000-0000-0000-00000000eeee', 60), 'e continua sem permitir duas rodadas ao mesmo tempo');
select reactivation_release_lock('00000000-0000-0000-0000-00000000dddd');
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000eeee', 60), 'soltar e pegar de novo funciona');
select ok(not reactivation_try_lock('00000000-0000-0000-0000-00000000ffff', 60), 'com a linha de volta, segunda rodada simultânea não pega');

select * from finish();
rollback;
