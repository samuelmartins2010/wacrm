-- Um contato só pode estar em uma campanha de reativação aberta por vez.
begin;
select plan(4);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'one-camp@test.local');
insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000c0b1', '00000000-0000-0000-0000-0000000000b1', account_id, '+5511900000099', 'Um por vez'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
insert into reactivation_campaigns (id, account_id, name, status)
select x.id, p.account_id, x.name, 'active'
  from profiles p,
       (values ('00000000-0000-0000-0000-0000000ca001'::uuid, 'A'), ('00000000-0000-0000-0000-0000000ca002'::uuid, 'B')) x(id, name)
 where p.user_id = '00000000-0000-0000-0000-0000000000b1';

insert into reactivation_enrollments (account_id, campaign_id, contact_id, status)
select account_id, '00000000-0000-0000-0000-0000000ca001', '00000000-0000-0000-0000-00000000c0b1', 'pending'
  from contacts where id = '00000000-0000-0000-0000-00000000c0b1';

select throws_ok(
  $$ insert into reactivation_enrollments (account_id, campaign_id, contact_id, status)
     select account_id, '00000000-0000-0000-0000-0000000ca002', id, 'pending'
       from contacts where id = '00000000-0000-0000-0000-00000000c0b1' $$,
  '23505', null, 'segunda inscrição aberta do mesmo contato é recusada');

select lives_ok(
  $$ insert into reactivation_enrollments (account_id, campaign_id, contact_id, status)
     select account_id, '00000000-0000-0000-0000-0000000ca002', id, 'removed'
       from contacts where id = '00000000-0000-0000-0000-00000000c0b1' $$,
  'inscrição fechada (removed) em outra campanha é permitida');

update reactivation_enrollments set status = 'completed', ended_at = now()
 where campaign_id = '00000000-0000-0000-0000-0000000ca001';
update reactivation_enrollments set status = 'pending', ended_at = null
 where campaign_id = '00000000-0000-0000-0000-0000000ca002';
select is(
  (select status from reactivation_enrollments where campaign_id = '00000000-0000-0000-0000-0000000ca002'),
  'pending', 'depois que a primeira termina, o contato pode entrar em outra');

select has_index('public', 'reactivation_enrollments', 'uq_reactivation_one_open_per_contact', 'índice único parcial existe');

select * from finish();
rollback;
