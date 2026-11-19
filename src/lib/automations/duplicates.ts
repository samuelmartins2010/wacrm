import { normalizeKeywordText } from '@/lib/keywords'

interface AutomationLike {
  id: string
  name: string
  created_at: string
  trigger_type: string
  trigger_config: Record<string, unknown> | null
  is_active: boolean
}

export interface SameTriggerWarning {
  /** 1-based position in the run order (created_at) among the overlapping ones. */
  order: number
  total: number
  /** Names of the other active automations that fire on the same event. */
  others: string[]
}

const words = (s: string) => ` ${normalizeKeywordText(s)} `

function keywordsOverlap(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = ((a.keywords as unknown[]) ?? []).map(String).filter((k) => normalizeKeywordText(k))
  const kb = ((b.keywords as unknown[]) ?? []).map(String).filter((k) => normalizeKeywordText(k))
  const exactA = a.match_type === 'exact'
  const exactB = b.match_type === 'exact'
  return ka.some((x) =>
    kb.some((y) => {
      const wx = words(x)
      const wy = words(y)
      if (wx === wy) return true
      // A message equal to the longer keyword fires both, unless the
      // shorter one is "exact" (then only that exact text fires it).
      if (wy.includes(wx) && !exactA) return true
      if (wx.includes(wy) && !exactB) return true
      return false
    }),
  )
}

function overlap(a: AutomationLike, b: AutomationLike): boolean {
  if (a.trigger_type !== b.trigger_type) return false
  const ca = a.trigger_config ?? {}
  const cb = b.trigger_config ?? {}
  if (a.trigger_type === 'keyword_match') return keywordsOverlap(ca, cb)
  if (a.trigger_type === 'interactive_reply') {
    const ra = new Set(((ca.reply_ids as unknown[]) ?? []).map(String))
    return ((cb.reply_ids as unknown[]) ?? []).some((r) => ra.has(String(r)))
  }
  return true
}

/**
 * D6: active automations that fire on the same event all run, oldest
 * first. Returns, per affected automation, its position in that order
 * and the names of the others — for the warning on the list screen.
 */
export function sameTriggerWarnings(list: AutomationLike[]): Map<string, SameTriggerWarning> {
  const active = list
    .filter((x) => x.is_active)
    .sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id < y.id ? -1 : 1))
  const out = new Map<string, SameTriggerWarning>()
  for (const x of active) {
    const group = active.filter((y) => y === x || overlap(x, y))
    if (group.length < 2) continue
    out.set(x.id, {
      order: group.indexOf(x) + 1,
      total: group.length,
      others: group.filter((y) => y !== x).map((y) => y.name),
    })
  }
  return out
}
