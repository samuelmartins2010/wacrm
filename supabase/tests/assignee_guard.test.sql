-- 059: o responsável de uma conversa precisa ser dono, admin ou atendente
-- da conta da conversa. Vale para todos os caminhos (UPDATE direto da
-- tela/API, transferência, automação, fluxo/I.A, em massa).
-- Roda com `npx supabase test db`.
begin;
select plan(20);

-- g1 dono da conta A; g2 atendente de A; g3 só visualiza em A;
-- g9 dono da própria conta (B).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'guard-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'guard-agent@test.local'),
  ('00000000-0000-0000-0000-0000000000f3', 'guard-viewer@test.local'),
  ('00000000-0000-0000-0000-0000000000f9', 'guard-other@test.local');
update profiles p
   set account_id = o.account_id,
       account_role = case p.user_id when '00000000-0000-0000-0000-0000000000f2' then 'agent'
                                     else 'viewer' end::account_role_enum
  from profiles o
 where o.user_id = '00000000-0000-0000-0000-0000000000f1'
   and p.user_id in ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3');

insert into contacts (id, user_id, account_id, phone, name)
select v.id::uuid, user_id, account_id, v.phone, 'Guarda'
  from profiles,
       (values ('00000000-0000-0000-0000-00000000fc01', '+5511900000991'),
               ('00000000-0000-0000-0000-00000000fc02', '+5511900000992')) v(id, phone)
 where user_id = '00000000-0000-0000-0000-0000000000f1';
-- f001 principal; f002 e f003 para o lote; todas de A, sem responsável
insert into conversations (id, user_id, account_id, contact_id, status)
select v.id::uuid, c.user_id, c.account_id, v.contact::uuid, 'open'
  from contacts c,
       (values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000fc01'),
               ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000fc02'),
               ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000fc02')) v(id, contact)
 where c.id = '00000000-0000-0000-0000-00000000fc01';

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

-- ── UPDATE / INSERT direto (tela, API, fluxo, I.A) ──────────────────
select lives_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000f2'
      where id = '00000000-0000-0000-0000-00000000f001' $$,
  'atendente da conta pode ser responsável');
select lives_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000f1'
      where id = '00000000-0000-0000-0000-00000000f001' $$,
  'dono da conta pode ser responsável');
select throws_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000f3'
      where id = '00000000-0000-0000-0000-00000000f001' $$,
  '22023', 'assignee has a view-only role in this account',
  'quem só visualiza não pode ser responsável (UPDATE direto)');
select throws_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000f9'
      where id = '00000000-0000-0000-0000-00000000f001' $$,
  '22023', 'assignee is not a member of this account',
  'usuário de outra conta não pode ser responsável (UPDATE direto)');
select throws_ok(
  $$ insert into conversations (user_id, account_id, contact_id, assigned_agent_id)
     select user_id, account_id, id, '00000000-0000-0000-0000-0000000000f9'
       from contacts where id = '00000000-0000-0000-0000-00000000fc02' $$,
  '22023', 'assignee is not a member of this account',
  'conversa nova com responsável de outra conta é recusada (INSERT)');
select lives_ok(
  $$ update conversations set assigned_agent_id = null
      where id = '00000000-0000-0000-0000-00000000f001' $$,
  'remover o responsável continua permitido');

-- Pelo cliente logado (é o caminho da tela de hoje)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select throws_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000f9'
      where id = '00000000-0000-0000-0000-00000000f001' $$,
  '22023', 'assignee is not a member of this account',
  'dono logado não consegue pôr alguém de outra conta pela tela');
select throws_ok(
  $$ update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000f3'
      where id = '00000000-0000-0000-0000-00000000f001' $$,
  '22023', 'assignee has a view-only role in this account',
  'dono logado não consegue pôr quem só visualiza pela tela');

-- ── Transferência (RPC) ─────────────────────────────────────────────
select throws_ok(
  $$ select transfer_conversation('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000f3', 'para o viewer') $$,
  '22023', 'assignee has a view-only role in this account',
  'transferir para quem só visualiza é recusado');
select pg_temp.as_postgres();
select is((select count(*) from conversation_events where conversation_id = '00000000-0000-0000-0000-00000000f001'),
  0::bigint, 'transferência recusada não deixa nota nem evento');

-- ── Em massa ────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select throws_ok(
  $$ select conversations_bulk_assign(array['00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000f003']::uuid[],
                                      '00000000-0000-0000-0000-0000000000f3') $$,
  '22023', 'assignee has a view-only role in this account',
  'atribuição em massa para quem só visualiza é recusada');
select pg_temp.as_postgres();
select is((select count(*) from conversations
            where id in ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000f003')
              and assigned_agent_id is not null),
  0::bigint, 'atribuição em massa recusada não muda nenhuma conversa');

-- ── Automação, fluxo e I.A (servidor) ───────────────────────────────
select pg_temp.as_service();
select throws_ok(
  $$ select automation_assign_conversation(
       (select account_id from profiles where user_id = '00000000-0000-0000-0000-0000000000f1'),
       '00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-0000000000f3', 1) $$,
  '22023', 'assignee has a view-only role in this account',
  'automação não atribui para quem só visualiza');
select throws_ok(
  $$ select record_assignment_event('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000f9', 'flow') $$,
  '22023', 'assignee is not a member of this account',
  'fluxo/I.A não atribui para usuário de outra conta');
select throws_ok(
  $$ select record_assignment_event('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000f3', 'ai') $$,
  '22023', 'assignee has a view-only role in this account',
  'fluxo/I.A não atribui para quem só visualiza');

-- ── Handoff da I.A não tira a conversa de quem acabou de assumir ────
-- p_only_if_unassigned: só atribui se, com a linha travada, ainda não há
-- responsável (a I.A leu a conversa segundos antes de chamar).
select pg_temp.as_postgres();
update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000f1'
 where id = '00000000-0000-0000-0000-00000000f003';
select pg_temp.as_service();
select is(
  (select record_assignment_event('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000f2',
                                  'ai', null, 'resumo', p_only_if_unassigned => true)),
  null::conversation_events, 'I.A com p_only_if_unassigned não mexe em conversa que já tem responsável');
select pg_temp.as_postgres();
select is((select count(*) from conversation_events where conversation_id = '00000000-0000-0000-0000-00000000f003'),
  0::bigint, 'e não grava nota nem evento');
update conversations set assigned_agent_id = null where id = '00000000-0000-0000-0000-00000000f003';
select pg_temp.as_service();
select is(
  (select (record_assignment_event('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000f2',
                                   'ai', null, null, p_only_if_unassigned => true)).type),
  'assigned', 'sem responsável, a I.A atribui normalmente');

-- ── Responsável antigo que virou viewer ─────────────────────────────
-- A trava só olha a troca: uma conversa encerrada (que a 059 não mexe
-- quando o papel muda) continua podendo ser editada.
select pg_temp.as_postgres();
update conversations set assigned_agent_id = '00000000-0000-0000-0000-0000000000f2', status = 'closed'
 where id = '00000000-0000-0000-0000-00000000f002';
update profiles set account_role = 'viewer' where user_id = '00000000-0000-0000-0000-0000000000f2';
select lives_ok(
  $$ update conversations set unread_count = 0 where id = '00000000-0000-0000-0000-00000000f002' $$,
  'conversa encerrada de quem virou viewer ainda pode ser editada');
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000f002'), '00000000-0000-0000-0000-0000000000f2'::uuid,
  'e o responsável antigo é mantido até alguém trocar');

select * from finish();
rollback;
