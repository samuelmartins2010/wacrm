import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from './queries'
import { MAX_DAILY_LIMIT, parseSettingsUpdate } from './settings'

const current = { account_id: 'a', ...DEFAULT_SETTINGS }

describe('parseSettingsUpdate', () => {
  it('accepts a valid change', () => {
    const r = parseSettingsUpdate(current, { daily_limit: 120 })
    expect('settings' in r && r.settings.daily_limit).toBe(120)
  })
  it(`rejects a daily limit above ${1000}`, () => {
    expect(parseSettingsUpdate(current, { daily_limit: 5000 })).toEqual({ error: expect.stringMatching(/1000/) })
    expect(MAX_DAILY_LIMIT).toBe(1000)
  })
  it('rejects zero / negative / fractional limits', () => {
    for (const v of [0, -1, 1.5, 'x']) expect('error' in parseSettingsUpdate(current, { daily_limit: v })).toBe(true)
  })
  it('rejects bands out of order', () => {
    expect('error' in parseSettingsUpdate(current, { band_late_days: 90 })).toBe(true)
  })
  it('rejects an invalid send window and empty keywords', () => {
    expect('error' in parseSettingsUpdate(current, { send_window: { mon_fri: [19, 9], sat: null, sun: null } })).toBe(true)
    expect('error' in parseSettingsUpdate(current, { optout_keywords: ['  '] })).toBe(true)
  })
  it('ignores fields it does not know (account_id cannot be changed)', () => {
    const r = parseSettingsUpdate(current, { account_id: 'other', daily_limit: 60 })
    expect('settings' in r && r.settings.account_id).toBe('a')
  })
})
