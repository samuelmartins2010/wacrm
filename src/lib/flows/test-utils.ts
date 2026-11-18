// Test-only helpers for the Flows engine: an in-memory stand-in for the
// Supabase query builder that records the writes the engine makes.
// Not imported by production code.

import type { FlowNodeRow, FlowRow, FlowRunRow } from "./types";

export interface FakeDbWrites {
  events: { event_type: string; node_key: string | null; payload: Record<string, unknown> }[];
  runUpdates: Record<string, unknown>[];
  conversationUpdates: Record<string, unknown>[];
  inserts: { table: string; row: unknown }[];
}

/**
 * Chainable fake: every builder method returns the builder; awaiting it
 * (or calling single/maybeSingle) resolves to { data, error }.
 * `rows[table]` answers selects; writes are recorded in `writes`.
 */
export function fakeFlowDb(rows: Record<string, unknown> = {}) {
  const writes: FakeDbWrites = { events: [], runUpdates: [], conversationUpdates: [], inserts: [] };
  const db = {
    rpc: async () => ({ data: null, error: null }),
    from(table: string) {
      let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
      const result = () => {
        if (op === "update") return { data: [{ id: "row" }], error: null };
        if (op !== "select") return { data: null, error: null };
        return { data: rows[table] ?? null, error: null };
      };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "order", "limit", "filter", "gte", "lte", "neq"]) {
        b[m] = () => b;
      }
      b.insert = (row: Record<string, unknown>) => {
        op = "insert";
        writes.inserts.push({ table, row });
        if (table === "flow_run_events") {
          writes.events.push({
            event_type: String(row.event_type),
            node_key: (row.node_key as string | null) ?? null,
            payload: (row.payload as Record<string, unknown>) ?? {},
          });
        }
        return b;
      };
      b.update = (patch: Record<string, unknown>) => {
        op = "update";
        if (table === "flow_runs") writes.runUpdates.push(patch);
        if (table === "conversations") writes.conversationUpdates.push(patch);
        return b;
      };
      b.upsert = () => {
        op = "upsert";
        return b;
      };
      b.delete = () => {
        op = "delete";
        return b;
      };
      b.maybeSingle = async () => {
        const r = result();
        return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
      };
      b.single = b.maybeSingle;
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(res, rej);
      return b;
    },
  };
  return { db, writes };
}

export function node(node_key: string, node_type: FlowNodeRow["node_type"], config: Record<string, unknown>): FlowNodeRow {
  return { id: node_key, flow_id: "flow", node_key, node_type, config, position_x: 0, position_y: 0, created_at: "" };
}

export function nodeMap(...nodes: FlowNodeRow[]): Map<string, FlowNodeRow> {
  return new Map(nodes.map((n) => [n.node_key, n]));
}

export function run(over: Partial<FlowRunRow> = {}): FlowRunRow {
  return {
    id: "run",
    flow_id: "flow",
    account_id: "acc",
    user_id: "u",
    contact_id: "c",
    conversation_id: "conv",
    status: "active",
    current_node_key: "start",
    last_prompt_message_id: null,
    vars: {},
    reprompt_count: 0,
    started_at: "",
    last_advanced_at: "",
    ended_at: null,
    end_reason: null,
    ...over,
  };
}

export function flowRow(over: Partial<FlowRow> = {}): FlowRow {
  return {
    id: "flow",
    account_id: "acc",
    user_id: "u",
    name: "f",
    description: null,
    status: "active",
    trigger_type: "keyword",
    trigger_config: { keywords: ["x"] },
    entry_node_id: "start",
    fallback_policy: { on_unknown_reply: "reprompt", max_reprompts: 2, on_timeout_hours: 24, on_exhaust: "handoff" },
    execution_count: 0,
    last_executed_at: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}
