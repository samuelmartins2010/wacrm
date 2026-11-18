import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ setTagsCalls: [] as unknown[][] }));
vi.mock("@/lib/auth/api-context", () => ({
  requireApiKey: async () => ({ supabase: {}, accountId: "acc", scopes: ["contacts:write"] }),
}));
vi.mock("@/lib/api/v1/contacts", async (orig) => ({
  ...(await orig<object>()),
  resolveAuditUserId: async () => "u",
  findOrCreateContact: async () => ({ id: "c1", created: true }),
  setContactTags: async (...args: unknown[]) => {
    h.setTagsCalls.push(args);
  },
  getContactById: async () => ({ id: "c1" }),
}));

import { POST } from "./route";

describe("POST /api/v1/contacts (D12)", () => {
  it("creating ONE contact with tags is an individual change — tag_added fires", async () => {
    const res = await POST(
      new Request("http://x/api/v1/contacts", {
        method: "POST",
        body: JSON.stringify({ phone: "+5511999990000", tags: ["T"] }),
      }),
    );
    expect(res.status).toBe(201);
    expect(h.setTagsCalls).toHaveLength(1);
    const opts = h.setTagsCalls[0][5] as { bulk?: boolean } | undefined;
    expect(opts?.bulk).not.toBe(true);
  });
});
