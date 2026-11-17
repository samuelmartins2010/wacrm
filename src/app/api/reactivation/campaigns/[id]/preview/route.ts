import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { campaignFilters, getCampaign, loadCandidates } from '@/lib/reactivation/queries'
import { errorResponse } from '@/lib/reactivation/http'

type Ctx = { params: Promise<{ id: string }> }

/** Audience review for a draft: every matching contact with its exclusion reason. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const { supabase, accountId } = await requireRole('admin')
    const campaign = await getCampaign(supabase, accountId, id)
    const candidates = await loadCandidates(supabase, accountId, campaignFilters(campaign), new Date())
    const eligible = candidates.filter((c) => c.exclusion === null)
    const excluded = candidates.filter((c) => c.exclusion !== null)
    return NextResponse.json({ eligible, excluded })
  } catch (err) {
    return errorResponse(err)
  }
}
