import { beforeEach, describe, expect, it, vi } from "vitest";
import { memDb, type MemDb } from "./test-db";

const h = vi.hoisted(() => ({ db: null as unknown, sent: [] as string[] }));
vi.mock("./admin-client", () => ({ supabaseAdmin: () => h.db }));
vi.mock("./meta-send", () => ({
  engineSendText: async (a: { text: string }) => (h.sent.push(a.text), { whatsapp_message_id: `wamid.${h.sent.length}` }),
  engineSendTemplate: async () => ({ whatsapp_message_id: "wamid.t" }),
  engineSendInteractive: async () => ({ whatsapp_message_id: "wamid.i" }),
}));

import { cancelWaitsOnContactReply, resumePendingExecution, runAutomationsForTrigger } from "./engine";

const ACC = "acc";
const CONTACT = "c1";
let db: MemDb;

function automation(over: Record<string, unknown> = {}) {
  return {
    id: "auto1", account_id: ACC, user_id: "u1", name: "A", is_active: true,
    trigger_type: "keyword_match", trigger_config: { keywords: ["oi"], match_type: "contains" },
    continue_on_reply: false, execution_count: 0, created_at: "2026-01-01T00:00:00Z", ...over,
  };
}
const step = (id: string, position: number, step_type: string, step_config: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, automation_id: "auto1", position, step_type, step_config, parent_step_id: null, branch: null, ...extra });

function seed(autos: Record<string, unknown>[], steps: Record<string, unknown>[]) {
  db = memDb(
    {
      contacts: [{ id: CONTACT, account_id: ACC, name: "Ana" }],
      automations: autos,
      automation_steps: steps,
      automation_logs: [],
      automation_pending_executions: [],
    },
    {
      unique: {
        automation_pending_executions: [
          { cols: ["automation_id", "contact_id"], where: (r) => r.status === "pending" || r.status === "running" },
        ],
      },
    },
  );
  h.db = db;
}

const fire = (text = "oi") =>
  runAutomationsForTrigger({ accountId: ACC, triggerType: "keyword_match", contactId: CONTACT, context: { message_text: text, conversation_id: "conv1" } });

const pendings = () => db.tables.automation_pending_executions;
const logs = () => db.tables.automation_logs;

async function resumeDue() {
  for (const p of pendings().filter((r) => r.status === "pending")) {
    p.status = "running";
    await resumePendingExecution(p as never);
  }
}

beforeEach(() => {
  h.sent.length = 0;
});

const waitFlow = [
  step("s1", 0, "send_message", { text: "um" }),
  step("s2", 1, "wait", { amount: 1, unit: "hours" }),
  step("s3", 2, "send_message", { text: "dois" }),
];

describe("A1/D4: a reply during a wait cancels the rest by default", () => {
  it("cancels the pending step and marks the log cancelled", async () => {
    seed([automation()], waitFlow);
    await fire();
    expect(pendings()).toHaveLength(1);
    await cancelWaitsOnContactReply(ACC, CONTACT);
    expect(pendings()[0].status).toBe("cancelled");
    expect(logs()[0].status).toBe("cancelled");
    await resumeDue();
    expect(h.sent).toEqual(["um"]);
  });

  it("'continue even if the contact replies' keeps the wait", async () => {
    seed([automation({ continue_on_reply: true })], waitFlow);
    await fire();
    await cancelWaitsOnContactReply(ACC, CONTACT);
    expect(pendings()[0].status).toBe("pending");
    await resumeDue();
    expect(h.sent).toEqual(["um", "dois"]);
  });

  it("only touches this contact's waits in this account", async () => {
    seed([automation()], waitFlow);
    await fire();
    await cancelWaitsOnContactReply("other-acc", CONTACT);
    await cancelWaitsOnContactReply(ACC, "other-contact");
    expect(pendings()[0].status).toBe("pending");
  });
});

describe("A1: one execution per automation and contact", () => {
  it("the keyword repeated during a wait does not open a parallel execution", async () => {
    seed([automation({ continue_on_reply: true })], waitFlow);
    await fire();
    await fire();
    expect(h.sent).toEqual(["um"]);
    expect(logs()).toHaveLength(1);
    expect(pendings().filter((p) => p.status === "pending")).toHaveLength(1);
  });
});
