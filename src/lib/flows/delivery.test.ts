import { describe, expect, it } from "vitest";
import { recordFlowDeliveryFailure } from "./delivery";
import { fakeFlowDb } from "./test-utils";

describe("recordFlowDeliveryFailure (F6)", () => {
  it("adds an error event to the run that sent the message", async () => {
    const { db, writes } = fakeFlowDb({
      flow_run_events: [{ flow_run_id: "run-1", node_key: "img" }],
    });
    const r = await recordFlowDeliveryFailure(db as never, "wamid.ABC", {
      code: 131053,
      message: "Media upload error",
    });
    expect(r).toBe(true);
    const ev = writes.inserts.find((i) => i.table === "flow_run_events")?.row as Record<string, unknown>;
    expect(ev).toMatchObject({ flow_run_id: "run-1", event_type: "error", node_key: "img" });
    expect(ev.payload).toMatchObject({ reason: "delivery_failed", code: 131053, detail: "Media upload error", whatsapp_message_id: "wamid.ABC" });
  });

  it("does nothing for messages a flow did not send", async () => {
    const { db, writes } = fakeFlowDb({ flow_run_events: [] });
    expect(await recordFlowDeliveryFailure(db as never, "wamid.OTHER", null)).toBe(false);
    expect(writes.inserts).toHaveLength(0);
  });
});
