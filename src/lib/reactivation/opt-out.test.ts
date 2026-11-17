import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadOptedOutPhones } from './opt-out'

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
        const data = Array.from({ length: n }, (_, i) => ({ phone: `+55119${String(from + i).padStart(8, '0')}` }))
        return Promise.resolve({ data, error: null })
      }
      return b
    },
  } as unknown as SupabaseClient
  return { db, ranges }
}

describe('loadOptedOutPhones', () => {
  it('pages past the 1000-row cap', async () => {
    const { db, ranges } = pagedDb(2500)
    const phones = await loadOptedOutPhones(db, 'acc')
    expect(phones.size).toBe(2500)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('throws when a page fails (fail closed)', async () => {
    const { db } = pagedDb(2500, 1)
    await expect(loadOptedOutPhones(db, 'acc')).rejects.toThrow(/boom/)
  })
})
