-- D8: a troca de nós de um fluxo é atômica.
begin;
select plan(4);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'flows-atomic@test.local');
insert into flows (id, user_id, account_id, name, status, trigger_type, entry_node_id)
select '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000f1', account_id, 'F', 'active', 'manual', 'start'
  from profiles where user_id = '00000000-0000-0000-0000-0000000000f1';
insert into flow_nodes (flow_id, node_key, node_type, config) values
  ('00000000-0000-0000-0000-00000000f001', 'start', 'start', '{"next_node_key":"fim"}'),
  ('00000000-0000-0000-0000-00000000f001', 'fim', 'end', '{}');

-- Um nó inválido no meio da lista: nada pode mudar.
select throws_ok(
  $$ select replace_flow_nodes('00000000-0000-0000-0000-00000000f001', '{"name":"Novo"}'::jsonb,
       '[{"node_key":"start","node_type":"start","config":{"next_node_key":"x"}},{"node_key":"x","node_type":"tipo_invalido","config":{}}]'::jsonb) $$,
  '23514', null, 'nó inválido aborta a troca');
select is((select count(*)::int from flow_nodes where flow_id = '00000000-0000-0000-0000-00000000f001'), 2, 'nós antigos intactos');
select is((select name from flows where id = '00000000-0000-0000-0000-00000000f001'), 'F', 'patch do fluxo também desfeito');

select replace_flow_nodes('00000000-0000-0000-0000-00000000f001', '{"name":"Novo"}'::jsonb,
  '[{"node_key":"start","node_type":"start","config":{"next_node_key":"msg"}},{"node_key":"msg","node_type":"send_message","config":{"text":"oi","next_node_key":"fim"}},{"node_key":"fim","node_type":"end","config":{}}]'::jsonb);
select is((select count(*)::int from flow_nodes where flow_id = '00000000-0000-0000-0000-00000000f001'), 3, 'troca válida aplica os nós novos');

select * from finish();
rollback;
