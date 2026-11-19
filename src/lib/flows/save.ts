import { validateFlowForActivation, type ValidationIssue } from "./validate";

type Translator = (key: string, values?: Record<string, string | number>) => string;

interface CurrentFlow {
  status: "draft" | "active" | "archived";
  name: string;
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: Record<string, unknown>;
  entry_node_id: string | null;
}

interface NodeIn {
  node_key: string;
  node_type: string;
  config: Record<string, unknown>;
}

interface SaveBody {
  name?: string;
  trigger_type?: CurrentFlow["trigger_type"];
  trigger_config?: Record<string, unknown>;
  entry_node_id?: string | null;
  nodes?: NodeIn[];
}

/**
 * D8: saving an ACTIVE flow must leave it valid. Validates the merged
 * result (current flow + patch, new nodes or the existing ones). Drafts
 * are not validated — they may be saved incomplete.
 */
export function validateFlowSave(
  current: CurrentFlow,
  body: SaveBody,
  existingNodes: NodeIn[],
  t?: Translator,
): { ok: true; issues: ValidationIssue[] } | { ok: false; issues: ValidationIssue[] } {
  if (current.status !== "active") return { ok: true, issues: [] };
  const merged = {
    name: body.name ?? current.name,
    trigger_type: body.trigger_type ?? current.trigger_type,
    trigger_config: body.trigger_config ?? current.trigger_config,
    entry_node_id: body.entry_node_id !== undefined ? body.entry_node_id : current.entry_node_id,
  };
  const issues = validateFlowForActivation(merged, body.nodes ?? existingNodes, t);
  return issues.some((i) => i.severity === "error") ? { ok: false, issues } : { ok: true, issues };
}
