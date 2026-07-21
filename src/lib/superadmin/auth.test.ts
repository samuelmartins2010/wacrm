import { describe, it, expect } from 'vitest'
import { isSuperAdminEmail } from './auth'

describe('isSuperAdminEmail', () => {
  it('returns true when email matches env var exactly', () => {
    expect(isSuperAdminEmail('admin@example.com', 'admin@example.com')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isSuperAdminEmail('Admin@Example.COM', 'admin@example.com')).toBe(true)
  })

  it('returns false when email does not match', () => {
    expect(isSuperAdminEmail('other@example.com', 'admin@example.com')).toBe(false)
  })

  it('returns false when user email is undefined', () => {
    expect(isSuperAdminEmail(undefined, 'admin@example.com')).toBe(false)
  })

  it('returns false when env var is not set', () => {
    expect(isSuperAdminEmail('admin@example.com', undefined)).toBe(false)
  })

  it('returns false when both are undefined', () => {
    expect(isSuperAdminEmail(undefined, undefined)).toBe(false)
  })
})
