import { describe, it, expect, vi } from 'vitest'
import type { ReactivationEnrollment, ReactivationSend } from '@/types'
import { DEFAULT_SETTINGS } from './queries'
import {
  handleReactivationInbound,
  mirrorReactivationStatus,
  type InboundInput,
  type InboundStore,
} from './inbound'

const NOW = new Date('2026-11-17T13:00:00Z')

function enrollment(over: Partial<ReactivationEnrollment> = {}): ReactivationEnrollment {
  return {
    id: 'e1',
    account_id: 'acc',
    campaign_id: 'camp',
    contact_id: 'c1',
    status: 'active',
    current_step: 1,
    next_run_at: NOW.toISOString(),
    replied_at: null,
    replied_step: null,
    ended_at: null,
    end_reason: null,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

class Mem implements InboundStore {
  lastInbound: string | null = null
  doNotContact = false
  enrollments: ReactivationEnrollment[] = []
  recentSend = false
  dryRunTexts: string[] = []
  sends: ReactivationSend[] = []

  async touchLastInbound(_c: string, iso: string) {
    this.lastInbound = iso
  }
  async openEnrollments() {
    return this.enrollments.filter((e) => e.status === 'pending' || e.status === 'active')
  }
  async hasRecentSend() {
    return this.recentSend
  }
  async getSettings() {
    return { account_id: 'acc', ...DEFAULT_SETTINGS }
  }
  async markDoNotContact() {
    this.doNotContact = true
  }
  async updateEnrollment(id: string, patch: Partial<ReactivationEnrollment>, onlyOpen = false) {
    const e = this.enrollments.find((x) => x.id === id)!
    if (onlyOpen && e.status !== 'pending' && e.status !== 'active') return false
    Object.assign(e, patch)
    return true
  }
  async insertDryRunText(_conv: string, text: string) {
    this.dryRunTexts.push(text)
  }
  pausedCampaigns: { id: string; reason: string }[] = []
  async getEnrollment(id: string) {
    const e = this.enrollments.find((x) => x.id === id)
    return e ? { ...e } : null
  }
  async pauseCampaign(id: string, reason: string) {
    this.pausedCampaigns.push({ id, reason })
  }
  async getSendByWamid(wamid: string) {
    return this.sends.find((s) => s.whatsapp_message_id === wamid) ?? null
  }
  async updateSend(id: string, patch: Partial<ReactivationSend>) {
    Object.assign(this.sends.find((s) => s.id === id)!, patch)
  }
}

const input = (text: string | null): InboundInput => ({
  accountId: 'acc',
  contactId: 'c1',
  conversationId: 'conv1',
  text,
  configOwnerUserId: 'owner',
  now: NOW,
})

function deps(dryRun = false) {
  return { sendText: vi.fn(async () => ({ whatsapp_message_id: 'w' })), dryRun }
}

describe('handleReactivationInbound', () => {
  it('opts out on "Sair" with an active enrollment', async () => {
    const s = new Mem()
    s.enrollments = [enrollment()]
    const d = deps()
    expect(await handleReactivationInbound(s, input('Sair'), d)).toBe('opted_out')
    expect(s.doNotContact).toBe(true)
    expect(s.enrollments[0]).toMatchObject({ status: 'opted_out', ended_at: NOW.toISOString() })
    expect(d.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv1',
        text: 'Pronto, você não vai mais receber nossas mensagens de campanha.',
      }),
    )
  })

  it('opts out with a recent send even without an open enrollment', async () => {
    const s = new Mem()
    s.recentSend = true
    expect(await handleReactivationInbound(s, input('PARAR'), deps())).toBe('opted_out')
    expect(s.doNotContact).toBe(true)
  })

  it('ignores optout without recent reactivation', async () => {
    const s = new Mem()
    const d = deps()
    expect(await handleReactivationInbound(s, input('SAIR'), d)).toBe('none')
    expect(s.doNotContact).toBe(false)
    expect(d.sendText).not.toHaveBeenCalled()
  })

  it('marks a reply on a sent step', async () => {
    const s = new Mem()
    s.enrollments = [enrollment({ current_step: 2 })]
    expect(await handleReactivationInbound(s, input('oi'), deps())).toBe('replied')
    expect(s.enrollments[0]).toMatchObject({
      status: 'replied',
      replied_step: 2,
      replied_at: NOW.toISOString(),
      next_run_at: null,
    })
  })

  it('cancels when the contact writes before the first touch', async () => {
    const s = new Mem()
    s.enrollments = [enrollment({ status: 'pending', current_step: 0 })]
    expect(await handleReactivationInbound(s, input('oi'), deps())).toBe('none')
    expect(s.enrollments[0]).toMatchObject({ status: 'cancelled', end_reason: 'returned_before_send' })
  })

  it('treats non-text messages as replies', async () => {
    const s = new Mem()
    s.enrollments = [enrollment()]
    expect(await handleReactivationInbound(s, input(null), deps())).toBe('replied')
  })

  it('always updates last_inbound_at', async () => {
    const s = new Mem()
    await handleReactivationInbound(s, input('qualquer coisa'), deps())
    expect(s.lastInbound).toBe(NOW.toISOString())
  })

  it('dry run records the confirmation instead of calling Meta', async () => {
    const s = new Mem()
    s.enrollments = [enrollment()]
    const d = deps(true)
    await handleReactivationInbound(s, input('stop'), d)
    expect(d.sendText).not.toHaveBeenCalled()
    expect(s.dryRunTexts).toEqual(['Pronto, você não vai mais receber nossas mensagens de campanha.'])
  })
})

describe('mirrorReactivationStatus', () => {
  function withSend(status: ReactivationSend['status']) {
    const s = new Mem()
    s.sends = [
      {
        id: 's1',
        account_id: 'acc',
        enrollment_id: 'e1',
        step: 1,
        attempts: 1,
        whatsapp_message_id: 'wamid.1',
        message_id: null,
        status,
        error: null,
        created_at: '',
        updated_at: '',
      },
    ]
    return s
  }
  it('moves forward and never regresses from read', async () => {
    const s = withSend('sent')
    await mirrorReactivationStatus(s, 'wamid.1', 'read')
    await mirrorReactivationStatus(s, 'wamid.1', 'delivered')
    expect(s.sends[0].status).toBe('read')
  })
  it('records failures from sent', async () => {
    const s = withSend('sent')
    await mirrorReactivationStatus(s, 'wamid.1', 'failed')
    expect(s.sends[0].status).toBe('failed')
  })
  it('ignores unknown wamids', async () => {
    const s = withSend('sent')
    await mirrorReactivationStatus(s, 'other', 'read')
    expect(s.sends[0].status).toBe('sent')
  })
})

describe('async failure from the status webhook', () => {
  // Status webhook "errors[0]" as Meta sends it.
  const UNDELIVERABLE = { code: 131026, message: 'Message undeliverable' }
  const ECOSYSTEM = { code: 131049, message: 'This message was not delivered to maintain healthy ecosystem engagement.' }
  const PAUSED = { code: 132015, message: 'Template is Paused' }

  function scenario(sendOver: Partial<ReactivationSend> = {}, enrOver: Partial<ReactivationEnrollment> = {}) {
    const s = new Mem()
    s.enrollments = [enrollment({ current_step: 1, next_run_at: '2026-11-19T13:00:00.000Z', ...enrOver })]
    s.sends = [
      {
        id: 's1',
        account_id: 'acc',
        enrollment_id: 'e1',
        step: 1,
        attempts: 1,
        whatsapp_message_id: 'wamid.1',
        message_id: null,
        status: 'sent',
        error: null,
        created_at: '',
        updated_at: '',
        ...sendOver,
      },
    ]
    return s
  }

  it('131026 ends the enrollment as failed and records code + message', async () => {
    const s = scenario()
    await mirrorReactivationStatus(s, 'wamid.1', 'failed', UNDELIVERABLE, NOW)
    expect(s.sends[0]).toMatchObject({ status: 'failed', error_code: 131026, error: 'Message undeliverable' })
    expect(s.enrollments[0]).toMatchObject({
      status: 'failed',
      end_reason: 'invalid_recipient',
      next_run_at: null,
      ended_at: NOW.toISOString(),
    })
  })

  it('131049 on the first attempt reschedules the same touch for the next day', async () => {
    const s = scenario()
    await mirrorReactivationStatus(s, 'wamid.1', 'failed', ECOSYSTEM, NOW)
    expect(s.enrollments[0]).toMatchObject({
      status: 'active',
      current_step: 0,
      next_run_at: '2026-11-18T13:00:00.000Z',
    })
  })

  it('131049 after the last attempt fails the enrollment', async () => {
    const s = scenario({ attempts: 2 })
    await mirrorReactivationStatus(s, 'wamid.1', 'failed', ECOSYSTEM, NOW)
    expect(s.enrollments[0]).toMatchObject({ status: 'failed', end_reason: 'retryable' })
  })

  it('template unavailable pauses the campaign and re-queues the touch', async () => {
    const s = scenario()
    await mirrorReactivationStatus(s, 'wamid.1', 'failed', PAUSED, NOW)
    expect(s.pausedCampaigns).toEqual([{ id: 'camp', reason: expect.stringMatching(/132015/) }])
    expect(s.enrollments[0]).toMatchObject({ status: 'active', current_step: 0, next_run_at: NOW.toISOString() })
  })

  it('an invalid number ends the sequence even if the next touch is already scheduled', async () => {
    const s = scenario({}, { current_step: 2 })
    await mirrorReactivationStatus(s, 'wamid.1', 'failed', UNDELIVERABLE, NOW)
    expect(s.sends[0].status).toBe('failed')
    expect(s.enrollments[0]).toMatchObject({ status: 'failed', end_reason: 'invalid_recipient' })
  })

  it('does not touch a closed enrollment', async () => {
    const s = scenario({}, { status: 'replied', next_run_at: null })
    await mirrorReactivationStatus(s, 'wamid.1', 'failed', UNDELIVERABLE, NOW)
    expect(s.enrollments[0].status).toBe('replied')
  })
})
