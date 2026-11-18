-- 056_automation_events_bulk_silent.sql
-- D10: operações em massa NÃO geram tag_added / conversation_assigned —
-- importação de contatos (CSV ou API), etiqueta aplicada a vários
-- contatos de uma vez e atribuição em lote. Só mudanças individuais
-- disparam.
--
-- Como: os caminhos em massa gravam por funções que ligam
-- app.automation_events = 'off' só dentro da própria transação
-- (set_config(..., true)). Os triggers da 055 respeitam a marca. Toda
-- outra gravação — tela, API individual, fluxo, automação — continua
-- passando pelo trigger e gerando evento ("venha de onde vier").

CREATE OR REPLACE FUNCTION automation_events_silenced()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(current_setting('app.automation_events', true), '') = 'off';
$$;

CREATE OR REPLACE FUNCTION contact_tags_emit_tag_added()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF automation_events_silenced() THEN
    RETURN NEW;  -- D10: operação em massa
  END IF;
  INSERT INTO automation_trigger_events (account_id, trigger_type, contact_id, context, depth)
  SELECT c.account_id, 'tag_added', NEW.contact_id, jsonb_build_object('tag_id', NEW.tag_id), automation_current_depth()
    FROM contacts c WHERE c.id = NEW.contact_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION conversations_emit_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF automation_events_silenced() THEN
    RETURN NEW;  -- D10: atribuição em lote
  END IF;
  IF NEW.assigned_agent_id IS NOT NULL
     AND NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO automation_trigger_events (account_id, trigger_type, contact_id, context, depth)
    VALUES (NEW.account_id, 'conversation_assigned', NEW.contact_id,
            jsonb_build_object('agent_id', NEW.assigned_agent_id, 'conversation_id', NEW.id),
            automation_current_depth());
  END IF;
  RETURN NEW;
END;
$$;

-- Importação (CSV pela tela, criação pela API v1): pares contato/etiqueta.
-- SECURITY INVOKER: o RLS de contact_tags continua valendo para quem chama.
CREATE OR REPLACE FUNCTION contact_tags_insert_bulk(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  PERFORM set_config('app.automation_events', 'off', true);
  INSERT INTO contact_tags (contact_id, tag_id)
  SELECT DISTINCT (r->>'contact_id')::uuid, (r->>'tag_id')::uuid
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) r
  ON CONFLICT (contact_id, tag_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.automation_events', '', true);
  RETURN v_rows;
END;
$$;

-- Etiqueta aplicada a vários contatos de uma vez.
CREATE OR REPLACE FUNCTION contacts_bulk_add_tag(p_contact_ids UUID[], p_tag_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  PERFORM set_config('app.automation_events', 'off', true);
  INSERT INTO contact_tags (contact_id, tag_id)
  SELECT DISTINCT unnest(p_contact_ids), p_tag_id
  ON CONFLICT (contact_id, tag_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.automation_events', '', true);
  RETURN v_rows;
END;
$$;

-- Atribuição em lote (ainda sem tela; pronta para quando existir).
CREATE OR REPLACE FUNCTION conversations_bulk_assign(p_conversation_ids UUID[], p_agent_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  PERFORM set_config('app.automation_events', 'off', true);
  UPDATE conversations SET assigned_agent_id = p_agent_id, updated_at = NOW()
   WHERE id = ANY (p_conversation_ids);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.automation_events', '', true);
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION contact_tags_insert_bulk(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION contacts_bulk_add_tag(UUID[], UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION conversations_bulk_assign(UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contact_tags_insert_bulk(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION contacts_bulk_add_tag(UUID[], UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION conversations_bulk_assign(UUID[], UUID) TO authenticated, service_role;
