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

describe("reply on a node that no longer exists (D8)", () => {
  it("hands off to an agent with a node_removed event instead of failing silently", async () => {
    const { handleReplyForActiveRun } = __flowEngineTest;
    const { db, writes } = fakeFlowDb();
    const nodes = nodeMap(node("start", "start", { next_node_key: "fim" }), node("fim", "end", {}));
    const r = await handleReplyForActiveRun(
      db as never,
      run({ current_node_key: "menu_apagado" }),
      { kind: "interactive_reply", reply_id: "b1", reply_title: "B1", meta_message_id: "wamid.x" } as never,
      nodes,
    );
    expect(r.outcome).toBe("handed_off");
    const ev = writes.events.find((e) => e.event_type === "node_removed");
    expect(ev?.node_key).toBe("menu_apagado");
    expect(writes.runUpdates.at(-1)).toMatchObject({ status: "handed_off", end_reason: "node_removed" });
    expect(writes.conversationUpdates.at(-1)).toMatchObject({ status: "pending" });
  });
});

describe("collect_input validation in the runner (D9)", () => {
  const { handleReplyForActiveRun } = __flowEngineTest;
  const nodes = nodeMap(
    node("ask", "collect_input", { prompt_text: "Seu e-mail?", var_key: "email", validation: "email", next_node_key: "ok" }),
    node("ok", "send_message", { text: "Obrigado {{vars.email}}", next_node_key: "fim" }),
    node("fim", "end", {}),
  );
  const reply = (text: string) => ({ kind: "text", text, meta_message_id: `wamid.${text}` }) as never;

  it("an invalid answer re-sends the question instead of capturing it", async () => {
    const { db, writes } = fakeFlowDb({ flows: { fallback_policy: { on_unknown_reply: "reprompt", max_reprompts: 2, on_timeout_hours: 24, on_exhaust: "handoff" } } });
    const r = await handleReplyForActiveRun(db as never, run({ current_node_key: "ask" }), reply("Carla"), nodes);
    expect(r.outcome).toBe("fallback_fired");
    expect(sent.map((s) => s.args.text)).toEqual(["Seu e-mail?"]);
    expect(writes.runUpdates.some((u) => "vars" in u)).toBe(false);
  });

  it("after the reprompts are used up it hands off", async () => {
    const { db, writes } = fakeFlowDb({ flows: { fallback_policy: { on_unknown_reply: "reprompt", max_reprompts: 2, on_timeout_hours: 24, on_exhaust: "handoff" } } });
    const r = await handleReplyForActiveRun(db as never, run({ current_node_key: "ask", reprompt_count: 2 }), reply("ainda não"), nodes);
    expect(r.outcome).toBe("handed_off");
    expect(writes.runUpdates.at(-1)).toMatchObject({ status: "handed_off" });
  });

  it("a valid answer is captured and the flow advances", async () => {
    const { db, writes } = fakeFlowDb();
    await handleReplyForActiveRun(db as never, run({ current_node_key: "ask" }), reply("ana@empresa.com"), nodes);
    expect(writes.runUpdates.some((u) => (u.vars as Record<string, unknown> | undefined)?.email === "ana@empresa.com")).toBe(true);
    expect(sent.map((s) => s.args.text)).toEqual(["Obrigado ana@empresa.com"]);
  });
});

describe("{{vars.x}} interpolation (F4)", () => {
  const vars = { nome: "Ana" };

  it("is applied to buttons (body, header, footer)", async () => {
    const { db } = fakeFlowDb();
    const nodes = nodeMap(
      node("start", "start", { next_node_key: "menu" }),
      node("menu", "send_buttons", {
        text: "{{vars.nome}}, escolha:",
        header_text: "Oi {{ vars.nome }}",
        footer_text: "Para {{vars.nome}}",
        buttons: [{ reply_id: "a", title: "A", next_node_key: "start" }],
      }),
    );
    await advanceFromNodeKey(db as never, run({ vars }), "start", nodes);
    expect(sent[0].args).toMatchObject({ bodyText: "Ana, escolha:", headerText: "Oi Ana", footerText: "Para Ana" });
  });

  it("is applied to lists", async () => {
    const { db } = fakeFlowDb();
    const nodes = nodeMap(
      node("start", "start", { next_node_key: "lista" }),
      node("lista", "send_list", {
        text: "{{vars.nome}}, veja:",
        button_label: "Ver",
        sections: [{ rows: [{ reply_id: "r", title: "R", next_node_key: "start" }] }],
      }),
    );
    await advanceFromNodeKey(db as never, run({ vars }), "start", nodes);
    expect(sent[0].args).toMatchObject({ bodyText: "Ana, veja:" });
  });

  it("accepts spaces inside the braces", async () => {
    const { db } = fakeFlowDb();
    const nodes = nodeMap(
      node("start", "start", { next_node_key: "m" }),
      node("m", "send_message", { text: "Prazer, {{ vars.nome }}!", next_node_key: "fim" }),
      node("fim", "end", {}),
    );
    await advanceFromNodeKey(db as never, run({ vars }), "start", nodes);
    expect(sent[0].args.text).toBe("Prazer, Ana!");
  });

  it("is applied to the handoff note", async () => {
    const { db, writes } = fakeFlowDb();
    const nodes = nodeMap(
      node("start", "start", { next_node_key: "h" }),
      node("h", "handoff", { note: "Lead: {{vars.nome}}" }),
    );
    await advanceFromNodeKey(db as never, run({ vars }), "start", nodes);
    expect(writes.events.find((e) => e.event_type === "handoff")?.payload.note).toBe("Lead: Ana");
  });
});

describe("handoff silences bots on the conversation (D7)", () => {
  const { handleReplyForActiveRun } = __flowEngineTest;
  const silencedUpdate = (u: Record<string, unknown>) =>
    u.status === "pending" && u.ai_autoreply_disabled === true && typeof u.bot_handoff_at === "string";

  it("handoff node", async () => {
    const { db, writes } = fakeFlowDb();
    const nodes = nodeMap(node("start", "start", { next_node_key: "h" }), node("h", "handoff", {}));
    await advanceFromNodeKey(db as never, run(), "start", nodes);
    expect(writes.conversationUpdates.some(silencedUpdate)).toBe(true);
  });

  it("fallback exhausted", async () => {
    const { db, writes } = fakeFlowDb({ flows: { fallback_policy: { on_unknown_reply: "reprompt", max_reprompts: 2, on_timeout_hours: 24, on_exhaust: "handoff" } } });
    const nodes = nodeMap(node("menu", "send_buttons", { text: "?", buttons: [{ reply_id: "a", title: "A", next_node_key: "menu" }] }));
    await handleReplyForActiveRun(
      db as never,
      run({ current_node_key: "menu", reprompt_count: 2 }),
      { kind: "text", text: "quero humano", meta_message_id: "wamid.h" } as never,
      nodes,
    );
    expect(writes.conversationUpdates.some(silencedUpdate)).toBe(true);
  });
});

describe("stale active run found by a new inbound (F8)", () => {
  const { expireIfStale } = __flowEngineTest;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const policy = { flows: { fallback_policy: { on_unknown_reply: "reprompt", max_reprompts: 2, on_timeout_hours: 24, on_exhaust: "handoff" } } };

  it("marks a run past on_timeout_hours as timed_out right away, with a timeout event", async () => {
    const { db, writes } = fakeFlowDb(policy);
    const expired = await expireIfStale(db as never, run({ last_advanced_at: hoursAgo(30) }));
    expect(expired).toBe(true);
    expect(writes.runUpdates.at(-1)).toMatchObject({ status: "timed_out", end_reason: "stale_on_inbound" });
    expect(writes.events.find((e) => e.event_type === "timeout")?.payload).toMatchObject({ reason: "stale_on_inbound", policy_hours: 24 });
  });

  it("leaves a run inside the window alone", async () => {
    const { db, writes } = fakeFlowDb(policy);
    expect(await expireIfStale(db as never, run({ last_advanced_at: hoursAgo(2) }))).toBe(false);
    expect(writes.runUpdates).toHaveLength(0);
  });
});
