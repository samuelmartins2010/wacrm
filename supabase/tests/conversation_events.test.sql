-- Inbox (058): notas internas e trocas de responsável em conversation_events.
-- Só funções SECURITY DEFINER gravam; transferência com observação é
-- nota + troca na mesma transação e a observação vai na notificação.
-- Roda com `npx supabase test db`.
begin;
select plan(46);

-- Usuários: e1 é dono da conta A; e2 e e3 viram atendentes (agent) de A;
-- e9 fica na própria conta (B).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'ev-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'ev-agent1@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'ev-agent2@test.local'),
  ('00000000-0000-0000-0000-0000000000e9', 'ev-other@test.local');
update profiles p
   set account_id = o.account_id, account_role = 'agent'::account_role_enum, full_name = 'Agente ' || right(p.user_id::text, 2)
  from profiles o
 where o.user_id = '00000000-0000-0000-0000-0000000000e1'
   and p.user_id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');

insert into contacts (id, user_id, account_id, phone, name)
select v.id::uuid, user_id, account_id, v.phone, v.name
  from profiles,
       (values ('00000000-0000-0000-0000-00000000ec01', '+5511900000881', 'Maria Eventos'),
               ('00000000-0000-0000-0000-00000000ec02', '+5511900000882', 'Automação'),
               ('00000000-0000-0000-0000-00000000ec03', '+5511900000883', 'Lote')) v(id, phone, name)
 where user_id = '00000000-0000-0000-0000-0000000000e1';
-- conversa principal (sem responsável), uma para automação e duas para o lote
insert into conversations (id, user_id, account_id, contact_id, status, last_message_text, last_message_at, unread_count, awaiting_since)
select v.id::uuid, c.user_id, c.account_id, v.contact::uuid, 'open', 'oi', '2026-11-19 10:00+00', 3, '2026-11-19 10:00+00'
  from contacts c,
       (values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000ec01'),
               ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000ec02'),
               ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000ec03'),
               ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000ec03')) v(id, contact)
 where c.id = '00000000-0000-0000-0000-00000000ec01';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select set_config('role', 'service_role', true);
$$;
create function pg_temp.n_events(conv uuid) returns bigint language sql as $$
  select count(*) from conversation_events where conversation_id = conv
$$;
create function pg_temp.assignee(conv uuid) returns uuid language sql as $$
  select assigned_agent_id from conversations where id = conv
$$;
create function pg_temp.n_notifs(uid uuid) returns bigint language sql as $$
  select count(*) from notifications where user_id = uid
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

create temp table snap as
  select last_message_at, last_message_text, unread_count, awaiting_since
    from conversations where id = '00000000-0000-0000-0000-00000000e001';

-- ===== Nota avulsa =====
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');

select results_eq(
  $$ select type, actor_kind, actor_user_id, body
       from add_conversation_note('00000000-0000-0000-0000-00000000e001', 'primeira nota') $$,
  $$ values ('note'::text, 'user'::text, '00000000-0000-0000-0000-0000000000e2'::uuid, 'primeira nota'::text) $$,
  'atendente grava nota: type note, actor_kind user, actor_user_id = quem chamou');

select is(
  (select e.account_id from conversation_events e where e.body = 'primeira nota'),
  (select account_id from profiles where user_id = '00000000-0000-0000-0000-0000000000e1'),
  'account_id da nota vem da conversa');

select throws_ok(
  $$ select add_conversation_note('00000000-0000-0000-0000-00000000e001', E'   \n  \t\r\n ') $$,
  '23514', null, 'nota só com espaços e quebras de linha é recusada');

select throws_ok(
  $$ select add_conversation_note('00000000-0000-0000-0000-00000000e001', '') $$,
  '23514', null, 'nota vazia é recusada');

select throws_ok(
  $$ select add_conversation_note('00000000-0000-0000-0000-00000000e001', null) $$,
  '23514', null, 'nota nula é recusada');

select throws_ok(
  $$ select add_conversation_note('00000000-0000-0000-0000-00000000e001', repeat('a', 2001)) $$,
  '23514', null, 'nota com 2.001 caracteres é recusada');

select lives_ok(
  $$ select add_conversation_note('00000000-0000-0000-0000-00000000e001', repeat('b', 2000)) $$,
  'nota com 2.000 caracteres é aceita');

select is(
  (select body from add_conversation_note('00000000-0000-0000-0000-00000000e001', E'\n  linha 1\nlinha 2  \r\n')),
  E'linha 1\nlinha 2',
  'nota com quebras de linha guarda as quebras do meio e tira espaços/quebras das pontas');

reset role;
select is(
  (select row(last_message_at, last_message_text, unread_count, awaiting_since)::text
     from conversations where id = '00000000-0000-0000-0000-00000000e001'),
  (select row(last_message_at, last_message_text, unread_count, awaiting_since)::text from snap),
  'nota não mexe em last_message_at, last_message_text, unread_count nem awaiting_since');
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000e001'), null, 'nota não atribui a conversa');

-- ===== Transferência com observação (primeira atribuição) =====
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
create temp table t1 as
  select * from transfer_conversation('00000000-0000-0000-0000-00000000e001',
                                      '00000000-0000-0000-0000-0000000000e3', 'obs: cliente quer 2ª via');
reset role;

select results_eq(
  $$ select type, actor_kind, actor_user_id, from_user_id, to_user_id, body from t1 $$,
  $$ values ('assigned'::text, 'user'::text, '00000000-0000-0000-0000-0000000000e2'::uuid, null::uuid,
             '00000000-0000-0000-0000-0000000000e3'::uuid, null::text) $$,
  'primeira atribuição devolve evento assigned (sem responsável anterior)');

select is(
  (select n.body from conversation_events n join t1 on n.id = t1.note_id where n.type = 'note'),
  'obs: cliente quer 2ª via',
  'evento de troca aponta (note_id) para a nota da observação');

select is(
  (select count(*) from conversation_events where conversation_id = '00000000-0000-0000-0000-00000000e001'
      and body = 'obs: cliente quer 2ª via'),
  1::bigint, 'a observação vira exatamente uma nota');

select is(pg_temp.assignee('00000000-0000-0000-0000-00000000e001'), '00000000-0000-0000-0000-0000000000e3'::uuid,
  'transferência troca assigned_agent_id');

select is(pg_temp.n_notifs('00000000-0000-0000-0000-0000000000e3'), 1::bigint, 'quem recebe ganha uma notificação');

select matches(
  (select body from notifications where user_id = '00000000-0000-0000-0000-0000000000e3'),
  ': obs: cliente quer 2ª via$',
  'notificação leva a observação no corpo');

-- ===== Transferir para quem já é o responsável =====
create temp table before_same as
  select pg_temp.n_events('00000000-0000-0000-0000-00000000e001') as n;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select is(
  (select id from transfer_conversation('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e3')),
  null::uuid, 'transferir para o mesmo responsável sem observação não devolve evento');
reset role;
select is(pg_temp.n_events('00000000-0000-0000-0000-00000000e001'), (select n from before_same),
  'transferir para o mesmo responsável não grava evento');
select is(pg_temp.n_notifs('00000000-0000-0000-0000-0000000000e3'), 1::bigint,
  'transferir para o mesmo responsável não gera notificação nova');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select is(
  (select type from transfer_conversation('00000000-0000-0000-0000-00000000e001',
                                          '00000000-0000-0000-0000-0000000000e3', 'só a nota')),
  'note', 'mesmo responsável com observação devolve a nota');
reset role;
select is(pg_temp.n_events('00000000-0000-0000-0000-00000000e001'), (select n + 1 from before_same),
  'mesmo responsável com observação grava só uma nota');
select is(pg_temp.n_notifs('00000000-0000-0000-0000-0000000000e3'), 1::bigint,
  'mesmo responsável com observação também não notifica');

-- ===== Destino de outra conta =====
create temp table before_other as
  select pg_temp.n_events('00000000-0000-0000-0000-00000000e001') as n;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  $$ select transfer_conversation('00000000-0000-0000-0000-00000000e001',
                                  '00000000-0000-0000-0000-0000000000e9', 'não pode') $$,
  '22023', null, 'transferir para usuário de outra conta é recusado');
reset role;
select is(
  row(pg_temp.n_events('00000000-0000-0000-0000-00000000e001'), pg_temp.assignee('00000000-0000-0000-0000-00000000e001'))::text,
  row((select n from before_other), '00000000-0000-0000-0000-0000000000e3'::uuid)::text,
  'transferência recusada não grava nada (nem a nota) e não troca o responsável');

-- ===== Troca com responsável anterior e remoção =====
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select results_eq(
  $$ select type, from_user_id, to_user_id, note_id
       from transfer_conversation('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e2') $$,
  $$ values ('transferred'::text, '00000000-0000-0000-0000-0000000000e3'::uuid,
             '00000000-0000-0000-0000-0000000000e2'::uuid, null::uuid) $$,
  'com responsável anterior o evento é transferred (from/to), sem nota');
select results_eq(
  $$ select type, from_user_id, to_user_id
       from transfer_conversation('00000000-0000-0000-0000-00000000e001', null) $$,
  $$ values ('unassigned'::text, '00000000-0000-0000-0000-0000000000e2'::uuid, null::uuid) $$,
  'transferir para ninguém grava unassigned');
reset role;
select is(pg_temp.assignee('00000000-0000-0000-0000-00000000e001'), null, 'unassigned limpa assigned_agent_id');

-- ===== Outra conta e escrita direta =====
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e9');
select is(
  (select count(*) from conversation_events where conversation_id = '00000000-0000-0000-0000-00000000e001'),
  0::bigint, 'usuário de outra conta não vê os eventos da conversa');
select throws_ok(
  $$ select add_conversation_note('00000000-0000-0000-0000-00000000e001', 'intrusa') $$,
  '42501', null, 'usuário de outra conta não grava nota');
select throws_ok(
  $$ select transfer_conversation('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e9') $$,
  '42501', null, 'usuário de outra conta não transfere');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  $$ insert into conversation_events (account_id, conversation_id, type, actor_kind, body)
     select account_id, id, 'note', 'user', 'direto' from conversations where id = '00000000-0000-0000-0000-00000000e001' $$,
  '42501', null, 'authenticated não insere direto em conversation_events');
select throws_ok(
  $$ select record_assignment_event('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e3', 'flow') $$,
  '42501', null, 'authenticated não chama record_assignment_event');
select throws_ok(
  $$ select _assign_with_event('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e3', 'user',
                               '00000000-0000-0000-0000-0000000000e2', null) $$,
  '42501', null, 'authenticated não chama _assign_with_event');

-- ===== Caminhos do servidor =====
select pg_temp.as_service();
select results_eq(
  $$ select type, actor_kind, actor_user_id, to_user_id
       from record_assignment_event('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e3', 'flow') $$,
  $$ values ('assigned'::text, 'flow'::text, null::uuid, '00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'service_role grava a troca com record_assignment_event (actor_kind flow)');

select is(
  automation_assign_conversation(
    (select account_id from profiles where user_id = '00000000-0000-0000-0000-0000000000e1'),
    '00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-0000000000e3', 1),
  1, 'automation_assign_conversation devolve o número de conversas do contato');
reset role;
select results_eq(
  $$ select type, actor_kind, actor_user_id, to_user_id from conversation_events
      where conversation_id = '00000000-0000-0000-0000-00000000e002' $$,
  $$ values ('assigned'::text, 'automation'::text, null::uuid, '00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'automation_assign_conversation grava evento com actor_kind automation');
select is(
  (select depth from automation_trigger_events
    where trigger_type = 'conversation_assigned' and context->>'conversation_id' = '00000000-0000-0000-0000-00000000e002'),
  1::smallint, 'automation_assign_conversation mantém a profundidade no evento de automação');

-- lote: quem é de outra conta não mexe (como o RLS de antes); atendente de A grava um evento por conversa
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e9');
select is(
  conversations_bulk_assign(array['00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e004']::uuid[],
                            '00000000-0000-0000-0000-0000000000e9'),
  0, 'lote de usuário de outra conta não atribui nada');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select is(
  conversations_bulk_assign(array['00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e004']::uuid[],
                            '00000000-0000-0000-0000-0000000000e3'),
  2, 'conversations_bulk_assign devolve o número de conversas');
reset role;
select results_eq(
  $$ select conversation_id, type, actor_kind, actor_user_id, to_user_id from conversation_events
      where conversation_id in ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e004')
      order by conversation_id $$,
  $$ values ('00000000-0000-0000-0000-00000000e003'::uuid, 'assigned'::text, 'user'::text,
             '00000000-0000-0000-0000-0000000000e2'::uuid, '00000000-0000-0000-0000-0000000000e3'::uuid),
            ('00000000-0000-0000-0000-00000000e004'::uuid, 'assigned'::text, 'user'::text,
             '00000000-0000-0000-0000-0000000000e2'::uuid, '00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'conversations_bulk_assign grava um evento por conversa com actor_kind user');
select is(
  (select count(*) from automation_trigger_events
    where trigger_type = 'conversation_assigned'
      and context->>'conversation_id' in ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e004')),
  0::bigint, 'lote continua sem disparar conversation_assigned (D10)');

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'conversation_events'),
  'conversation_events está na publicação supabase_realtime');

-- Revisão independente (I3, M5, M6)
select throws_ok(
  $$ insert into conversation_events (account_id, conversation_id, type, actor_kind, body)
     select account_id, id, 'note', 'user', E'\u00A0\u00A0\u3000' from conversations
      where id = '00000000-0000-0000-0000-00000000e002' $$,
  '23514', null, 'nota só com espaço Unicode (NBSP, espaço ideográfico) é recusada');
select throws_ok(
  $$ insert into conversation_events (account_id, conversation_id, type, actor_kind, body)
     select account_id, id, 'note', 'user', E'\u200B\uFEFF' from conversations
      where id = '00000000-0000-0000-0000-00000000e002' $$,
  '23514', null, 'nota só com caractere invisível (zero-width) é recusada');
select throws_ok(
  $$ insert into conversation_events (account_id, conversation_id, type, actor_kind, body)
     select account_id, id, 'note', 'user', 'a' || repeat(' ', 5000) from conversations
      where id = '00000000-0000-0000-0000-00000000e002' $$,
  '23514', null, 'nota com mais de 2.000 caracteres no total é recusada, mesmo que sejam espaços');
-- evento de uma conversa apontando para nota de outra: apagar a conversa da nota não pode travar
insert into conversation_events (id, account_id, conversation_id, type, actor_kind, body)
select '00000000-0000-0000-0000-0000000ee0e1', account_id, id, 'note', 'user', 'nota da e002'
  from conversations where id = '00000000-0000-0000-0000-00000000e002';
insert into conversation_events (account_id, conversation_id, type, actor_kind, note_id)
select account_id, id, 'unassigned', 'user', '00000000-0000-0000-0000-0000000ee0e1'
  from conversations where id = '00000000-0000-0000-0000-00000000e001';
select lives_ok(
  $$ delete from conversations where id = '00000000-0000-0000-0000-00000000e002' $$,
  'apagar a conversa de uma nota referenciada por outro evento funciona (note_id vira nulo)');

select * from finish();
rollback;
