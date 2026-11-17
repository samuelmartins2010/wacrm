import { describe, it, expect } from 'vitest'
import type { ReactivationSettings, SendWindow } from '@/types'
import {
  addDays,
  bandForDays,
  classifySendError,
  dayKey,
  daysSince,
  exclusionFor,
  isOptoutMessage,
  isWithinWindow,
  nextDayWindowOpen,
  nextWindowOpen,
  normalizeOptout,
  startOfLocalDay,
  type EligibilityInput,
} from './rules'

const BANDS = { late: 30, cooling: 60, gone: 120 }
const WINDOW: SendWindow = { mon_fri: [9, 19], sat: [9, 13], sun: null }
const KEYWORDS = ['SAIR', 'PARAR', 'STOP']

const settings: ReactivationSettings = {
  account_id: 'a',
  band_late_days: 30,
  band_cooling_days: 60,
  band_gone_days: 120,
  rest_days: 60,
  recent_outbound_days: 7,
  daily_limit: 50,
  send_window: WINDOW,
  optout_keywords: KEYWORDS,
  optout_reply: 'x',
}

// Tuesday 2026-11-17 10:00 in São Paulo (UTC-3) = 13:00 UTC.
const NOW = new Date('2026-11-17T13:00:00Z')
const ago = (days: number) => addDays(NOW, -days).toISOString()

const base: EligibilityInput = {
  phone: '+5511999998888',
  do_not_contact: false,
  has_active_enrollment: false,
  last_enrollment_ended_at: null,
  last_outbound_at: null,
}

describe('bandForDays', () => {
  it('returns null below the late threshold', () => {
    expect(bandForDays(29, BANDS)).toBeNull()
  })
  it('maps thresholds 30/60/120 to late/cooling/gone', () => {
    expect(bandForDays(30, BANDS)).toBe('late')
    expect(bandForDays(59, BANDS)).toBe('late')
    expect(bandForDays(60, BANDS)).toBe('cooling')
    expect(bandForDays(120, BANDS)).toBe('gone')
    expect(bandForDays(900, BANDS)).toBe('gone')
  })
})

describe('daysSince', () => {
  it('counts calendar days in Sao Paulo', () => {
    // 2026-11-16 23:30 SP (02:30Z on the 17th) is "yesterday" at 10:00 SP on the 17th.
    expect(daysSince('2026-11-17T02:30:00Z', NOW)).toBe(1)
    expect(daysSince(ago(35), NOW)).toBe(35)
  })
})

describe('exclusionFor', () => {
  it('returns null for an eligible contact', () => {
    expect(exclusionFor(base, settings, NOW)).toBeNull()
  })
  it('do_not_contact wins over invalid_phone', () => {
    expect(exclusionFor({ ...base, do_not_contact: true, phone: '123' }, settings, NOW)).toBe(
      'do_not_contact',
    )
  })
  it('flags invalid phones', () => {
    expect(exclusionFor({ ...base, phone: '123' }, settings, NOW)).toBe('invalid_phone')
    expect(exclusionFor({ ...base, phone: null }, settings, NOW)).toBe('invalid_phone')
  })
  it('flags contacts in an active campaign', () => {
    expect(exclusionFor({ ...base, has_active_enrollment: true }, settings, NOW)).toBe(
      'in_active_campaign',
    )
  })
  it('rests for rest_days after the enrollment ended', () => {
    expect(exclusionFor({ ...base, last_enrollment_ended_at: ago(59) }, settings, NOW)).toBe(
      'resting',
    )
    expect(exclusionFor({ ...base, last_enrollment_ended_at: ago(61) }, settings, NOW)).toBeNull()
  })
  it('flags recent outbound messages', () => {
    expect(exclusionFor({ ...base, last_outbound_at: ago(6) }, settings, NOW)).toBe(
      'recent_outbound',
    )
    expect(exclusionFor({ ...base, last_outbound_at: ago(8) }, settings, NOW)).toBeNull()
  })
  it('flags manual removals last', () => {
    expect(exclusionFor({ ...base, removed: true }, settings, NOW)).toBe('removed')
  })
})

describe('send window', () => {
  it('window at 22:30 UTC Friday is closed', () => {
    // Friday 2026-11-20 19:30 in SP.
    expect(isWithinWindow(new Date('2026-11-20T22:30:00Z'), WINDOW)).toBe(false)
  })
  it('weekday morning is open', () => {
    expect(isWithinWindow(NOW, WINDOW)).toBe(true)
  })
  it('saturday is open until 13:00', () => {
    expect(isWithinWindow(new Date('2026-11-21T15:59:00Z'), WINDOW)).toBe(true) // 12:59 SP
    expect(isWithinWindow(new Date('2026-11-21T16:00:00Z'), WINDOW)).toBe(false) // 13:00 SP
  })
  it('sunday is closed', () => {
    expect(isWithinWindow(new Date('2026-11-22T14:00:00Z'), WINDOW)).toBe(false)
  })
  it('nextWindowOpen from saturday afternoon is monday 09:00 SP', () => {
    expect(nextWindowOpen(new Date('2026-11-21T17:00:00Z'), WINDOW).toISOString()).toBe(
      '2026-11-23T12:00:00.000Z',
    )
  })
  it('nextWindowOpen before opening is the same day', () => {
    // Tuesday 07:00 SP → Tuesday 09:00 SP
    expect(nextWindowOpen(new Date('2026-11-17T10:00:00Z'), WINDOW).toISOString()).toBe(
      '2026-11-17T12:00:00.000Z',
    )
  })
})

describe('dayKey', () => {
  it('dayKey uses Sao Paulo', () => {
    expect(dayKey(new Date('2026-11-18T02:00:00Z'))).toBe('2026-11-17')
  })
})

describe('opt-out', () => {
  it('normalizes punctuation, spaces, accents and case', () => {
    expect(normalizeOptout('  Sáir! ')).toBe('SAIR')
  })
  it('accepts variations of the keyword', () => {
    for (const t of ['Sair.', ' sair ', 'SÁIR', 'stop!']) {
      expect(isOptoutMessage(t, KEYWORDS)).toBe(true)
    }
  })
  it('rejects sentences and non-keywords', () => {
    expect(isOptoutMessage('quero sair do grupo', KEYWORDS)).toBe(false)
    expect(isOptoutMessage('cancelar', KEYWORDS)).toBe(false)
    expect(isOptoutMessage('', KEYWORDS)).toBe(false)
  })
})

describe('classifySendError', () => {
  it('recipient not allowed is invalid_recipient', () => {
    expect(classifySendError('(#131030) Recipient phone number not in allowed list')).toBe(
      'invalid_recipient',
    )
    expect(classifySendError('contact phone invalid: 123')).toBe('invalid_recipient')
  })
  it('marketing limit is retryable', () => {
    expect(classifySendError('(#131049) This message was not delivered')).toBe('retryable')
  })
  it('missing template is template_unavailable', () => {
    expect(classifySendError('(#132001) Template name does not exist in the translation')).toBe(
      'template_unavailable',
    )
  })
})

describe('nextDayWindowOpen', () => {
  it('skips to the next day opening even while the window is open', () => {
    // Tuesday 10:00 SP → Wednesday 09:00 SP
    expect(nextDayWindowOpen(NOW, WINDOW).toISOString()).toBe('2026-11-18T12:00:00.000Z')
  })
  it('from friday goes to saturday 09:00', () => {
    expect(nextDayWindowOpen(new Date('2026-11-20T13:00:00Z'), WINDOW).toISOString()).toBe(
      '2026-11-21T12:00:00.000Z',
    )
  })
})

describe('startOfLocalDay', () => {
  it('is midnight in Sao Paulo', () => {
    expect(startOfLocalDay(new Date('2026-11-18T02:00:00Z')).toISOString()).toBe(
      '2026-11-17T03:00:00.000Z',
    )
  })
})
