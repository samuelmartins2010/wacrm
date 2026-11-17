// ============================================================
// Reativação — regras puras (sem I/O).
// Spec: docs/superpowers/specs/2026-11-17-reativacao-design.md
// Todas as datas "de calendário" usam America/Sao_Paulo.
// ============================================================

import type { ReactivationBand, ReactivationParam, ReactivationSettings, SendWindow } from '@/types'
import { isRecipientNotAllowedError, isValidE164, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'

export const TIME_ZONE = 'America/Sao_Paulo'
const DAY_MS = 86_400_000

interface LocalParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  weekday: number // 0 = Sunday
}

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hour12: false,
})

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localParts(d: Date): LocalParts {
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday),
  }
}

/** UTC instant for a wall-clock time in São Paulo. */
function localToInstant(year: number, month: number, day: number, hour: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour)
  const lp = localParts(new Date(guess))
  const asUtc = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute)
  const offset = asUtc - guess // local - utc
  return new Date(guess - offset)
}

/** Ordinal day number of the São Paulo calendar date. */
function localDayNumber(d: Date): number {
  const lp = localParts(d)
  return Math.floor(Date.UTC(lp.year, lp.month - 1, lp.day) / DAY_MS)
}

export function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

export function daysSince(iso: string, now: Date): number {
  return Math.max(0, localDayNumber(now) - localDayNumber(new Date(iso)))
}

export function dayKey(now: Date): string {
  const lp = localParts(now)
  return `${lp.year}-${String(lp.month).padStart(2, '0')}-${String(lp.day).padStart(2, '0')}`
}

export function bandForDays(
  days: number,
  t: { late: number; cooling: number; gone: number },
): ReactivationBand | null {
  if (days >= t.gone) return 'gone'
  if (days >= t.cooling) return 'cooling'
  if (days >= t.late) return 'late'
  return null
}

export type ExclusionReason =
  | 'do_not_contact'
  | 'invalid_phone'
  | 'in_active_campaign'
  | 'resting'
  | 'recent_outbound'
  | 'removed'

export interface EligibilityInput {
  phone: string | null
  do_not_contact: boolean
  has_active_enrollment: boolean
  last_enrollment_ended_at: string | null
  last_outbound_at: string | null
  removed?: boolean
}

export function exclusionFor(
  c: EligibilityInput,
  s: ReactivationSettings,
  now: Date,
): ExclusionReason | null {
  if (c.do_not_contact) return 'do_not_contact'
  if (!c.phone || !isValidE164(sanitizePhoneForMeta(c.phone))) return 'invalid_phone'
  if (c.has_active_enrollment) return 'in_active_campaign'
  if (c.last_enrollment_ended_at && daysSince(c.last_enrollment_ended_at, now) < s.rest_days) {
    return 'resting'
  }
  if (c.last_outbound_at && daysSince(c.last_outbound_at, now) < s.recent_outbound_days) {
    return 'recent_outbound'
  }
  if (c.removed) return 'removed'
  return null
}

function hoursFor(weekday: number, w: SendWindow): [number, number] | null {
  if (weekday === 0) return w.sun
  if (weekday === 6) return w.sat
  return w.mon_fri
}

export function isWithinWindow(now: Date, w: SendWindow): boolean {
  const lp = localParts(now)
  const h = hoursFor(lp.weekday, w)
  if (!h) return false
  return lp.hour >= h[0] && lp.hour < h[1]
}

/** Now if already open, else the next opening instant (searches up to 8 days). */
export function nextWindowOpen(now: Date, w: SendWindow): Date {
  if (isWithinWindow(now, w)) return now
  for (let i = 0; i <= 8; i++) {
    const lp = localParts(addDays(now, i))
    const h = hoursFor(lp.weekday, w)
    if (!h) continue
    const open = localToInstant(lp.year, lp.month, lp.day, h[0])
    if (open.getTime() > now.getTime()) return open
  }
  // No open hours configured at all: try again in a day.
  return addDays(now, 1)
}

/** Midnight of the current São Paulo calendar day. */
export function startOfLocalDay(now: Date): Date {
  const lp = localParts(now)
  return localToInstant(lp.year, lp.month, lp.day, 0)
}

/** Opening of the next São Paulo day's window (used when the daily limit is hit). */
export function nextDayWindowOpen(now: Date, w: SendWindow): Date {
  return nextWindowOpen(addDays(startOfLocalDay(now), 1), w)
}

export function normalizeOptout(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .toUpperCase()
}

export function isOptoutMessage(text: string, keywords: string[]): boolean {
  const n = normalizeOptout(text)
  if (!n) return false
  return keywords.some((k) => normalizeOptout(k) === n)
}

export type SendErrorKind = 'invalid_recipient' | 'retryable' | 'template_unavailable'

export function classifySendError(message: string): SendErrorKind {
  if (isRecipientNotAllowedError(message) || /contact phone invalid|131026/i.test(message)) {
    return 'invalid_recipient'
  }
  if (/132001|132015|132016|template.*(paused|disabled|does not exist)/i.test(message)) {
    return 'template_unavailable'
  }
  return 'retryable'
}

/** Template body values for a contact; Meta rejects empty params, so blanks fall back to "cliente". */
export function resolveParams(
  params: ReactivationParam[],
  c: { name: string | null; company: string | null },
): string[] {
  const name = c.name?.trim() || ''
  return params.map((p) => {
    switch (p.source) {
      case 'first_name':
        return name.split(/\s+/)[0] || 'cliente'
      case 'name':
        return name || 'cliente'
      case 'company':
        return c.company?.trim() || 'cliente'
      case 'fixed':
        return p.value
    }
  })
}
