-- 059 (H): remover um membro da conta ou mudar o papel dele para só
-- visualização devolve as conversas ABERTAS dele para "Sem dono", com
-- evento de remoção do responsável. Encerradas ficam como estão.
-- Roda com `npx supabase test db`.
begin;
select plan(14);

-- m1 dono de A; m2 e m3 atendentes de A; m4 admin de A.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'mc-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'mc-demoted@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'mc-removed@test.local'),
  ('00000000-0000-0000-0000-0000000000b4', 'mc-admin@test.local');
update profiles p
   set account_id = o.account_id,
       account_role = case p.user_id when '00000000-0000-0000-0000-0000000000b4' then 'admin' else 'agent' end::account_role_enum
  from profiles o
 where o.user_id = '00000000-0000-0000-0000-0000000000b1'
   and p.user_id in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b3',
                     '00000000-0000-0000-0000-0000000000b4');

-- Como num convite aceito: a conta pessoal de quem entrou deixa de existir.
delete from accounts where owner_user_id in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b4');

insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000bc01', user_id, account_id, '+5511900000551', 'Membros'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
-- b0a1/b0a2: m2 aberta e pendente · b0a3: m2 encerrada
-- b0b1: m3 aberta · b0b2: m3 encerrada · b0c1: m4 aberta
insert into conversations (id, user_id, account_id, contact_id, status, assigned_agent_id)
select v.id::uuid, c.user_id, c.account_id, c.id, v.st, v.agent::uuid
  from contacts c,
       (values ('00000000-0000-0000-0000-00000000b0a1', 'open',    '00000000-0000-0000-0000-0000000000b2'),
               ('00000000-0000-0000-0000-00000000b0a2', 'pending', '00000000-0000-0000-0000-0000000000b2'),
               ('00000000-0000-0000-0000-00000000b0a3', 'closed',  '00000000-0000-0000-0000-0000000000b2'),
               ('00000000-0000-0000-0000-00000000b0b1', 'open',    '00000000-0000-0000-0000-0000000000b3'),
               ('00000000-0000-0000-0000-00000000b0b2', 'closed',  '00000000-0000-0000-0000-0000000000b3'),
               ('00000000-0000-0000-0000-00000000b0c1', 'open',    '00000000-0000-0000-0000-0000000000b4')) v(id, st, agent)
 where c.id = '00000000-0000-0000-0000-00000000bc01';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'postgres', true);
$$;
create function pg_temp.assignee(conv uuid) returns uuid language sql as $$
  select assigned_agent_id from conversations where id = conv
$$;
create function pg_temp.unassigned(conv uuid) returns bigint language sql as $$
  select count(*) from conversation_events where conversation_id = conv and type = 'unassigned'
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- ── Vira só visualização (pela tela de membros) ─────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select set_member_role('00000000-0000-0000-0000-0000000000b2', 'viewer') $$,
  'dono muda o atendente para só visualização');
select pg_temp.as_postgres();
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000b0a1'), null, 'viewer: conversa aberta vai para Sem dono');
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000b0a2'), null, 'viewer: conversa pendente também');
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000b0a3'), '00000000-0000-0000-0000-0000000000b2'::uuid,
  'viewer: conversa encerrada fica como está');
select results_eq(
  $$ select type, actor_kind, actor_user_id, from_user_id, to_user_id from conversation_events
      where conversation_id = '00000000-0000-0000-0000-00000000b0a1' $$,
  $$ values ('unassigned'::text, 'system'::text, '00000000-0000-0000-0000-0000000000b1'::uuid,
             '00000000-0000-0000-0000-0000000000b2'::uuid, null::uuid) $$,
  'viewer: evento de remoção do responsável, feito pelo sistema a pedido do dono');
select is(pg_temp.unassigned('00000000-0000-0000-0000-00000000b0a3'), 0::bigint, 'viewer: encerrada não ganha evento');

-- ── Removido da conta ───────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select remove_account_member('00000000-0000-0000-0000-0000000000b3') $$,
  'dono remove o atendente da conta');
select pg_temp.as_postgres();
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000b0b1'), null, 'removido: conversa aberta vai para Sem dono');
select is(pg_temp.unassigned('00000000-0000-0000-0000-00000000b0b1'), 1::bigint, 'removido: com evento de remoção do responsável');
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000b0b2'), '00000000-0000-0000-0000-0000000000b3'::uuid,
  'removido: conversa encerrada fica como está');

-- ── Outras mudanças de papel não mexem ──────────────────────────────
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select set_member_role('00000000-0000-0000-0000-0000000000b4', 'agent') $$, 'admin vira atendente');
select pg_temp.as_postgres();
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000b0c1'), '00000000-0000-0000-0000-0000000000b4'::uuid,
  'de admin para atendente o responsável continua');
select is(pg_temp.unassigned('00000000-0000-0000-0000-00000000b0c1'), 0::bigint, 'e sem evento');

-- Voltar de viewer para atendente não devolve nada sozinho
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select set_member_role('00000000-0000-0000-0000-0000000000b2', 'agent');
select pg_temp.as_postgres();
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000b0a1'), null, 'voltar a ser atendente não devolve as conversas');

select * from finish();
rollback;
