-- D7: o silêncio dos robôs depois de um handoff dura até a conversa ser
-- encerrada ou reaberta.
begin;
select plan(5);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'handoff@test.local');
insert into contacts (id, user_id, account_id, phone, name)
select '00000000-0000-0000-0000-00000000c0e1', '00000000-0000-0000-0000-0000000000e1', account_id, '+5511900000555', 'H'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000e1';
insert into conversations (id, user_id, account_id, contact_id, status)
select '00000000-0000-0000-0000-00000000cc01', user_id, account_id, id, 'pending' from contacts where id = '00000000-0000-0000-0000-00000000c0e1';
insert into conversations (id, user_id, account_id, contact_id, status)
select '00000000-0000-0000-0000-00000000cc02', user_id, account_id, id, 'open' from contacts where id = '00000000-0000-0000-0000-00000000c0e1';

-- handoff do fluxo
update conversations set ai_autoreply_disabled = true, bot_handoff_at = now() where id = '00000000-0000-0000-0000-00000000cc01';
update conversations set status = 'closed' where id = '00000000-0000-0000-0000-00000000cc01';
select is((select bot_handoff_at from conversations where id = '00000000-0000-0000-0000-00000000cc01'), null, 'encerrar limpa bot_handoff_at');
select is((select ai_autoreply_disabled from conversations where id = '00000000-0000-0000-0000-00000000cc01'), false, 'encerrar reativa a I.A pausada pelo handoff');

-- novo handoff numa conversa já encerrada e depois reaberta
update conversations set ai_autoreply_disabled = true, bot_handoff_at = now() where id = '00000000-0000-0000-0000-00000000cc01';
update conversations set status = 'open' where id = '00000000-0000-0000-0000-00000000cc01';
select is((select bot_handoff_at from conversations where id = '00000000-0000-0000-0000-00000000cc01'), null, 'reabrir limpa bot_handoff_at');

-- pausa manual da I.A (sem handoff) continua depois de encerrar
update conversations set ai_autoreply_disabled = true where id = '00000000-0000-0000-0000-00000000cc02';
update conversations set status = 'closed' where id = '00000000-0000-0000-0000-00000000cc02';
select is((select ai_autoreply_disabled from conversations where id = '00000000-0000-0000-0000-00000000cc02'), true, 'pausa manual da I.A é preservada');

-- mudar outra coluna não mexe no silêncio
update conversations set ai_autoreply_disabled = true, bot_handoff_at = now(), status = 'pending' where id = '00000000-0000-0000-0000-00000000cc02';
update conversations set unread_count = 3 where id = '00000000-0000-0000-0000-00000000cc02';
select isnt((select bot_handoff_at from conversations where id = '00000000-0000-0000-0000-00000000cc02'), null, 'atualização comum mantém o silêncio');

select * from finish();
rollback;
