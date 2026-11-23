-- D3 / A7: etiqueta adicionada e conversa atribuída viram eventos para as
-- automações, venham da tela, da API, de fluxo ou de automação; a origem
-- "automação" carrega a profundidade para cortar loops.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'a7@test.local'),
  ('00000000-0000-0000-0000-0000000000a8', 'a8@test.local');
-- a8 entra na conta de a7 como agente
update profiles set account_id = (select account_id from profiles where user_id = '00000000-0000-0000-0000-0000000000a7')
 where user_id = '00000000-0000-0000-0000-0000000000a8';

insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000c0a7', user_id, account_id, '+5511900000777', 'T'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000a7';
insert into tags (id, user_id, account_id, name)
select '00000000-0000-0000-0000-0000000007a1', user_id, account_id, 'vip' from profiles where user_id = '00000000-0000-0000-0000-0000000000a7';
insert into tags (id, user_id, account_id, name)
select '00000000-0000-0000-0000-0000000007a2', user_id, account_id, 'quente' from profiles where user_id = '00000000-0000-0000-0000-0000000000a7';
insert into conversations (id, user_id, account_id, contact_id)
select '00000000-0000-0000-0000-00000000cca7', user_id, account_id, '00000000-0000-0000-0000-00000000c0a7'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000a7';

-- tela/API: insert direto → evento de profundidade 0
insert into contact_tags (contact_id, tag_id) values ('00000000-0000-0000-0000-00000000c0a7', '00000000-0000-0000-0000-0000000007a1');
select is((select count(*)::int from automation_trigger_events where trigger_type = 'tag_added'), 1, 'etiqueta pela tela gera tag_added');
select is((select depth from automation_trigger_events where trigger_type = 'tag_added'), 0::smallint, 'origem tela: profundidade 0');
select is((select context->>'tag_id' from automation_trigger_events where trigger_type = 'tag_added'),
          '00000000-0000-0000-0000-0000000007a1', 'evento leva o tag_id');

-- passo de automação: RPC com profundidade
select is(automation_add_tag('00000000-0000-0000-0000-00000000c0a7', '00000000-0000-0000-0000-0000000007a2', 1), true, 'RPC adiciona');
select is((select depth from automation_trigger_events where context->>'tag_id' = '00000000-0000-0000-0000-0000000007a2'), 1::smallint,
          'origem automação: profundidade 1');
select is(automation_add_tag('00000000-0000-0000-0000-00000000c0a7', '00000000-0000-0000-0000-0000000007a2', 1), false,
          'etiqueta repetida não grava de novo');
select is((select count(*)::int from automation_trigger_events where trigger_type = 'tag_added'), 2, 'nem gera evento de novo');

-- atribuição
-- 060: a troca de responsável só passa pela função com evento
select _assign_with_event('00000000-0000-0000-0000-00000000cca7', '00000000-0000-0000-0000-0000000000a8', 'user', null, null);
select is((select context->>'agent_id' from automation_trigger_events where trigger_type = 'conversation_assigned'),
          '00000000-0000-0000-0000-0000000000a8', 'atribuir gera conversation_assigned');
select _assign_with_event('00000000-0000-0000-0000-00000000cca7', null, 'user', null, null);
select is((select count(*)::int from automation_trigger_events where trigger_type = 'conversation_assigned'), 1,
          'desatribuir não gera evento');

select * from finish();
rollback;
