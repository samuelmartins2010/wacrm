import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { approveCampaign, getCampaign, setCampaignState } from '@/lib/reactivation/queries'
import { errorResponse, parseIds } from '@/lib/reactivation/http'

type Ctx = { params: Promise<{ id: string }> }

/** POST { action: 'approve' | 'pause' | 'resume' | 'finish', removedContactIds?: string[] } */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const { supabase, accountId, userId } = await requireRole('admin')
    // RLS check: the campaign must be visible to the caller's account.
    await getCampaign(supabase, accountId, id)

    const body = await request.json().catch(() => null)
    const action = body?.action
    const now = new Date()
    if (action === 'approve') {
      const r = await approveCampaign(
        supabaseAdmin(),
        accountId,
        id,
        userId,
        parseIds(body?.removedContactIds),
        now,
      )
      return NextResponse.json(r)
    }
    if (action === 'pause' || action === 'resume' || action === 'finish') {
      await setCampaignState(supabaseAdmin(), accountId, id, action, now)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (err) {
    return errorResponse(err)
  }
}
