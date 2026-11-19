-- Trava de rodada do cron da reativação (migration 045).
begin;
select plan(6);
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000aaaa', 60), 'primeira rodada pega a trava');
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000bbbb', 60), 'segunda rodada simultânea não pega');
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000aaaa', 60), 'o dono pode renovar');
select reactivation_release_lock('00000000-0000-0000-0000-00000000bbbb');
select ok(not reactivation_try_lock('00000000-0000-0000-0000-00000000bbbb', 60), 'quem não é dono não solta a trava');
select reactivation_release_lock('00000000-0000-0000-0000-00000000aaaa');
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000bbbb', 60), 'depois de soltar, outra rodada pega');
update reactivation_run_lock set locked_until = now() - interval '1 second';
select ok(reactivation_try_lock('00000000-0000-0000-0000-00000000cccc', 60), 'trava vencida (processo morto) é retomada');
select * from finish();
rollback;
