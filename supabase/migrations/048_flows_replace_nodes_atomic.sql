-- 048_flows_replace_nodes_atomic.sql
-- D8: salvar um fluxo troca os metadados e todos os nós numa única
-- transação. Antes a rota apagava e inseria em chamadas separadas: entre
-- as duas o fluxo ficava sem nós, e uma falha no insert o deixava vazio.

CREATE OR REPLACE FUNCTION replace_flow_nodes(
  p_flow_id    UUID,
  p_flow_patch JSONB,
  p_nodes      JSONB  -- NULL = não mexe nos nós
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE flows SET
    name            = CASE WHEN p_flow_patch ? 'name'            THEN p_flow_patch->>'name'                ELSE name END,
    description     = CASE WHEN p_flow_patch ? 'description'     THEN p_flow_patch->>'description'         ELSE description END,
    trigger_type    = CASE WHEN p_flow_patch ? 'trigger_type'    THEN p_flow_patch->>'trigger_type'        ELSE trigger_type END,
    trigger_config  = CASE WHEN p_flow_patch ? 'trigger_config'  THEN p_flow_patch->'trigger_config'       ELSE trigger_config END,
    entry_node_id   = CASE WHEN p_flow_patch ? 'entry_node_id'   THEN p_flow_patch->>'entry_node_id'       ELSE entry_node_id END,
    fallback_policy = CASE WHEN p_flow_patch ? 'fallback_policy' THEN p_flow_patch->'fallback_policy'      ELSE fallback_policy END,
    updated_at      = NOW()
  WHERE id = p_flow_id;

  IF p_nodes IS NOT NULL THEN
    DELETE FROM flow_nodes WHERE flow_id = p_flow_id;
    INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
    SELECT p_flow_id,
           n->>'node_key',
           n->>'node_type',
           COALESCE(n->'config', '{}'::jsonb),
           COALESCE((n->>'position_x')::double precision, 0),
           COALESCE((n->>'position_y')::double precision, 0)
      FROM jsonb_array_elements(p_nodes) AS n;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_flow_nodes(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_flow_nodes(UUID, JSONB, JSONB) TO service_role;

-- D8: evento visível quando o nó atual da execução sumiu numa edição.
ALTER TABLE flow_run_events DROP CONSTRAINT IF EXISTS flow_run_events_event_type_check;
ALTER TABLE flow_run_events ADD CONSTRAINT flow_run_events_event_type_check CHECK (event_type IN (
  'started', 'node_entered', 'message_sent', 'reply_received', 'fallback_fired',
  'handoff', 'timeout', 'error', 'completed', 'node_removed'
));
