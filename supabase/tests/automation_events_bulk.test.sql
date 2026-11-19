-- D10: operações em massa não geram tag_added / conversation_assigned;
-- mudanças individuais continuam gerando, venham de onde vierem.
begin;
select plan(7);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'd10@test.local');
insert into contacts (id, user_id, account_id, phone, name)
select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, user_id, account_id, '+55119100' || lpad(g::text, 5, '0'), 'Lote ' || g
  from profiles, generate_series(1, 100) g where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into tags (id, user_id, account_id, name)
select '00000000-0000-0000-0000-0000000d10aa', user_id, account_id, 'T' from profiles where user_id = '00000000-0000-0000-0000-0000000000d1';

-- importação: 50 contatos com a etiqueta T, pela função de inserção em massa
select is(contact_tags_insert_bulk(
  (select jsonb_agg(jsonb_build_object('contact_id', id, 'tag_id', '00000000-0000-0000-0000-0000000d10aa'))
     from contacts where name like 'Lote %' and right(phone, 2)::int between 1 and 50)), 50, 'importação grava 50 etiquetas');
select is((select count(*)::int from automation_trigger_events where trigger_type = 'tag_added'), 0, 'importação não gera evento');

-- etiqueta em lote: T em outros 50
select is(contacts_bulk_add_tag(
  (select array_agg(id) from contacts where name like 'Lote %' and right(phone, 3)::int between 51 and 100),
  '00000000-0000-0000-0000-0000000d10aa'), 50, 'lote grava 50 etiquetas');
select is((select count(*)::int from automation_trigger_events where trigger_type = 'tag_added'), 0, 'lote não gera evento');

-- a marca vale só dentro da operação em massa: insert individual depois gera evento
delete from contact_tags where contact_id = '00000000-0000-0000-0000-000000000001';
insert into contact_tags (contact_id, tag_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d10aa');
select is((select count(*)::int from automation_trigger_events where trigger_type = 'tag_added'), 1, 'mudança individual (ficha) gera 1 evento');

-- A7 continua: passo de automação grava com profundidade
select is(automation_add_tag('00000000-0000-0000-0000-000000000002',
  (select id from tags where name = 'T' and account_id = (select account_id from profiles where user_id = '00000000-0000-0000-0000-0000000000d1')), 1),
  false, 'etiqueta já existente não regrava');
delete from contact_tags where contact_id = '00000000-0000-0000-0000-000000000002';
select automation_add_tag('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d10aa', 1);
select is((select depth from automation_trigger_events where contact_id = '00000000-0000-0000-0000-000000000002'), 1::smallint,
  'passo de automação continua marcando profundidade 1');

select * from finish();
rollback;
