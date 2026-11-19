import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { drainAutomationTriggerEvents } from '@/lib/automations/engine'

/**
 * POST /api/automations/events — D3: the screens write tags and
 * assignments straight to Supabase; the database records a
 * tag_added / conversation_assigned event (migration 055). The screen
 * pings this right after the write so the caller's account's events
 * fire now instead of on the next cron tick.
 */
export async function POST() {
  try {
    const ctx = await requireRole('agent')
    const fired = await drainAutomationTriggerEvents(ctx.accountId)
    return NextResponse.json({ fired })
  } catch (err) {
    return toErrorResponse(err)
  }
}
