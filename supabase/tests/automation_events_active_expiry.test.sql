-- 061: eventos da fila (055) só disparam automações que já estavam ativas
-- quando o evento foi criado (automations.activated_at), e eventos com mais
-- de 60 minutos sem processar são descartados ('expired'), com log na automação.
-- Roda com `npx supabase test db`.
begin;
select plan(15);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e7', 'fila@test.local');
insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000e7c1', user_id, account_id, '+5511900000331', 'Fila'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000e7';
insert into conversations (id, user_id, account_id, contact_id, status)
select '00000000-0000-0000-0000-00000000e7a1', user_id, account_id, id, 'open'
  from contacts where id = '00000000-0000-0000-0000-00000000e7c1';

create function pg_temp.acct() returns uuid language sql as $$
  select account_id from profiles where user_id = '00000000-0000-0000-0000-0000000000e7'
$$;

-- Atribuir como o app faz: pela função com evento quando existe (migrations
-- 058/060 do Inbox), senão por UPDATE (antes delas). O evento da fila nasce do
-- trigger da 055 nos dois casos.
create function pg_temp.assign(uid uuid) returns void language plpgsql as $$
begin
  if to_regproc('_assign_with_event') is not null then
    perform _assign_with_event('00000000-0000-0000-0000-00000000e7a1', uid, 'user', null, null);
  else
    update conversations set assigned_agent_id = uid where id = '00000000-0000-0000-0000-00000000e7a1';
  end if;
end $$;

-- ── activated_at ────────────────────────────────────────────────────
insert into automations (id, user_id, account_id, name, trigger_type, is_active)
values ('00000000-0000-0000-0000-00000000e7f1', '00000000-0000-0000-0000-0000000000e7', pg_temp.acct(),
        'Conversa atribuída', 'conversation_assigned', false);
select is((select activated_at from automations where id = '00000000-0000-0000-0000-00000000e7f1'), null,
  'automação criada desligada não tem activated_at');

-- 300 atribuições com nenhuma automação ativa (eventos de 1 min atrás)
do $$
begin
  for i in 1..300 loop
    perform pg_temp.assign('00000000-0000-0000-0000-0000000000e7');
    perform pg_temp.assign(null);
  end loop;
end $$;
update automation_trigger_events set created_at = now() - interval '1 minute'
 where account_id = pg_temp.acct() and trigger_type = 'conversation_assigned';
select is((select count(*) from automation_trigger_events where account_id = pg_temp.acct()
            and trigger_type = 'conversation_assigned' and status = 'pending'), 300::bigint,
  '300 atribuições geram 300 eventos pendentes');

update automations set is_active = true where id = '00000000-0000-0000-0000-00000000e7f1';
select isnt((select activated_at from automations where id = '00000000-0000-0000-0000-00000000e7f1'), null,
  'ligar a automação grava activated_at');

-- o que o drain faz por evento: automações ligadas até a hora do evento
create function pg_temp.matches_for_claimed() returns bigint language sql as $$
  with claimed as (select * from claim_automation_trigger_events(pg_temp.acct(), 1000))
  select count(*) from claimed e
    join automations a on a.account_id = e.account_id and a.trigger_type = e.trigger_type
                      and a.is_active and a.activated_at <= e.created_at
$$;
select is(pg_temp.matches_for_claimed(), 0::bigint,
  'ativar depois das 300 atribuições → 0 execuções para os eventos antigos');

select pg_temp.assign('00000000-0000-0000-0000-0000000000e7');
update automation_trigger_events set created_at = now() + interval '1 second'
 where account_id = pg_temp.acct() and status = 'pending';
select is(pg_temp.matches_for_claimed(), 1::bigint, '1 atribuição nova → 1 execução');

update automations set is_active = false where id = '00000000-0000-0000-0000-00000000e7f1';
select is((select activated_at from automations where id = '00000000-0000-0000-0000-00000000e7f1'), null,
  'desligar limpa activated_at');
update automations set is_active = true where id = '00000000-0000-0000-0000-00000000e7f1';
update automations set name = 'Renomeada' where id = '00000000-0000-0000-0000-00000000e7f1';
select isnt((select activated_at from automations where id = '00000000-0000-0000-0000-00000000e7f1'), null,
  'editar outra coisa não mexe em activated_at');

-- ── eventos vencidos (mais de 60 minutos) ───────────────────────────
select pg_temp.assign(null);
-- e7f1 ativa há 2 h (teria disparado); e7f2 só para outro atendente; e7f3 ligada agora
update automations set activated_at = now() - interval '2 hours' where id = '00000000-0000-0000-0000-00000000e7f1';
insert into automations (id, user_id, account_id, name, trigger_type, trigger_config, is_active) values
  ('00000000-0000-0000-0000-00000000e7f2', '00000000-0000-0000-0000-0000000000e7', pg_temp.acct(),
   'Só de outro atendente', 'conversation_assigned', '{"agent_id":"00000000-0000-0000-0000-0000000000ff"}', true),
  ('00000000-0000-0000-0000-00000000e7f3', '00000000-0000-0000-0000-0000000000e7', pg_temp.acct(),
   'Ligada agora', 'conversation_assigned', '{}', true);
update automations set activated_at = now() - interval '2 hours' where id = '00000000-0000-0000-0000-00000000e7f2';
insert into automation_trigger_events (account_id, trigger_type, contact_id, context, depth, created_at)
values (pg_temp.acct(), 'conversation_assigned', '00000000-0000-0000-0000-00000000e7c1', '{}', 0, now() - interval '61 minutes'),
       (pg_temp.acct(), 'conversation_assigned', '00000000-0000-0000-0000-00000000e7c1', '{}', 0, now() - interval '59 minutes');
delete from automation_trigger_events where account_id = pg_temp.acct() and status = 'pending'
   and created_at > now() - interval '1 minute';

select is((select count(*)::int from claim_automation_trigger_events(pg_temp.acct(), 10)
            where created_at < now() - interval '60 minutes'), 0,
  'claim nunca devolve evento com mais de 60 minutos');
update automation_trigger_events set status = 'pending'
 where account_id = pg_temp.acct() and status = 'processing';

select is(expire_stale_automation_trigger_events(pg_temp.acct()), 1, 'expire descarta 1 evento vencido');
select is((select status from automation_trigger_events where account_id = pg_temp.acct()
            and created_at < now() - interval '60 minutes'), 'expired', 'o vencido fica expired');
select is((select status from automation_trigger_events where account_id = pg_temp.acct()
            and created_at between now() - interval '60 minutes' and now() - interval '58 minutes'), 'pending',
  'o de 59 minutos continua pendente');

-- o descarte aparece nos logs da automação que teria disparado
select results_eq(
  $$ select status, error_message, contact_id, trigger_event from automation_logs
      where automation_id = '00000000-0000-0000-0000-00000000e7f1' and status = 'skipped' $$,
  $$ values ('skipped'::text, 'evento vencido'::text, '00000000-0000-0000-0000-00000000e7c1'::uuid, 'conversation_assigned'::text) $$,
  'descarte registrado em automation_logs (skipped, "evento vencido")');
select is((select count(*) from automation_logs
            where automation_id in ('00000000-0000-0000-0000-00000000e7f2', '00000000-0000-0000-0000-00000000e7f3')), 0::bigint,
  'sem log para automação de outro atendente nem para a ligada depois do evento');
select is((select execution_count from automations where id = '00000000-0000-0000-0000-00000000e7f1'), 0,
  'descarte não conta como execução');

set local role authenticated;
select throws_ok($$ select expire_stale_automation_trigger_events(null) $$, '42501', null,
  'expire é só do servidor');
reset role;

select * from finish();
rollback;
