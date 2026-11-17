import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { getSettings } from '@/lib/reactivation/queries'
import { errorResponse } from '@/lib/reactivation/http'
import type { SendWindow } from '@/types'

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent')
    return NextResponse.json({ settings: await getSettings(supabase, accountId) })
  } catch (err) {
    return errorResponse(err)
  }
}

const INT_FIELDS = [
  'band_late_days',
  'band_cooling_days',
  'band_gone_days',
  'rest_days',
  'recent_outbound_days',
  'daily_limit',
] as const

function validHours(h: unknown): h is [number, number] | null {
  if (h === null) return true
  return (
    Array.isArray(h) &&
    h.length === 2 &&
    h.every((x) => Number.isInteger(x) && x >= 0 && x <= 24) &&
    h[0] < h[1]
  )
}

export async function PUT(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }
    const current = await getSettings(supabase, accountId)
    const next = { ...current }

    for (const f of INT_FIELDS) {
      if (body[f] === undefined) continue
      const v = Number(body[f])
      const min = f === 'rest_days' || f === 'recent_outbound_days' ? 0 : 1
      if (!Number.isInteger(v) || v < min || v > 3650) {
        return NextResponse.json({ error: `Valor inválido para ${f}` }, { status: 400 })
      }
      next[f] = v
    }
    if (!(next.band_late_days < next.band_cooling_days && next.band_cooling_days < next.band_gone_days)) {
      return NextResponse.json(
        { error: 'As faixas precisam ser crescentes: Atrasado < Esfriando < Sumido.' },
        { status: 400 },
      )
    }
    if (body.send_window !== undefined) {
      const w = body.send_window as SendWindow
      if (!w || !validHours(w.mon_fri) || !validHours(w.sat) || !validHours(w.sun)) {
        return NextResponse.json({ error: 'Janela de horário inválida' }, { status: 400 })
      }
      next.send_window = { mon_fri: w.mon_fri, sat: w.sat, sun: w.sun }
    }
    if (body.optout_keywords !== undefined) {
      const kw = Array.isArray(body.optout_keywords)
        ? body.optout_keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
        : []
      if (!kw.length) {
        return NextResponse.json({ error: 'Informe ao menos uma palavra de saída.' }, { status: 400 })
      }
      next.optout_keywords = kw
    }
    if (body.optout_reply !== undefined) {
      const r = String(body.optout_reply).trim()
      if (!r || r.length > 1000) {
        return NextResponse.json({ error: 'Texto de confirmação inválido.' }, { status: 400 })
      }
      next.optout_reply = r
    }

    const { data, error } = await supabase
      .from('reactivation_settings')
      .upsert({ ...next, account_id: accountId, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: data })
  } catch (err) {
    return errorResponse(err)
  }
}
