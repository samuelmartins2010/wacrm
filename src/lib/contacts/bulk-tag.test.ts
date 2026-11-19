import { describe, expect, it } from "vitest";
import { bulkAddTag } from "./bulk-tag";

describe("bulkAddTag (D10)", () => {
  it("applies a tag to many contacts through contacts_bulk_add_tag, never row by row", async () => {
    const calls: { name: string; args: { p_contact_ids: string[]; p_tag_id: string } }[] = [];
    const client = {
      rpc: async (name: string, args: { p_contact_ids: string[]; p_tag_id: string }) => (calls.push({ name, args }), { data: args.p_contact_ids.length, error: null }),
      from: () => { throw new Error("must not write contact_tags directly"); },
    };
    const ids = Array.from({ length: 1200 }, (_, i) => `c${i}`);
    expect(await bulkAddTag(client as never, ids, "tag-T")).toBe(1200);
    expect(calls.map((c) => c.args.p_contact_ids.length)).toEqual([500, 500, 200]);
    expect(calls.every((c) => c.name === "contacts_bulk_add_tag" && c.args.p_tag_id === "tag-T")).toBe(true);
  });
  it("throws the database error", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "denied" } }) };
    await expect(bulkAddTag(client as never, ["a"], "t")).rejects.toThrow(/denied/);
  });
});
