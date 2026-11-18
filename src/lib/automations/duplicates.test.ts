import { describe, expect, it } from "vitest";
import { sameTriggerWarnings } from "./duplicates";

const a = (id: string, created_at: string, trigger_type: string, trigger_config: Record<string, unknown> = {}, is_active = true) =>
  ({ id, name: id.toUpperCase(), created_at, trigger_type, trigger_config, is_active });

describe("sameTriggerWarnings (D6)", () => {
  it("flags active automations whose triggers overlap, with run order", () => {
    const w = sameTriggerWarnings([
      a("b", "2026-02-01", "keyword_match", { keywords: ["Preço"], match_type: "contains" }),
      a("a", "2026-01-01", "keyword_match", { keywords: ["preco"], match_type: "contains" }),
      a("c", "2026-03-01", "keyword_match", { keywords: ["horario"], match_type: "contains" }),
    ]);
    expect(w.get("a")).toEqual({ order: 1, total: 2, others: ["B"] });
    expect(w.get("b")).toEqual({ order: 2, total: 2, others: ["A"] });
    expect(w.has("c")).toBe(false);
  });
  it("a phrase containing another keyword overlaps (both fire on that message)", () => {
    const w = sameTriggerWarnings([
      a("a", "1", "keyword_match", { keywords: ["oi"] }),
      a("b", "2", "keyword_match", { keywords: ["oi tudo bem"] }),
    ]);
    expect(w.size).toBe(2);
  });
  it("same non-keyword trigger type overlaps; inactive ones are ignored", () => {
    const w = sameTriggerWarnings([
      a("a", "1", "new_contact_created"),
      a("b", "2", "new_contact_created"),
      a("c", "3", "new_contact_created", {}, false),
    ]);
    expect([...w.keys()].sort()).toEqual(["a", "b"]);
    expect(w.get("b")?.others).toEqual(["A"]);
  });
  it("interactive_reply overlaps only on a shared reply id", () => {
    const w = sameTriggerWarnings([
      a("a", "1", "interactive_reply", { reply_ids: ["x", "y"] }),
      a("b", "2", "interactive_reply", { reply_ids: ["y"] }),
      a("c", "3", "interactive_reply", { reply_ids: ["z"] }),
    ]);
    expect([...w.keys()].sort()).toEqual(["a", "b"]);
  });
});
