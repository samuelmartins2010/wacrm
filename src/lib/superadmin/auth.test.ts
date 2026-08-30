import { describe, it, expect } from 'vitest'
import { hasRequiredRole } from './auth'

describe('hasRequiredRole', () => {
  it('returns true when role is in the allowed list', () => {
    expect(hasRequiredRole('superadmin', ['superadmin', 'financeiro'])).toBe(true)
  })

  it('returns false when role is not in the allowed list', () => {
    expect(hasRequiredRole('suporte', ['superadmin', 'financeiro'])).toBe(false)
  })

  it('returns false when role is null', () => {
    expect(hasRequiredRole(null, ['superadmin'])).toBe(false)
  })

  it('returns false when role is undefined', () => {
    expect(hasRequiredRole(undefined, ['superadmin'])).toBe(false)
  })

  it('returns false when allowed list is empty', () => {
    expect(hasRequiredRole('superadmin', [])).toBe(false)
  })
})
