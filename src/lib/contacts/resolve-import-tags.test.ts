import { describe, expect, it } from "vitest";
import { assignImportedContactTags } from "./resolve-import-tags";

function fakeClient() {
  const calls: { kind: string; name: string; args: unknown }[] = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args });
      return { data: Array.isArray((args as { p_rows: unknown[] }).p_rows) ? (args as { p_rows: unknown[] }).p_rows.length : 0, error: null };
    },
    from: (name: string) => {
      const b = { upsert: async (args: unknown) => (calls.push({ kind: "upsert", name, args }), { error: null }), insert: async (args: unknown) => (calls.push({ kind: "insert", name, args }), { error: null }) };
      return b;
    },
  };
  return { client, calls };
}

describe("import tags go through the bulk path (D10)", () => {
  it("writes contact_tags only via contact_tags_insert_bulk, in chunks", async () => {
    const { client, calls } = fakeClient();
    const assignments = Array.from({ length: 150 }, (_, i) => ({ contactId: `c${i}`, tagNames: ["T"] }));
    const n = await assignImportedContactTags(client as never, assignments, new Map([["t", "tag-T"]]));
    expect(n).toBe(150);
    expect(calls.every((c) => c.kind === "rpc" && c.name === "contact_tags_insert_bulk")).toBe(true);
    expect(calls).toHaveLength(2);
    expect((calls[0].args as { p_rows: unknown[] }).p_rows[0]).toEqual({ contact_id: "c0", tag_id: "tag-T" });
  });
});
