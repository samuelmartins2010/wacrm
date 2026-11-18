import type { ReactivationSettings, SendWindow } from '@/types'

/** Same ceiling as the DB check (migration 047). */
export const MAX_DAILY_LIMIT = 1000

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

/** Merge a PUT body into the current settings, or explain what is wrong (PT-BR). */
export function parseSettingsUpdate(
  current: ReactivationSettings,
  body: Record<string, unknown>,
): { settings: ReactivationSettings } | { error: string } {
  const next: ReactivationSettings = { ...current }

  for (const f of INT_FIELDS) {
    if (body[f] === undefined) continue
    const v = Number(body[f])
    const min = f === 'rest_days' || f === 'recent_outbound_days' ? 0 : 1
    const max = f === 'daily_limit' ? MAX_DAILY_LIMIT : 3650
    if (!Number.isInteger(v) || v < min || v > max) {
      return {
        error:
          f === 'daily_limit'
            ? `O limite diário deve ficar entre 1 e ${MAX_DAILY_LIMIT}.`
            : `Valor inválido para ${f}.`,
      }
    }
    next[f] = v
  }
  if (!(next.band_late_days < next.band_cooling_days && next.band_cooling_days < next.band_gone_days)) {
    return { error: 'As faixas precisam ser crescentes: Atrasado < Esfriando < Sumido.' }
  }
  if (body.send_window !== undefined) {
    const w = body.send_window as SendWindow
    if (!w || !validHours(w.mon_fri) || !validHours(w.sat) || !validHours(w.sun)) {
      return { error: 'Janela de horário inválida.' }
    }
    next.send_window = { mon_fri: w.mon_fri, sat: w.sat, sun: w.sun }
  }
  if (body.optout_keywords !== undefined) {
    const kw = Array.isArray(body.optout_keywords)
      ? body.optout_keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
      : []
    if (!kw.length) return { error: 'Informe ao menos uma palavra de saída.' }
    next.optout_keywords = kw
  }
  if (body.optout_reply !== undefined) {
    const r = String(body.optout_reply).trim()
    if (!r || r.length > 1000) return { error: 'Texto de confirmação inválido.' }
    next.optout_reply = r
  }
  return { settings: next }
}
