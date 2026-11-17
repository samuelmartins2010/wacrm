import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { runReactivation } from '@/lib/reactivation/runner'
import { supabaseRunnerStore } from '@/lib/reactivation/supabase-store'

/**
 * Process due reactivation touches. Hit on a schedule (same pinger as
 * /api/automations/cron) with header `x-cron-secret` matching
 * AUTOMATION_CRON_SECRET. REACTIVATION_DRY_RUN=true skips Meta.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  if (request.headers.get('x-cron-secret') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runReactivation(
      {
        store: supabaseRunnerStore(supabaseAdmin()),
        send: engineSendTemplate,
        dryRun: process.env.REACTIVATION_DRY_RUN === 'true',
      },
      new Date(),
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[reactivation/cron] failed:', err)
    return NextResponse.json({ error: 'reactivation cron failed' }, { status: 500 })
  }
}
