-- 059 (G): mensagem do cliente numa conversa encerrada reabre a conversa,
-- começa a espera e registra "reaberta pelo cliente". O responsável
-- continua, a menos que tenha saído da conta ou só visualize (→ Sem dono).
-- Robôs silenciados por handoff (D7) voltam ao reabrir; pausa manual da
-- I.A continua. Roda com `npx supabase test db`.
begin;
select plan(20);

-- r1 dono de A; r2, r3, r4 atendentes de A.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'reopen-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'reopen-agent@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', 'reopen-viewer@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'reopen-gone@test.local');
update profiles p
   set account_id = o.account_id, account_role = 'agent'::account_role_enum
  from profiles o
 where o.user_id = '00000000-0000-0000-0000-0000000000d1'
   and p.user_id in ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d3',
                     '00000000-0000-0000-0000-0000000000d4');

-- Como num convite aceito: a conta pessoal de quem entrou deixa de existir.
delete from accounts where owner_user_id in ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d4');

insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000dc01', user_id, account_id, '+5511900000661', 'Reabre'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
-- X: com r2 · Y: com r3 (vira viewer) · Z: com r4 (sai da conta)
-- W: aberta · V: handoff (D7) · U: pausa manual da I.A · T: sem dono
insert into conversations (id, user_id, account_id, contact_id, status, assigned_agent_id)
select v.id::uuid, c.user_id, c.account_id, c.id, 'open', v.agent::uuid
  from contacts c,
       (values ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-0000000000d2'),
               ('00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-0000000000d3'),
               ('00000000-0000-0000-0000-00000000d0a3', '00000000-0000-0000-0000-0000000000d4'),
               ('00000000-0000-0000-0000-00000000d0a4', null),
               ('00000000-0000-0000-0000-00000000d0a5', null),
               ('00000000-0000-0000-0000-00000000d0a6', null),
               ('00000000-0000-0000-0000-00000000d0a7', null)) v(id, agent)
 where c.id = '00000000-0000-0000-0000-00000000dc01';
update conversations set status = 'closed'
 where id <> '00000000-0000-0000-0000-00000000d0a4'
   and contact_id = '00000000-0000-0000-0000-00000000dc01';
-- Depois de encerradas: r3 passa a só visualizar e r4 sai da conta.
-- (Encerradas ficam como estão; por isso ainda apontam para eles.)
update profiles set account_role = 'viewer' where user_id = '00000000-0000-0000-0000-0000000000d3';
select public.remove_account_member('00000000-0000-0000-0000-0000000000d4')
  from (select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000d1')::text, true)) s;
select set_config('request.jwt.claims', '', true);
-- D7: V ficou com robôs em silêncio; U com a I.A pausada à mão
update conversations set bot_handoff_at = now(), ai_autoreply_disabled = true
 where id = '00000000-0000-0000-0000-00000000d0a5';
update conversations set ai_autoreply_disabled = true
 where id = '00000000-0000-0000-0000-00000000d0a6';

create function pg_temp.customer(conv uuid) returns void language sql as $$
  insert into messages (conversation_id, sender_type, content_text, status, created_at)
  values (conv, 'customer', 'voltei', 'delivered', now() + interval '1 minute')
$$;
create function pg_temp.conv(conv uuid) returns conversations language sql as $$
  select * from conversations where id = conv
$$;
create function pg_temp.events(conv uuid) returns text language sql as $$
  select coalesce(string_agg(type || ':' || actor_kind, ',' order by created_at, type), '')
    from conversation_events where conversation_id = conv
$$;

-- ── Reabre e mantém o responsável ───────────────────────────────────
select pg_temp.customer('00000000-0000-0000-0000-00000000d0a1');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a1')).status, 'open', 'mensagem do cliente reabre a conversa encerrada');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a1')).awaiting_since, now() + interval '1 minute',
  'e começa a espera nessa mensagem');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a1')).assigned_agent_id, '00000000-0000-0000-0000-0000000000d2'::uuid,
  'o responsável anterior continua');
select is(pg_temp.events('00000000-0000-0000-0000-00000000d0a1'), 'reopened:customer',
  'registra "reaberta pelo cliente"');
select is((select to_user_id from conversation_events where conversation_id = '00000000-0000-0000-0000-00000000d0a1'),
  null, 'o evento de reabertura não mexe em responsável');

-- ── Responsável que só visualiza ou saiu da conta → Sem dono ────────
select pg_temp.customer('00000000-0000-0000-0000-00000000d0a2');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a2')).status, 'open', 'reabre também quando o responsável virou viewer');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a2')).assigned_agent_id, null, 'responsável que só visualiza → Sem dono');
select is(pg_temp.events('00000000-0000-0000-0000-00000000d0a2'), 'reopened:customer,unassigned:system',
  'reabertura e remoção do responsável ficam registradas');
select is((select from_user_id from conversation_events
            where conversation_id = '00000000-0000-0000-0000-00000000d0a2' and type = 'unassigned'),
  '00000000-0000-0000-0000-0000000000d3'::uuid, 'o evento de remoção diz quem era o responsável');

select pg_temp.customer('00000000-0000-0000-0000-00000000d0a3');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a3')).assigned_agent_id, null, 'responsável que saiu da conta → Sem dono');

-- ── Conversa sem dono reabre sem evento de responsável ──────────────
select pg_temp.customer('00000000-0000-0000-0000-00000000d0a7');
select is(pg_temp.events('00000000-0000-0000-0000-00000000d0a7'), 'reopened:customer', 'sem dono: só o evento de reabertura');

-- ── Conversa aberta: nada muda ──────────────────────────────────────
select pg_temp.customer('00000000-0000-0000-0000-00000000d0a4');
select is(pg_temp.events('00000000-0000-0000-0000-00000000d0a4'), '', 'conversa já aberta não ganha evento de reabertura');
select pg_temp.customer('00000000-0000-0000-0000-00000000d0a4');
select is((select count(*) from conversation_events where conversation_id = '00000000-0000-0000-0000-00000000d0a4'),
  0::bigint, 'nem na segunda mensagem');

-- ── Só o cliente reabre ─────────────────────────────────────────────
update conversations set status = 'closed' where id = '00000000-0000-0000-0000-00000000d0a4';
insert into messages (conversation_id, sender_type, content_text, status)
values ('00000000-0000-0000-0000-00000000d0a4', 'agent', 'tchau', 'sent'),
       ('00000000-0000-0000-0000-00000000d0a4', 'bot', 'pesquisa', 'sent');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a4')).status, 'closed', 'mensagem do atendente ou do robô não reabre');

-- ── D7: silêncio dos robôs termina ao reabrir; pausa manual fica ────
select pg_temp.customer('00000000-0000-0000-0000-00000000d0a5');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a5')).bot_handoff_at, null, 'D7: reabrir pelo cliente encerra o silêncio do handoff');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a5')).ai_autoreply_disabled, false, 'D7: e a I.A volta');
select pg_temp.customer('00000000-0000-0000-0000-00000000d0a6');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a6')).status, 'open', 'reabre com a I.A pausada à mão');
select is((pg_temp.conv('00000000-0000-0000-0000-00000000d0a6')).ai_autoreply_disabled, true, 'pausa manual da I.A continua');

-- ── Ninguém grava "reaberta" pelo client ────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000d1', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ insert into conversation_events (account_id, conversation_id, type, actor_kind)
     select account_id, id, 'reopened', 'customer' from conversations where id = '00000000-0000-0000-0000-00000000d0a1' $$,
  '42501', null, 'usuário logado não grava evento de reabertura direto');
reset role;
select is((select count(*) from conversation_events where type = 'reopened'
            and conversation_id in (select id from conversations where contact_id = '00000000-0000-0000-0000-00000000dc01')),
  6::bigint, 'seis reaberturas registradas no total');

select * from finish();
rollback;
