import { beforeEach, describe, expect, it, vi } from 'vitest'

// Banner da I.A no Inbox: "Assumir" / "Retomar I.A". A troca de responsável
// passa pela RPC transfer_conversation (grava o evento); o update da
// conversa só mexe na pausa da I.A.

const h = vi.hoisted(() => ({
  calls: [] as { kind: 'rpc' | 'update'; name?: string; args: unknown }[],
  // filtros .eq() da busca e do update, para garantir o escopo da conta
  lookupEqs: [] as [string, unknown][],
  updateEqs: [] as [string, unknown][],
  rpcError: null as { code?: string; message: string } | null,
  updateError: null as { message: string } | null,
  drain: vi.fn(),
}))

function fakeSupabase() {
  return {
    rpc: (name: string, args: unknown) => {
      h.calls.push({ kind: 'rpc', name, args })
      return Promise.resolve({ data: null, error: h.rpcError })
    },
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (col: string, val: unknown) => {
        h.lookupEqs.push([col, val])
        return chain
      }
      chain.maybeSingle = () =>
        Promise.resolve({ data: { id: 'conv-1' }, error: null })
      chain.update = (payload: Record<string, unknown>) => {
        h.calls.push({ kind: 'update', args: payload })
        const upd: Record<string, unknown> = {}
        upd.eq = (col: string, val: unknown) => {
          h.updateEqs.push([col, val])
          return upd
        }
        upd.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ error: h.updateError }).then(res)
        return upd
      }
      return chain
    },
  }
}

vi.mock('@/lib/auth/account', () => ({
  requireRole: async () => ({
    supabase: fakeSupabase(),
    accountId: 'acct-1',
    userId: 'user-1',
  }),
  toErrorResponse: () =>
    new Response(JSON.stringify({ error: 'x' }), { status: 500 }),
}))
vi.mock('@/lib/automations/engine', () => ({
  drainAutomationTriggerEvents: h.drain,
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
  RATE_LIMITS: { send: { limit: 60, windowMs: 60_000 } },
}))

import { POST } from './route'

function call(body: unknown) {
  return POST(
    new Request('http://localhost/api/ai/autoreply/conv-1', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ conversationId: 'conv-1' }) },
  )
}

beforeEach(() => {
  h.calls = []
  h.lookupEqs = []
  h.updateEqs = []
  h.drain.mockReset()
  h.rpcError = null
  h.updateError = null
})

describe('POST /api/ai/autoreply/[conversationId]', () => {
  it('"Assumir" transfers to the caller via RPC, then pauses without assigned_agent_id', async () => {
    const res = await call({ paused: true, assign_to_me: true })
    expect(res.status).toBe(200)
    expect(h.calls).toEqual([
      {
        kind: 'rpc',
        name: 'transfer_conversation',
        args: {
          p_conversation_id: 'conv-1',
          p_to_user_id: 'user-1',
          p_note: null,
        },
      },
      { kind: 'update', args: { ai_autoreply_disabled: true } },
    ])
    expect(h.drain).toHaveBeenCalledWith('acct-1')
  })

  it('pausing without assign_to_me does not call the RPC', async () => {
    const res = await call({ paused: true })
    expect(res.status).toBe(200)
    expect(h.calls).toEqual([
      { kind: 'update', args: { ai_autoreply_disabled: true } },
    ])
    expect(h.drain).not.toHaveBeenCalled()
  })

  it('"Retomar I.A" removes the assignee via RPC (null), then resumes the bot', async () => {
    const res = await call({ paused: false })
    expect(res.status).toBe(200)
    expect(h.calls).toEqual([
      {
        kind: 'rpc',
        name: 'transfer_conversation',
        args: { p_conversation_id: 'conv-1', p_to_user_id: null, p_note: null },
      },
      {
        kind: 'update',
        args: {
          ai_autoreply_disabled: false,
          ai_reply_count: 0,
          ai_handoff_summary: null,
        },
      },
    ])
    expect(h.drain).not.toHaveBeenCalled()
  })

  it('RPC 42501 → 403 and no update', async () => {
    h.rpcError = { code: '42501', message: 'permission denied' }
    const res = await call({ paused: true, assign_to_me: true })
    expect(res.status).toBe(403)
    expect(h.calls.some((c) => c.kind === 'update')).toBe(false)
    expect(h.drain).not.toHaveBeenCalled()
  })

  it('RPC 22023 → 400 with the message and no update', async () => {
    h.rpcError = {
      code: '22023',
      message: 'assignee has a view-only role in this account',
    }
    const res = await call({ paused: false })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('assignee has a view-only role in this account')
    expect(h.calls.some((c) => c.kind === 'update')).toBe(false)
  })

  it('other RPC errors → 500 and no update', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.rpcError = { code: 'XX000', message: 'boom' }
    const res = await call({ paused: true, assign_to_me: true })
    expect(res.status).toBe(500)
    expect(h.calls.some((c) => c.kind === 'update')).toBe(false)
  })

  it('busca e update ficam presos à conta de quem chama', async () => {
    await call({ paused: true, assign_to_me: true })
    expect(h.lookupEqs).toEqual(expect.arrayContaining([['id', 'conv-1'], ['account_id', 'acct-1']]))
    expect(h.updateEqs).toEqual(expect.arrayContaining([['id', 'conv-1'], ['account_id', 'acct-1']]))
  })

  it('update que falha depois da RPC → 500 e não dispara as automações', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.updateError = { message: 'boom' }
    const res = await call({ paused: true, assign_to_me: true })
    expect(res.status).toBe(500)
    expect(h.drain).not.toHaveBeenCalled()
  })
})
