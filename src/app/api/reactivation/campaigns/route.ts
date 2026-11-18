import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { loadAccountTemplates } from '@/lib/reactivation/queries'
import { campaignPatchFromBody, errorResponse, type CampaignBody } from '@/lib/reactivation/http'

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { data: campaigns, error } = await supabase
      .from('reactivation_campaigns')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Per-campaign enrollment status counts for the list view.
    const ids = (campaigns ?? []).map((c) => c.id)
    const stats: Record<string, Record<string, number>> = {}
    if (ids.length) {
      const { data: enr } = await supabase
        .from('reactivation_enrollments')
        .select('campaign_id, status')
        .in('campaign_id', ids)
      for (const e of enr ?? []) {
        stats[e.campaign_id] ??= {}
        stats[e.campaign_id][e.status] = (stats[e.campaign_id][e.status] ?? 0) + 1
      }
    }
    return NextResponse.json({ campaigns: campaigns ?? [], stats })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const body = (await request.json().catch(() => null)) as CampaignBody | null
    if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    const r = await campaignPatchFromBody(body, () => loadAccountTemplates(supabase, accountId))
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    const { data, error } = await supabase
      .from('reactivation_campaigns')
      .insert({ ...r.patch, account_id: accountId, created_by: userId, status: 'draft' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
