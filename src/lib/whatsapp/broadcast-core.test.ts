import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createBroadcast,
  BroadcastError,
  excludeOptedOut,
  loadOptedOutContactIds,
} from './broadcast-core';

// These assertions all fire in the pure validation prologue, before
// any Supabase call — a bare stub is enough.
const db = {} as SupabaseClient;

describe('createBroadcast validation', () => {
  it('rejects a missing template_name', async () => {
    await expect(
      createBroadcast(db, 'acc', 'user', {
        templateName: '',
        recipients: [{ to: '+14155550123' }],
      })
    ).rejects.toMatchObject({ code: 'bad_request', status: 400 });
  });

  it('rejects an empty recipient list', async () => {
    await expect(
      createBroadcast(db, 'acc', 'user', {
        templateName: 'promo',
        recipients: [],
      })
    ).rejects.toBeInstanceOf(BroadcastError);
  });

  it('rejects more than 1000 recipients', async () => {
    const recipients = Array.from({ length: 1001 }, () => ({
      to: '+14155550123',
    }));
    await expect(
      createBroadcast(db, 'acc', 'user', { templateName: 'promo', recipients })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('excludeOptedOut', () => {
  it('skips do_not_contact recipients and counts them', () => {
    const rows = [
      { contactId: 'a', phone: '+1', params: [] },
      { contactId: 'b', phone: '+2', params: [] },
    ];
    expect(excludeOptedOut(rows, new Set(['b']))).toEqual({
      kept: [{ contactId: 'a', phone: '+1', params: [] }],
      optedOut: 1,
    });
  });
});

describe('loadOptedOutContactIds', () => {
  function fakeDb(handler: (ids: string[]) => { data: { id: string }[] | null; error: { message: string } | null }) {
    const calls: string[][] = [];
    const db = {
      from: () => {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.in = (_col: string, ids: string[]) => {
          calls.push(ids);
          return Promise.resolve(handler(ids));
        };
        return b;
      },
    } as unknown as SupabaseClient;
    return { db, calls };
  }

  it('queries in chunks and merges the results', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const { db, calls } = fakeDb((chunk) => ({
      data: chunk.includes('id-420') ? [{ id: 'id-420' }] : [],
      error: null,
    }));
    const out = await loadOptedOutContactIds(db, 'acc', ids);
    expect(calls.map((c) => c.length)).toEqual([200, 200, 50]);
    expect([...out]).toEqual(['id-420']);
  });

  it('fails closed when the query errors', async () => {
    const { db } = fakeDb(() => ({ data: null, error: { message: 'URI too long' } }));
    await expect(loadOptedOutContactIds(db, 'acc', ['a'])).rejects.toBeInstanceOf(BroadcastError);
  });
});
