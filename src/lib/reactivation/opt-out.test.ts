import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isOptedOutPhone, loadOptedOut, optOutPhoneKeys, partitionBroadcastRecipients } from './opt-out'

function pagedDb(total: number, failOnPage?: number) {
  const ranges: [number, number][] = []
  const db = {
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.order = () => b
      b.range = (from: number, to: number) => {
        ranges.push([from, to])
        if (failOnPage !== undefined && ranges.length - 1 === failOnPage) {
          return Promise.resolve({ data: null, error: { message: 'boom' } })
        }
        const n = Math.max(0, Math.min(to, total - 1) - from + 1)
        const data = Array.from({ length: n }, (_, i) => ({ id: `id-${from + i}`, phone: `+55119${String(from + i).padStart(8, '0')}` }))
        return Promise.resolve({ data, error: null })
      }
      return b
    },
  } as unknown as SupabaseClient
  return { db, ranges }
}

describe('loadOptedOut', () => {
  it('pages past the 1000-row cap', async () => {
    const { db, ranges } = pagedDb(2500)
    const { ids, keys } = await loadOptedOut(db, 'acc')
    expect(ids.size).toBe(2500)
    expect(isOptedOutPhone('+5511900002499', keys)).toBe(true)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('throws when a page fails (fail closed)', async () => {
    const { db } = pagedDb(2500, 1)
    await expect(loadOptedOut(db, 'acc')).rejects.toThrow(/boom/)
  })
})

describe('phone variants for opt-out (9º dígito e 0 do DDD)', () => {
  it('a mobile saved with the 9th digit matches the number sent without it, and vice versa', () => {
    const keys = optOutPhoneKeys(['+55 (11) 99999-0000'])
    expect(isOptedOutPhone('+551199990000', keys)).toBe(true)
    const keys2 = optOutPhoneKeys(['551199990000'])
    expect(isOptedOutPhone('5511999990000', keys2)).toBe(true)
  })
  it('a trunk 0 before the area code still matches', () => {
    const keys = optOutPhoneKeys(['5511999990000'])
    expect(isOptedOutPhone('55011999990000', keys)).toBe(true)
  })
  it('a different number does not match', () => {
    const keys = optOutPhoneKeys(['5511999990000'])
    expect(isOptedOutPhone('5511999990001', keys)).toBe(false)
    expect(isOptedOutPhone('5521999990000', keys)).toBe(false)
  })
})

describe('partitionBroadcastRecipients', () => {
  it('drops by contact_id first and by phone variant when there is no contact_id', () => {
    const keys = optOutPhoneKeys(['5511988887777'])
    const { allowed, optedOut } = partitionBroadcastRecipients(
      [
        { phone: '5511900000001', contact_id: 'c-out' }, // opted out by id
        { phone: '551188887777' }, // CSV phone, same number without the 9
        { phone: '5511900000002', contact_id: 'c-ok' },
      ],
      new Set(['c-out']),
      keys,
    )
    expect(allowed.map((r) => r.phone)).toEqual(['5511900000002'])
    expect(optedOut.map((r) => r.phone)).toEqual(['5511900000001', '551188887777'])
  })
})
