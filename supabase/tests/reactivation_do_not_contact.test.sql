-- "Não quer receber campanhas" (D2): agent pode marcar, só admin desmarca,
-- e toda mudança grava quem fez e quando. Roda com `npx supabase test db`.
begin;
select plan(12);

-- Usuários de teste: o cadastro (handle_new_user) cria conta + perfil owner.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'dnc-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'dnc-agent@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'dnc-admin@test.local');
update profiles p
   set account_id = o.account_id,
       account_role = case p.user_id when '00000000-0000-0000-0000-0000000000a2' then 'agent'::account_role_enum
                                     else 'admin'::account_role_enum end
  from profiles o
 where o.user_id = '00000000-0000-0000-0000-0000000000a1'
   and p.user_id in ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3');

insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', account_id, '+5511900000001', 'DNC teste'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000a1';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- 1) Agent marca: funciona e grava quem/quando/origem.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$ update contacts set do_not_contact = true where id = '00000000-0000-0000-0000-00000000c001' $$,
  'agent consegue marcar não quer receber');
reset role;
select is(
  (select do_not_contact_by from contacts where id = '00000000-0000-0000-0000-00000000c001'),
  '00000000-0000-0000-0000-0000000000a2'::uuid, 'marcação grava quem fez');
select ok(
  (select do_not_contact_at is not null and do_not_contact_source = 'manual' from contacts where id = '00000000-0000-0000-0000-00000000c001'),
  'marcação grava quando e origem manual');

-- 2) Agent não desmarca.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ update contacts set do_not_contact = false where id = '00000000-0000-0000-0000-00000000c001' $$,
  '42501', null, 'agent não consegue desmarcar');
-- 3) Agent não mexe nos campos de auditoria.
select throws_ok(
  $$ update contacts set do_not_contact_at = now() - interval '1 year' where id = '00000000-0000-0000-0000-00000000c001' $$,
  '42501', null, 'agent não altera do_not_contact_at');
select throws_ok(
  $$ update contacts set do_not_contact_source = 'reativacao_sair' where id = '00000000-0000-0000-0000-00000000c001' $$,
  '42501', null, 'agent não altera do_not_contact_source');
-- 4) Agent continua editando o resto do contato.
select lives_ok(
  $$ update contacts set name = 'DNC teste editado' where id = '00000000-0000-0000-0000-00000000c001' $$,
  'agent edita outros campos normalmente');
reset role;
select ok(
  (select do_not_contact from contacts where id = '00000000-0000-0000-0000-00000000c001'),
  'contato continua marcado depois das tentativas do agent');

-- 5) Admin desmarca e a mudança é registrada.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  $$ update contacts set do_not_contact = false where id = '00000000-0000-0000-0000-00000000c001' $$,
  'admin consegue desmarcar');
-- 6) Nem o admin forja a auditoria diretamente.
select throws_ok(
  $$ update contacts set do_not_contact_by = '00000000-0000-0000-0000-0000000000a2' where id = '00000000-0000-0000-0000-00000000c001' $$,
  '42501', null, 'admin não forja do_not_contact_by');
reset role;
select is(
  (select do_not_contact_by from contacts where id = '00000000-0000-0000-0000-00000000c001'),
  '00000000-0000-0000-0000-0000000000a3'::uuid, 'desmarcação grava o admin');

-- 7) Sistema (service role / webhook SAIR, sem usuário) define a origem.
select set_config('request.jwt.claims', '', true);
update contacts set do_not_contact = true, do_not_contact_source = 'reativacao_sair', do_not_contact_at = now()
 where id = '00000000-0000-0000-0000-00000000c001';
select is(
  (select do_not_contact_source from contacts where id = '00000000-0000-0000-0000-00000000c001'),
  'reativacao_sair', 'webhook (sem usuário) grava origem reativacao_sair');

select * from finish();
rollback;
