import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  serializeContact,
  findOrCreateContact,
  ContactError,
} from './contacts';

describe('serializeContact', () => {
  it('flattens contact_tags(tags(*)) onto a tags array and nulls missing fields', () => {
    const row = {
      id: 'c1',
      phone: '+14155550123',
      name: 'Jane',
      email: null,
      company: 'Acme',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      contact_tags: [
        { tags: { id: 't1', name: 'vip', color: '#fff' } },
        { tags: null }, // orphaned join — dropped
      ],
    };
    expect(serializeContact(row)).toEqual({
      id: 'c1',
      phone: '+14155550123',
      name: 'Jane',
      email: null,
      company: 'Acme',
      avatar_url: null,
      tags: [{ id: 't1', name: 'vip', color: '#fff' }],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    });
  });

  it('tolerates a row with no contact_tags key', () => {
    const row = {
      id: 'c2',
      phone: '+1',
      name: null,
      email: null,
      company: null,
      avatar_url: null,
      created_at: 'a',
      updated_at: 'b',
    };
    expect(serializeContact(row).tags).toEqual([]);
  });
});

describe('findOrCreateContact', () => {
  const noopDb = {} as SupabaseClient;

  it('rejects a non-E.164 phone with a 400 ContactError', async () => {
    await expect(
      findOrCreateContact(noopDb, 'acc', 'user', { phone: 'not-a-number' })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      findOrCreateContact(noopDb, 'acc', 'user', { phone: 'not-a-number' })
    ).rejects.toBeInstanceOf(ContactError);
  });
});

vi.mock("@/lib/contacts/resolve-import-tags", async (orig) => ({
  ...(await orig<object>()),
  resolveImportTagIds: async (_db: unknown, o: { tagNames: string[] }) => ({
    tagIdByKey: new Map(o.tagNames.map((n) => [n.toLowerCase(), `id-${n}`])),
  }),
}));
vi.mock("@/lib/automations/engine", () => ({ drainAutomationTriggerEvents: async () => 0 }));

describe("setContactTags — import vs individual (D10)", () => {
  function fakeDb(current: string[]) {
    const calls: string[] = [];
    const db = {
      rpc: async (name: string) => (calls.push(`rpc:${name}`), { data: 1, error: null }),
      from: (table: string) => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "delete", "ilike", "limit"]) b[m] = () => b;
        b.insert = () => (calls.push(`insert:${table}`), b);
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve(table === "contact_tags" ? { data: current.map((tag_id) => ({ tag_id })), error: null } : { data: [], error: null }).then(res);
        return b;
      },
    };
    return { db, calls };
  }

  it("creating through the API (import) writes via contact_tags_insert_bulk", async () => {
    const { setContactTags } = await import("./contacts");
    const { db, calls } = fakeDb([]);
    await setContactTags(db as never, "acc", "u", "c1", ["T"], { bulk: true });
    expect(calls).toContain("rpc:contact_tags_insert_bulk");
    expect(calls).not.toContain("insert:contact_tags");
  });

  it("changing one contact's tags (PATCH) is an individual change", async () => {
    const { setContactTags } = await import("./contacts");
    const { db, calls } = fakeDb([]);
    await setContactTags(db as never, "acc", "u", "c1", ["T"]);
    expect(calls).toContain("insert:contact_tags");
    expect(calls).not.toContain("rpc:contact_tags_insert_bulk");
  });
});
