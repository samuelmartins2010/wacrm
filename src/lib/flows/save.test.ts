import { describe, expect, it } from "vitest";
import { validateFlowSave } from "./save";

const current = {
  status: "active" as const,
  name: "F",
  trigger_type: "keyword" as const,
  trigger_config: { keywords: ["oi"] },
  entry_node_id: "start",
};
const goodNodes = [
  { node_key: "start", node_type: "start", config: { next_node_key: "fim" } },
  { node_key: "fim", node_type: "end", config: {} },
];

describe("validateFlowSave (D8)", () => {
  it("rejects saving an ACTIVE flow whose new graph is invalid", () => {
    const r = validateFlowSave(current, { nodes: [{ node_key: "start", node_type: "start", config: { next_node_key: "sumiu" } }] }, goodNodes);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("checks the merged flow: a patch that breaks the entry node is rejected", () => {
    const r = validateFlowSave(current, { entry_node_id: "nao_existe" }, goodNodes);
    expect(r.ok).toBe(false);
  });

  it("accepts a valid save of an active flow", () => {
    expect(validateFlowSave(current, { name: "Novo nome", nodes: goodNodes }, goodNodes).ok).toBe(true);
  });

  it("does not validate drafts (they may be incomplete)", () => {
    expect(validateFlowSave({ ...current, status: "draft" }, { nodes: [] }, goodNodes).ok).toBe(true);
  });

  it("warnings alone do not block", () => {
    const withOrphan = [...goodNodes, { node_key: "solto", node_type: "end", config: {} }];
    expect(validateFlowSave(current, { nodes: withOrphan }, goodNodes).ok).toBe(true);
  });
});
