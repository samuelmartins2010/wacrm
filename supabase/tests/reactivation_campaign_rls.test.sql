-- Admin pelo client só mexe em rascunhos e nunca muda status; ajustes só
-- pela API (service role). Ativar/pausar/retomar/encerrar passam pela API.
begin;
select plan(11);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'camp-admin@test.local');
-- O cadastro cria a conta com este usuário como owner (>= admin).
create temp table ctx as
  select account_id from profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
grant select on ctx to authenticated;
insert into reactivation_campaigns (id, account_id, name, status)
select '00000000-0000-0000-0000-0000000cd001'::uuid, account_id, 'rascunho', 'draft' from ctx
union all
select '00000000-0000-0000-0000-0000000cd002'::uuid, account_id, 'ativa', 'active' from ctx;

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');

select lives_ok(
  $$ insert into reactivation_campaigns (account_id, name, status) select account_id, 'novo', 'draft' from ctx $$,
  'admin cria rascunho');
select throws_ok(
  $$ insert into reactivation_campaigns (account_id, name, status) select account_id, 'pulando', 'active' from ctx $$,
  '42501', null, 'admin não cria campanha já ativa');
select lives_ok(
  $$ update reactivation_campaigns set name = 'rascunho editado' where id = '00000000-0000-0000-0000-0000000cd001' $$,
  'admin edita rascunho');
select throws_ok(
  $$ update reactivation_campaigns set status = 'active' where id = '00000000-0000-0000-0000-0000000cd001' $$,
  '42501', null, 'admin não ativa rascunho pelo client');
select is_empty(
  $$ update reactivation_campaigns set steps = '[]' where id = '00000000-0000-0000-0000-0000000cd002' returning id $$,
  'admin não edita toques de campanha ativa');
select is_empty(
  $$ update reactivation_campaigns set status = 'paused' where id = '00000000-0000-0000-0000-0000000cd002' returning id $$,
  'admin não pausa pelo client');
select is_empty(
  $$ delete from reactivation_campaigns where id = '00000000-0000-0000-0000-0000000cd002' returning id $$,
  'admin não apaga campanha ativa');
select lives_ok(
  $$ delete from reactivation_campaigns where id = '00000000-0000-0000-0000-0000000cd001' $$,
  'admin apaga rascunho');
select throws_ok(
  $$ insert into reactivation_settings (account_id, daily_limit) select account_id, 999 from ctx $$,
  '42501', null, 'admin não grava ajustes pelo client');
reset role;

-- Sistema/API (service role) continua podendo tudo, mas o banco recusa
-- ajustes inválidos.
select throws_ok(
  $$ insert into reactivation_settings (account_id, daily_limit) select account_id, 5000 from ctx $$,
  '23514', null, 'limite diário acima do máximo é recusado no banco');
select throws_ok(
  $$ insert into reactivation_settings (account_id, band_late_days, band_cooling_days, band_gone_days)
     select account_id, 90, 60, 120 from ctx $$,
  '23514', null, 'faixas fora de ordem são recusadas no banco');

select * from finish();
rollback;
