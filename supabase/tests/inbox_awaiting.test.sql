-- Inbox (057): "Aguardando" = desde quando o cliente espera resposta humana.
-- Só a resposta de um atendente humano zera a espera: robô, I.A, fluxo e
-- mensagem pela API v1 não zeram; resposta que falhou também não.
begin;
select plan(19);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'aguardando@test.local');
insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000a0c1', user_id, account_id, '+5511900000771', 'Espera'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000a1';
-- A: aberta, sem responsável (o cenário principal)
insert into conversations (id, user_id, account_id, contact_id, status)
select '00000000-0000-0000-0000-00000000a001', user_id, account_id, id, 'open'
  from contacts where id = '00000000-0000-0000-0000-00000000a0c1';
-- B: encerrada (não conta nos filtros, mas conta em "Não lidas")
insert into conversations (id, user_id, account_id, contact_id, status)
select '00000000-0000-0000-0000-00000000a002', user_id, account_id, id, 'closed'
  from contacts where id = '00000000-0000-0000-0000-00000000a0c1';
-- C: aberta (cenário misto do recompute); D: aberta (encerrar e reabrir)
insert into conversations (id, user_id, account_id, contact_id, status)
select v.id::uuid, c.user_id, c.account_id, c.id, 'open'
  from contacts c, (values ('00000000-0000-0000-0000-00000000a003'), ('00000000-0000-0000-0000-00000000a004')) v(id)
 where c.id = '00000000-0000-0000-0000-00000000a0c1';

create function pg_temp.wait(conv uuid) returns timestamptz language sql as $$
  select awaiting_since from conversations where id = conv
$$;
create function pg_temp.msg(conv uuid, kind text, at timestamptz, st text default 'sent', api boolean default false, ai boolean default false)
returns uuid language sql as $$
  insert into messages (conversation_id, sender_type, content_text, status, created_at, sent_via_api, ai_generated)
  values (conv, kind, 'x', st, at, api, ai) returning id
$$;

select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), null, 'conversa nova não está aguardando');

select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'customer', '2026-11-19 10:00+00');
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), '2026-11-19 10:00+00'::timestamptz,
  'mensagem do cliente começa a espera');

select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'customer', '2026-11-19 10:02+00');
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), '2026-11-19 10:00+00'::timestamptz,
  'segunda mensagem do cliente mantém o início da espera');

select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'bot', '2026-11-19 10:03+00', ai => true);
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), '2026-11-19 10:00+00'::timestamptz,
  'resposta da I.A (robô) não zera a espera');

select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'agent', '2026-11-19 10:04+00', api => true);
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), '2026-11-19 10:00+00'::timestamptz,
  'mensagem pela API v1 conta como robô e não zera a espera');

select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'agent', '2026-11-19 10:05+00');
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), null, 'resposta do atendente zera a espera');

select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'customer', '2026-11-19 11:00+00');
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), '2026-11-19 11:00+00'::timestamptz,
  'cliente escreve de novo: nova espera');

select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'agent', '2026-11-19 11:01+00', st => 'failed');
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), '2026-11-19 11:00+00'::timestamptz,
  'resposta do atendente que já nasce com falha não zera a espera');

create temp table last_reply as
select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'agent', '2026-11-19 11:10+00') as id;
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), null, 'resposta enviada zera a espera');

update messages set status = 'failed' where id = (select id from last_reply);
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), '2026-11-19 11:00+00'::timestamptz,
  'resposta que falhou depois devolve a espera desde a última mensagem do cliente sem resposta');

-- cenário misto em C: o recompute chega no mesmo valor que o trigger
select pg_temp.msg('00000000-0000-0000-0000-00000000a003', 'customer', '2026-11-19 08:00+00');
select pg_temp.msg('00000000-0000-0000-0000-00000000a003', 'agent', '2026-11-19 08:01+00');
select pg_temp.msg('00000000-0000-0000-0000-00000000a003', 'customer', '2026-11-19 08:05+00');
select pg_temp.msg('00000000-0000-0000-0000-00000000a003', 'bot', '2026-11-19 08:06+00');
select pg_temp.msg('00000000-0000-0000-0000-00000000a003', 'customer', '2026-11-19 08:07+00');
create temp table via_trigger as select pg_temp.wait('00000000-0000-0000-0000-00000000a003') as v;
update conversations set awaiting_since = null where id = '00000000-0000-0000-0000-00000000a003';
select is(recompute_awaiting_since('00000000-0000-0000-0000-00000000a003'), (select v from via_trigger),
  'recompute_awaiting_since dá o mesmo valor que o trigger');
select is((select v from via_trigger), '2026-11-19 08:05+00'::timestamptz,
  'no cenário misto a espera começa na primeira mensagem do cliente depois da última resposta humana');

-- B encerrada, aguardando e com não lidas
select pg_temp.msg('00000000-0000-0000-0000-00000000a002', 'customer', '2026-11-19 09:00+00');
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a002'), '2026-11-19 09:00+00'::timestamptz,
  'cliente escreve em conversa encerrada: ela reabre e a espera começa (059)');
update conversations set unread_count = 2, status = 'closed' where id = '00000000-0000-0000-0000-00000000a002';

-- Encerrar zera a espera; reabrir recomeça só com o que o cliente
-- escreveu depois do encerramento. A está aguardando desde 11:00.
update conversations set status = 'closed' where id = '00000000-0000-0000-0000-00000000a001';
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), null, 'encerrar a conversa zera a espera');

select pg_temp.msg('00000000-0000-0000-0000-00000000a001', 'customer', now() + interval '1 minute');
update conversations set status = 'open' where id = '00000000-0000-0000-0000-00000000a001';
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), now() + interval '1 minute',
  'ao reabrir, a espera recomeça na primeira mensagem do cliente depois do encerramento');

update conversations set status = 'closed' where id = '00000000-0000-0000-0000-00000000a001';
update messages set status = 'sent' where id = (select id from last_reply);
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a001'), null,
  'mudança de status de uma resposta em conversa encerrada não traz a espera de volta');

-- D: cliente esperando, encerrada sem resposta e reaberta sem mensagem nova
select pg_temp.msg('00000000-0000-0000-0000-00000000a004', 'customer', '2026-11-19 07:00+00');
update conversations set status = 'closed' where id = '00000000-0000-0000-0000-00000000a004';
update conversations set status = 'pending' where id = '00000000-0000-0000-0000-00000000a004';
select is(pg_temp.wait('00000000-0000-0000-0000-00000000a004'), null,
  'reabrir sem mensagem nova do cliente não volta a aguardar');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select results_eq(
  $$ select mine, unassigned, awaiting, unread from inbox_filter_counts() $$,
  $$ values (0, 2, 1, 1) $$,
  'contadores: encerradas ficam fora de Sem dono e Aguardando, mas Não lidas conta todas');

select throws_ok(
  $$ select recompute_awaiting_since('00000000-0000-0000-0000-00000000a001') $$,
  '42501', null, 'recompute_awaiting_since é interna: usuário logado não chama');

select * from finish();
rollback;
