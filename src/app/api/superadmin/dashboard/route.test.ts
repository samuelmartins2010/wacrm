import { describe, it, expect } from 'vitest'
import { monthKey, lastNMonthKeys } from './route'

describe('monthKey', () => {
  it('extracts YYYY-MM from an ISO timestamp', () => {
    expect(monthKey('2026-08-30T13:48:41.305639+00:00')).toBe('2026-08')
  })
})

describe('lastNMonthKeys', () => {
  it('returns 12 keys ending on the current month, oldest first', () => {
    const now = new Date('2026-08-30T12:00:00Z')
    const keys = lastNMonthKeys(12, now)
    expect(keys).toHaveLength(12)
    expect(keys[keys.length - 1]).toBe('2026-08')
    expect(keys[0]).toBe('2025-09')
  })

  it('handles a January "now" without going to a negative/invalid month', () => {
    const now = new Date('2026-01-15T12:00:00Z')
    const keys = lastNMonthKeys(3, now)
    expect(keys).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('returns keys with no duplicates and no gaps', () => {
    const now = new Date('2026-08-30T12:00:00Z')
    const keys = lastNMonthKeys(12, now)
    expect(new Set(keys).size).toBe(12)
  })
})
