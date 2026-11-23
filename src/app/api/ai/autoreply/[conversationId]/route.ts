import { NextResponse } from 'next/server'
import { drainAutomationTriggerEvents } from '@/lib/automations/engine'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

type Params = { params: Promise<{ conversationId: string }> }

/**
 * POST /api/ai/autoreply/[conversationId]  (agent+)
 *
 * Toggle the AI auto-reply bot for one conversation from the inbox — the
 * "Take over" / "Resume AI" banner.
 *
 * Body: { paused: boolean, assign_to_me?: boolean }
 *   - paused: true  → pause the bot here (a human is taking over). When
 *                     `assign_to_me` is set, also assign the thread to the
 *                     caller (the usual "Take over" flow) via the
 *                     `transfer_conversation` RPC, which records the event.
 *                     Assignment fires the `on_conversation_assigned` trigger.
 *   - paused: false → hand the thread back to the bot: clear the pause,
 *                     reset the per-conversation reply count so it gets
 *                     fresh slots, and clear the handoff note. Any assignee
 *                     is removed (same RPC, p_to_user_id null) so the bot
 *                     isn't blocked by the "human owns this" gate.
 *
 * Writes go through the RLS-scoped SSR client, so a conversation outside
 * the caller's account simply isn't found (404).
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    // Reuse the send bucket: this is a cheap per-user inbox action and
    // toggling it in a tight loop has no legitimate use.
    const limit = checkRateLimit(`ai-takeover:${userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    const { conversationId } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body.paused !== 'boolean') {
      return NextResponse.json(
        { error: 'paused (boolean) is required' },
        { status: 400 },
      )
    }
    const paused = body.paused as boolean
    const assignToMe = body.assign_to_me === true

    // Confirm the conversation is in the caller's account before writing.
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle()
    if (convErr) {
      console.error('[ai/autoreply] conversation lookup error:', convErr)
      return NextResponse.json(
        { error: 'Failed to load conversation' },
        { status: 500 },
      )
    }
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // The assignee change goes through transfer_conversation (caller's
    // RLS client) so it lands in conversation_events as the caller's
    // action. It runs BEFORE the pause write: if it's refused, the AI
    // state stays as it was.
    //   - "Take over" (paused + assign_to_me) → assign to the caller.
    //   - "Resume AI" → release ANY assignment, not just the caller's
    //     own: the auto-reply eligibility gate stands down whenever a
    //     human is assigned, so leaving a stale assignee (e.g. the agent
    //     a prior handoff routed to) would silently keep the bot muted
    //     and make "Resume AI" a no-op.
    const assignTo: string | null | undefined = paused
      ? assignToMe
        ? userId
        : undefined
      : null
    if (assignTo !== undefined) {
      const { error: rpcErr } = await supabase.rpc('transfer_conversation', {
        p_conversation_id: conversationId,
        p_to_user_id: assignTo,
        p_note: null,
      })
      if (rpcErr) {
        if (rpcErr.code === '42501') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        if (rpcErr.code === '22023') {
          return NextResponse.json({ error: rpcErr.message }, { status: 400 })
        }
        console.error('[ai/autoreply] transfer_conversation error:', rpcErr)
        return NextResponse.json(
          { error: 'Failed to update conversation' },
          { status: 500 },
        )
      }
    }

    const update: Record<string, unknown> = { ai_autoreply_disabled: paused }

    if (!paused) {
      // Resuming hands the thread *back to the bot*: clear the pause and
      // the handoff note (the assignee was released above).
      // Give the bot a fresh reply budget on this thread. This is a
      // deliberate, manual, rate-limited action (not automatable), so it
      // can't be used to bypass the per-conversation cap at scale — it's
      // a human choosing to re-engage the assistant.
      update.ai_reply_count = 0
      update.ai_handoff_summary = null
    }

    const { error: upErr } = await supabase
      .from('conversations')
      .update(update)
      .eq('id', conversationId)
      .eq('account_id', accountId)
    if (upErr) {
      console.error('[ai/autoreply] update error:', upErr)
      return NextResponse.json(
        { error: 'Failed to update conversation' },
        { status: 500 },
      )
    }

    // D3: "assign to me" fires conversation_assigned automations.
    if (assignTo) await drainAutomationTriggerEvents(accountId)

    return NextResponse.json({ success: true, paused })
  } catch (err) {
    return toErrorResponse(err)
  }
}
