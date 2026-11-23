import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mensagem enviada pela API v1 conta como robô: grava sent_via_api = true
// (o banco não zera a espera do cliente por ela). O Inbox não passa o
// parâmetro, então continua gravando false.

vi.mock('@/lib/whatsapp/meta-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp/meta-api')>()),
  sendTextMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.TEST' }),
}));
vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: () => 'token',
  encrypt: (s: string) => s,
  isLegacyFormat: () => false,
}));
vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: () => fakeDb([]) }));

import { sendMessageToConversation } from './send-message';

type Insert = { table: string; row: Record<string, unknown> };

function fakeDb(inserts: Insert[]): SupabaseClient {
  const rows: Record<string, Record<string, unknown>> = {
    conversations: {
      id: 'conv-1',
      account_id: 'acct-1',
      contact: { id: 'ct-1', phone: '+5511900000001' },
    },
    whatsapp_config: { id: 'cfg-1', phone_number_id: 'pn', access_token: 'enc' },
  };
  function q(table: string) {
    let payload: Record<string, unknown> | null = null;
    const b: Record<string, unknown> = {};
    const self = () => b;
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'update', 'gte', 'lte']) b[m] = self;
    b.insert = (row: Record<string, unknown>) => {
      payload = row;
      inserts.push({ table, row });
      return b;
    };
    const result = () => ({ data: payload ? { id: 'msg-1', ...payload } : rows[table] ?? null, error: null });
    b.single = async () => result();
    b.maybeSingle = async () => result();
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return b;
  }
  return { from: q, rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient;
}

const params = { conversationId: 'conv-1', messageType: 'text', contentText: 'oi' };

describe('sendMessageToConversation: sent_via_api', () => {
  it('com sentViaApi: true grava a mensagem com sent_via_api = true', async () => {
    const inserts: Insert[] = [];
    await sendMessageToConversation(fakeDb(inserts), 'acct-1', { ...params, sentViaApi: true });
    const msg = inserts.find((i) => i.table === 'messages');
    expect(msg?.row.sender_type).toBe('agent');
    expect(msg?.row.sent_via_api).toBe(true);
  });

  it('sem o parâmetro (Inbox) grava sent_via_api = false', async () => {
    const inserts: Insert[] = [];
    await sendMessageToConversation(fakeDb(inserts), 'acct-1', params);
    expect(inserts.find((i) => i.table === 'messages')?.row.sent_via_api).toBe(false);
  });
});
