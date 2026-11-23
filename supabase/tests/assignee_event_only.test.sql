-- 060: o responsável só muda junto com um evento em conversation_events.
-- UPDATE direto (tela, API, service role, postgres) é recusado; os
-- caminhos com evento (transferência, automação, em massa, fluxo/I.A)
-- continuam. Conversa nova não nasce com responsável.
-- Roda com `npx supabase test db`.
begin;
select plan(16);

-- h1 dono de A; h2 atendente de A.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'lock-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'lock-agent@test.local');
update profiles p set account_id = o.account_id, account_role = 'agent'
  from profiles o
 where o.user_id = '00000000-0000-0000-0000-0000000000c1'
   and p.user_id = '00000000-0000-0000-0000-0000000000c2';
delete from accounts where owner_user_id = '00000000-0000-0000-0000-0000000000c2';

insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000cc01', user_id, account_id, '+5511900000441', 'Trava'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000c1';
insert into conversations (id, user_id, account_id, contact_id, status)
select v.id::uuid, c.user_id, c.account_id, c.id, 'open'
  from contacts c,
       (values ('00000000-0000-0000-0000-0000000c0001'), ('00000000-0000-0000-0000-0000000c0002'),
               ('00000000-0000-0000-0000-0000000c0003')) v(id)
 where c.id = '00000000-0000-0000-0000-00000000cc01';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select set_config('role', 'service_role', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.assignee(conv uuid) returns uuid language sql as $$
  select assigned_agent_id from conversations where id = conv
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- ── UPDATE / INSERT direto: recusado para todos ─────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000c2'
      where id = '00000000-0000-0000-0000-0000000c0001' $$,
  '42501', 'assignee changes must go through transfer_conversation',
  'tela (usuário logado) não troca o responsável por UPDATE direto');
select pg_temp.as_service();
select throws_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000c2'
      where id = '00000000-0000-0000-0000-0000000c0001' $$,
  '42501', 'assignee changes must go through transfer_conversation',
  'servidor (service role) também não');
select pg_temp.as_postgres();
select throws_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000c2'
      where id = '00000000-0000-0000-0000-0000000c0001' $$,
  '42501', 'assignee changes must go through transfer_conversation',
  'nem postgres');
select throws_ok(
  $$ insert into conversations (user_id, account_id, contact_id, assigned_agent_id)
     select user_id, account_id, id, '00000000-0000-0000-0000-0000000000c2'
       from contacts where id = '00000000-0000-0000-0000-00000000cc01' $$,
  '42501', 'assignee changes must go through transfer_conversation',
  'conversa nova não nasce com responsável');

-- marca forjada: id que não existe, ou evento de outra troca
select throws_ok(
  $$ select set_config('app.assignment_event_id', gen_random_uuid()::text, true);
     update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000c2'
      where id = '00000000-0000-0000-0000-0000000c0001' $$,
  '42501', 'assignee changes must go through transfer_conversation',
  'marca forjada (evento inexistente) é recusada');
select throws_ok(
  $$ select set_config('app.assignment_event_id', 'não é uuid', true);
     update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000c2'
      where id = '00000000-0000-0000-0000-0000000c0001' $$,
  '42501', 'assignee changes must go through transfer_conversation',
  'marca forjada (texto qualquer) é recusada');
select set_config('app.assignment_event_id', '', true);

-- ── Caminhos com evento continuam ───────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok(
  $$ select transfer_conversation('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000000c2', 'segue') $$,
  'transferência pela tela funciona');
select pg_temp.as_postgres();
select is(pg_temp.assignee('00000000-0000-0000-0000-0000000c0001'), '00000000-0000-0000-0000-0000000000c2'::uuid,
  'e troca o responsável');
select throws_ok(
  $$ select set_config('app.assignment_event_id',
       (select id::text from conversation_events where conversation_id = '00000000-0000-0000-0000-0000000c0001' and type <> 'note'), true);
     update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000c1'
      where id = '00000000-0000-0000-0000-0000000c0001' $$,
  '42501', 'assignee changes must go through transfer_conversation',
  'reaproveitar o evento de outra troca (outro destino) é recusado');
select set_config('app.assignment_event_id', '', true);

select pg_temp.as_service();
select lives_ok(
  $$ select record_assignment_event('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-0000000000c2', 'flow') $$,
  'fluxo / I.A (record_assignment_event) funciona');
select lives_ok(
  $$ select automation_assign_conversation(
       (select account_id from profiles where user_id = '00000000-0000-0000-0000-0000000000c1'),
       '00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-0000000000c1', 1) $$,
  'automação funciona');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok(
  $$ select conversations_bulk_assign(array['00000000-0000-0000-0000-0000000c0003']::uuid[], '00000000-0000-0000-0000-0000000000c2') $$,
  'atribuição em massa funciona');
select pg_temp.as_postgres();
select is((select count(*) from conversations
            where contact_id = '00000000-0000-0000-0000-00000000cc01'
              and assigned_agent_id is not null), 3::bigint, 'as três conversas têm responsável');
select is((select count(*) from conversations c
            where c.contact_id = '00000000-0000-0000-0000-00000000cc01'
              and not exists (select 1 from conversation_events e
                               where e.conversation_id = c.id and e.type in ('assigned', 'transferred')
                                 and e.to_user_id = c.assigned_agent_id)), 0::bigint,
  'e cada responsável atual tem o evento correspondente');

-- ── Outras alterações da conversa seguem livres ─────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok(
  $$ update conversations set status = 'pending', unread_count = 0 where id = '00000000-0000-0000-0000-0000000c0001' $$,
  'mudar status e não lidas continua permitido');
select pg_temp.as_postgres();
-- (a automação acima atribui todas as conversas do contato ao dono)
select is(pg_temp.assignee('00000000-0000-0000-0000-0000000c0001'), '00000000-0000-0000-0000-0000000000c1'::uuid,
  'sem mexer no responsável');

select * from finish();
rollback;
