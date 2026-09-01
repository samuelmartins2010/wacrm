import { describe, it, expect } from 'vitest'
import { isExpiringSoon, isExpired } from './account-status'

const FIXED_NOW = new Date('2026-08-30T12:00:00Z')

describe('isExpiringSoon', () => {
  it('returns false when renewalDate is null', () => {
    expect(isExpiringSoon(null, FIXED_NOW)).toBe(false)
  })

  it('returns true for a date 3 days in the future', () => {
    expect(isExpiringSoon('2026-09-02T12:00:00Z', FIXED_NOW)).toBe(true)
  })

  it('returns false for a date 8 days in the future', () => {
    expect(isExpiringSoon('2026-09-08T12:00:00Z', FIXED_NOW)).toBe(false)
  })

  it('returns false for a date already in the past (that is "expired", not "expiring")', () => {
    expect(isExpiringSoon('2026-08-20T12:00:00Z', FIXED_NOW)).toBe(false)
  })
})

describe('isExpired', () => {
  it('returns false when renewalDate is null', () => {
    expect(isExpired(null, FIXED_NOW)).toBe(false)
  })

  it('returns true for a date in the past', () => {
    expect(isExpired('2026-08-20T12:00:00Z', FIXED_NOW)).toBe(true)
  })

  it('returns false for a date in the future', () => {
    expect(isExpired('2026-09-02T12:00:00Z', FIXED_NOW)).toBe(false)
  })
})
