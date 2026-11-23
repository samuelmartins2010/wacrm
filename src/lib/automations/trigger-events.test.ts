import { beforeEach, describe, expect, it, vi } from "vitest";
import { memDb, newId, type MemDb } from "./test-db";

const h = vi.hoisted(() => ({ db: null as unknown, sent: [] as string[] }));
vi.mock("./admin-client", () => ({ supabaseAdmin: () => h.db }));
vi.mock("./meta-send", () => ({
  engineSendText: async (a: { text: string }) => (h.sent.push(a.text), { whatsapp_message_id: "w" }),
  engineSendTemplate: async () => ({ whatsapp_message_id: "t" }),
  engineSendInteractive: async () => ({ whatsapp_message_id: "i" }),
}));

import { drainAutomationTriggerEvents, triggerMatches } from "./engine";

const ACC = "acc";
const C = "c1";
let db: MemDb;

// Mirrors migration 055: the DB triggers record an event per new tag /
// assignment, carrying the depth the writer set (0 = screen/API/flow).
function emitTag(contact_id: string, tag_id: string, depth: number) {
  const exists = db.tables.contact_tags.some((r) => r.contact_id === contact_id && r.tag_id === tag_id);
  if (exists) return false;
  db.tables.contact_tags.push({ id: newId(), contact_id, tag_id });
  db.tables.automation_trigger_events.push({
    id: newId(), account_id: ACC, trigger_type: "tag_added", contact_id, context: { tag_id }, depth, status: "pending",
    created_at: new Date().toISOString(),
  });
  return true;
}

function seed(autos: Record<string, unknown>[], steps: Record<string, unknown>[]) {
  db = memDb(
    {
      contacts: [{ id: C, account_id: ACC }],
      tags: ["A", "B", "C"].map((id) => ({ id, account_id: ACC })),
      profiles: [{ user_id: "agent", account_id: ACC }],
      conversations: [{ id: "conv1", account_id: ACC, contact_id: C }],
      automations: autos,
      automation_steps: steps,
      automation_logs: [],
      automation_pending_executions: [],
      automation_trigger_events: [],
      contact_tags: [],
    },
    {
      rpc: {
        automation_add_tag: (a) => emitTag(String(a.p_contact_id), String(a.p_tag_id), Number(a.p_depth)),
        automation_assign_conversation: (a) => {
          const conv = db.tables.conversations.find((r) => r.contact_id === a.p_contact_id && r.account_id === a.p_account_id);
          if (!conv) return 0;
          conv.assigned_agent_id = a.p_agent_id;
          db.tables.automation_trigger_events.push({
            id: newId(), account_id: ACC, trigger_type: "conversation_assigned", contact_id: C,
            context: { agent_id: a.p_agent_id, conversation_id: conv.id }, depth: Number(a.p_depth), status: "pending",
            created_at: new Date().toISOString(),
          });
          return 1;
        },
        // Migration 061: eventos pendentes há mais de 10 min viram "expired".
        expire_stale_automation_trigger_events: (a) => {
          const cutoff = new Date(Date.now() - EVENT_TTL_MS).toISOString();
          const stale = db.tables.automation_trigger_events.filter(
            (e) => e.status === "pending" && (!a.p_account_id || e.account_id === a.p_account_id) && String(e.created_at) < cutoff,
          );
          stale.forEach((r) => (r.status = "expired"));
          return stale.length;
        },
        claim_automation_trigger_events: (a) => {
          const cutoff = new Date(Date.now() - EVENT_TTL_MS).toISOString();
          const rows = db.tables.automation_trigger_events.filter(
            (e) => e.status === "pending" && (!a.p_account_id || e.account_id === a.p_account_id) && String(e.created_at) >= cutoff,
          ).slice(0, Number(a.p_limit));
          rows.forEach((r) => (r.status = "processing"));
          return rows;
        },
      },
    },
  );
  h.db = db;
}

const EVENT_TTL_MS = 10 * 60_000;
// activated_at (061): quando a automação foi ligada. Padrão bem antigo,
// para os testes que não tratam disso.
const auto = (
  id: string,
  trigger_type: string,
  trigger_config: Record<string, unknown>,
  created_at: string,
  activated_at = "2000-01-01T00:00:00.000Z",
) => ({ id, account_id: ACC, user_id: "u", name: id, is_active: true, trigger_type, trigger_config, continue_on_reply: false, created_at, activated_at });
const step = (automation_id: string, step_type: string, step_config: Record<string, unknown>) =>
  ({ id: `${automation_id}-s`, automation_id, position: 0, step_type, step_config, parent_step_id: null, branch: null });
const ran = () => db.tables.automation_logs.map((l) => l.automation_id);

beforeEach(() => {
  h.sent.length = 0;
});

describe("D3: tag_added fires from any origin", () => {
  it("a tag added on screen (depth 0 event) runs the automation for that tag only", async () => {
    seed(
      [auto("onA", "tag_added", { tag_id: "A" }, "1"), auto("onB", "tag_added", { tag_id: "B" }, "2")],
      [step("onA", "send_message", { text: "tag A" }), step("onB", "send_message", { text: "tag B" })],
    );
    emitTag(C, "A", 0);
    await drainAutomationTriggerEvents(ACC);
    expect(h.sent).toEqual(["tag A"]);
    expect(db.tables.automation_trigger_events[0].status).toBe("done");
  });

  it("conversation_assigned fires when an automation step assigns", async () => {
    seed(
      [
        auto("assigner", "keyword_match", { keywords: ["humano"] }, "1"),
        auto("onAssign", "conversation_assigned", {}, "2"),
      ],
      [step("assigner", "assign_conversation", { mode: "specific", agent_id: "agent" }), step("onAssign", "send_message", { text: "um atendente vai falar com você" })],
    );
    const { runAutomationsForTrigger } = await import("./engine");
    await runAutomationsForTrigger({ accountId: ACC, triggerType: "keyword_match", contactId: C, context: { message_text: "humano", conversation_id: "conv1" } });
    // the webhook drains the event queue after the inbound's automations
    await drainAutomationTriggerEvents(ACC);
    expect(h.sent).toEqual(["um atendente vai falar com você"]);
  });
});

describe("A7: loop protection (depth 1)", () => {
  it("tag A → adds B → adds C → adds A ... stops after one automation hop", async () => {
    seed(
      [
        auto("AtoB", "tag_added", { tag_id: "A" }, "1"),
        auto("BtoC", "tag_added", { tag_id: "B" }, "2"),
        auto("CtoA", "tag_added", { tag_id: "C" }, "3"),
      ],
      [
        step("AtoB", "add_tag", { tag_id: "B" }),
        step("BtoC", "add_tag", { tag_id: "C" }),
        step("CtoA", "add_tag", { tag_id: "A" }),
      ],
    );
    emitTag(C, "A", 0); // the agent tags the contact on screen
    await drainAutomationTriggerEvents(ACC);
    expect(ran()).toEqual(["AtoB", "BtoC"]);
    const events = db.tables.automation_trigger_events.map((e) => [(e.context as { tag_id: string }).tag_id, e.depth, e.status]);
    expect(events).toEqual([
      ["A", 0, "done"],
      ["B", 1, "done"],
      ["C", 2, "skipped"],
    ]);
    // tags were still written; only the re-trigger was cut
    expect(db.tables.contact_tags.map((t) => t.tag_id).sort()).toEqual(["A", "B", "C"]);
  });

  it("an automation that re-adds its own trigger tag does not loop", async () => {
    seed([auto("self", "tag_added", { tag_id: "A" }, "1")], [step("self", "add_tag", { tag_id: "A" })]);
    emitTag(C, "A", 0);
    await drainAutomationTriggerEvents(ACC);
    expect(ran()).toEqual(["self"]);
    expect(db.tables.automation_trigger_events).toHaveLength(1);
  });
});

describe("triggerMatches for tag_added", () => {
  it("matches only the configured tag", () => {
    const a = { trigger_type: "tag_added", trigger_config: { tag_id: "A" } } as never;
    expect(triggerMatches(a, { tag_id: "A" })).toBe(true);
    expect(triggerMatches(a, { tag_id: "B" })).toBe(false);
  });
});

describe("061: eventos da fila só para automações já ativas, e eventos vencidos descartados", () => {
  const assignEvent = (created_at: string) =>
    db.tables.automation_trigger_events.push({
      id: newId(), account_id: ACC, trigger_type: "conversation_assigned", contact_id: C,
      context: { agent_id: "agent", conversation_id: "conv1" }, depth: 0, status: "pending", created_at,
    });

  it("300 atribuições sem automação ativa, depois ativar uma 'conversa atribuída' → 0 execuções; 1 atribuição nova → 1", async () => {
    seed([], []);
    const t0 = Date.now() - 60_000; // há 1 minuto (dentro dos 10 min)
    for (let i = 0; i < 300; i++) assignEvent(new Date(t0 + i).toISOString());
    // a automação é ligada agora, depois dos 300 eventos
    db.tables.automations.push(auto("onAssign", "conversation_assigned", {}, "1", new Date().toISOString()));
    db.tables.automation_steps.push(step("onAssign", "send_message", { text: "atribuída" }));

    await drainAutomationTriggerEvents(ACC);
    expect(ran()).toEqual([]);
    expect(db.tables.automation_trigger_events.filter((e) => e.status === "pending")).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 5));
    assignEvent(new Date().toISOString());
    await drainAutomationTriggerEvents(ACC);
    expect(ran()).toEqual(["onAssign"]);
  });

  it("evento pendente há mais de 10 minutos é descartado com log, mesmo com automação ativa antes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seed([auto("onAssign", "conversation_assigned", {}, "1")], [step("onAssign", "send_message", { text: "atribuída" })]);
    assignEvent(new Date(Date.now() - 11 * 60_000).toISOString());
    await drainAutomationTriggerEvents(ACC);
    expect(ran()).toEqual([]);
    expect(db.tables.automation_trigger_events[0].status).toBe("expired");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("descartado"), expect.anything());
    warn.mockRestore();
  });
});
