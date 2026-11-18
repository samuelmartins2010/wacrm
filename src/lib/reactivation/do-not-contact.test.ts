import { describe, it, expect } from 'vitest'
import { canChangeDoNotContact } from './do-not-contact'

describe('canChangeDoNotContact (D2)', () => {
  it('agent can mark', () => {
    expect(canChangeDoNotContact('agent', true)).toBe(true)
  })
  it('agent cannot unmark', () => {
    expect(canChangeDoNotContact('agent', false)).toBe(false)
  })
  it('admin and owner can unmark', () => {
    expect(canChangeDoNotContact('admin', false)).toBe(true)
    expect(canChangeDoNotContact('owner', false)).toBe(true)
  })
  it('viewer can do neither', () => {
    expect(canChangeDoNotContact('viewer', true)).toBe(false)
    expect(canChangeDoNotContact('viewer', false)).toBe(false)
  })
})
