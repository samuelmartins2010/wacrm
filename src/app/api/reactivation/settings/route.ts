import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getSettings } from '@/lib/reactivation/queries'
import { errorResponse } from '@/lib/reactivation/http'
import { parseSettingsUpdate } from '@/lib/reactivation/settings'

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent')
    return NextResponse.json({ settings: await getSettings(supabase, accountId) })
  } catch (err) {
    return errorResponse(err)
  }
}

/**
 * Ajustes só mudam por aqui: o RLS não dá escrita ao client (migration
 * 047). Valida e grava com service role, restrito à conta da sessão.
 */
export async function PUT(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    const parsed = parseSettingsUpdate(await getSettings(supabase, accountId), body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { data, error } = await supabaseAdmin()
      .from('reactivation_settings')
      .upsert({ ...parsed.settings, account_id: accountId, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: data })
  } catch (err) {
    return errorResponse(err)
  }
}
