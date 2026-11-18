import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { kind: string; args: Record<string, unknown> }[] = [];
vi.mock("./meta-send", () => {
  const ok = (kind: string) => async (args: Record<string, unknown>) => {
    sent.push({ kind, args });
    return { whatsapp_message_id: `wamid.${sent.length}` };
  };
  return {
    engineSendText: ok("text"),
    engineSendMedia: ok("media"),
    engineSendInteractiveButtons: ok("buttons"),
    engineSendInteractiveList: ok("list"),
  };
});
vi.mock("./admin-client", () => ({ supabaseAdmin: () => ({}) }));

import { __flowEngineTest } from "./engine";
import { fakeFlowDb, node, nodeMap, run } from "./test-utils";

const { advanceFromNodeKey } = __flowEngineTest;

beforeEach(() => {
  sent.length = 0;
});

describe("advance loop message budget (F1)", () => {
  it("stops a send-only cycle after 10 messages with a clear failure", async () => {
    const { db, writes } = fakeFlowDb();
    const nodes = nodeMap(
      node("start", "start", { next_node_key: "a" }),
      node("a", "send_message", { text: "A", next_node_key: "b" }),
      node("b", "send_message", { text: "B", next_node_key: "a" }),
    );
    await advanceFromNodeKey(db as never, run(), "start", nodes);
    expect(sent.length).toBe(10);
    const err = writes.events.find((e) => e.event_type === "error");
    expect(err?.payload.reason).toBe("too_many_messages_per_advance");
    expect(writes.runUpdates.at(-1)).toMatchObject({ status: "failed", end_reason: "too_many_messages_per_advance" });
  });

  it("a normal multi-message advance is not cut", async () => {
    const { db } = fakeFlowDb();
    const nodes = nodeMap(
      node("start", "start", { next_node_key: "m1" }),
      ...Array.from({ length: 5 }, (_, i) =>
        node(`m${i + 1}`, "send_message", { text: `M${i + 1}`, next_node_key: i === 4 ? "fim" : `m${i + 2}` }),
      ),
      node("fim", "end", {}),
    );
    const r = await advanceFromNodeKey(db as never, run(), "start", nodes);
    expect(sent.length).toBe(5);
    expect(r.outcome).toBe("completed");
  });
});
