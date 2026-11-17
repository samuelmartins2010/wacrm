import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { assertDraft, getCampaign, loadAccountTemplates } from '@/lib/reactivation/queries'
import { campaignPatchFromBody, errorResponse, type CampaignBody } from '@/lib/reactivation/http'

type Ctx = { params: Promise<{ id: string }> }

/** Campaign + report data: enrollments (with contact) and sends. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const { supabase, accountId } = await requireRole('agent')
    const campaign = await getCampaign(supabase, accountId, id)
    const { data: enrollments, error } = await supabase
      .from('reactivation_enrollments')
      .select('*, contact:contacts(id, name, phone)')
      .eq('campaign_id', id)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const ids = (enrollments ?? []).map((e) => e.id)
    let sends: unknown[] = []
    if (ids.length) {
      const { data } = await supabase
        .from('reactivation_sends')
        .select('enrollment_id, step, status, error, attempts, created_at')
        .in('enrollment_id', ids)
      sends = data ?? []
    }
    // Latest conversation per contact, for "open in inbox" links.
    const contactIds = (enrollments ?? []).map((e) => e.contact_id)
    const conversations: Record<string, string> = {}
    if (contactIds.length) {
      const { data } = await supabase
        .from('conversations')
        .select('id, contact_id, last_message_at')
        .in('contact_id', contactIds)
        .order('last_message_at', { ascending: false, nullsFirst: false })
      for (const c of data ?? []) conversations[c.contact_id] ??= c.id
    }
    return NextResponse.json({ campaign, enrollments: enrollments ?? [], sends, conversations })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const { supabase, accountId } = await requireRole('admin')
    const campaign = await getCampaign(supabase, accountId, id)
    assertDraft(campaign.status)
    const body = (await request.json().catch(() => null)) as CampaignBody | null
    if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    const r = await campaignPatchFromBody(body, () => loadAccountTemplates(supabase, accountId))
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    const { data, error } = await supabase
      .from('reactivation_campaigns')
      .update({ ...r.patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'draft')
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ campaign: data })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const { supabase, accountId } = await requireRole('admin')
    const campaign = await getCampaign(supabase, accountId, id)
    assertDraft(campaign.status)
    const { error } = await supabase
      .from('reactivation_campaigns')
      .delete()
      .eq('id', id)
      .eq('status', 'draft')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
