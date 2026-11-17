import { describe, it, expect, vi } from 'vitest'
import type {
  MessageTemplate,
  ReactivationCampaign,
  ReactivationEnrollment,
  ReactivationSend,
  ReactivationSettings,
} from '@/types'
import { DEFAULT_SETTINGS } from './queries'
import { addDays } from './rules'
import { runReactivation, type DueItem, type RunnerContact, type RunnerStore } from './runner'

// Tuesday 2026-11-17 10:00 São Paulo.
const NOW = new Date('2026-11-17T13:00:00Z')

const TEMPLATE: MessageTemplate = {
  id: 'tpl',
  user_id: 'u',
  name: 'volta',
  category: 'Marketing',
  language: 'pt_BR',
  body_text: 'Oi {{1}}!',
  status: 'APPROVED',
  created_at: '',
}

function campaign(over: Partial<ReactivationCampaign> = {}): ReactivationCampaign {
  return {
    id: 'camp',
    account_id: 'acc',
    name: 'Volta',
    status: 'active',
    pause_reason: null,
    bands: ['late', 'cooling', 'gone'],
    tag_ids: [],
    exclude_tag_ids: [],
    steps: [
      { template_id: 'tpl', params: [{ source: 'first_name' }], wait_days: 3 },
      { template_id: 'tpl', params: [{ source: 'first_name' }], wait_days: 3 },
    ],
    send_window: null,
    created_by: 'u',
    approved_by: 'u',
    approved_at: addDays(NOW, -1).toISOString(),
    finished_at: null,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

/** In-memory RunnerStore. Single-threaded JS makes claim() atomic. */
class MemStore implements RunnerStore {
  settings: ReactivationSettings = { account_id: 'acc', ...DEFAULT_SETTINGS }
  campaigns = new Map<string, ReactivationCampaign>()
  enrollments = new Map<string, ReactivationEnrollment>()
  contacts = new Map<string, RunnerContact>()
  sends: ReactivationSend[] = []
  dryRunMessages: { conversationId: string; wamid: string }[] = []
  private seq = 0

  addEnrollment(id: string, over: Partial<ReactivationEnrollment> = {}, contact: Partial<RunnerContact> = {}) {
    const contactId = `c-${id}`
    this.contacts.set(contactId, {
      id: contactId,
      name: 'Maria Souza',
      phone: '+5511999990000',
      company: null,
      do_not_contact: false,
      last_inbound_at: addDays(NOW, -40).toISOString(),
      ...contact,
    })
    this.enrollments.set(id, {
      id,
      account_id: 'acc',
      campaign_id: 'camp',
      contact_id: contactId,
      status: 'pending',
      current_step: 0,
      next_run_at: NOW.toISOString(),
      replied_at: null,
      replied_step: null,
      ended_at: null,
      end_reason: null,
      created_at: addDays(NOW, -1).toISOString(),
      updated_at: '',
      ...over,
    })
  }

  async loadDue(now: Date, limit: number): Promise<DueItem[]> {
    return [...this.enrollments.values()]
      .filter(
        (e) =>
          (e.status === 'pending' || e.status === 'active') &&
          e.next_run_at !== null &&
          e.next_run_at <= now.toISOString() &&
          this.campaigns.get(e.campaign_id)?.status === 'active',
      )
      .sort((a, b) => a.next_run_at!.localeCompare(b.next_run_at!))
      .slice(0, limit)
      .map((e) => ({
        enrollment: { ...e },
        campaign: this.campaigns.get(e.campaign_id)!,
        contact: this.contacts.get(e.contact_id)!,
      }))
  }
  async getSettings() {
    return this.settings
  }
  async countSendsSince(_accountId: string, sinceIso: string) {
    return this.sends.filter((s) => s.updated_at >= sinceIso).length
  }
  async claim(id: string, expected: string, nextRunAt: string) {
    const e = this.enrollments.get(id)!
    if (e.next_run_at !== expected) return false
    e.next_run_at = nextRunAt
    e.status = 'active'
    return true
  }
  async updateEnrollment(id: string, patch: Partial<ReactivationEnrollment>) {
    Object.assign(this.enrollments.get(id)!, patch)
  }
  async getSend(enrollmentId: string, step: number) {
    return this.sends.find((s) => s.enrollment_id === enrollmentId && s.step === step) ?? null
  }
  async recordAttempt(accountId: string, enrollmentId: string, step: number, nowIso: string) {
    let s = await this.getSend(enrollmentId, step)
    if (!s) {
      s = {
        id: `s${++this.seq}`,
        account_id: accountId,
        enrollment_id: enrollmentId,
        step,
        attempts: 0,
        whatsapp_message_id: null,
        message_id: null,
        status: 'failed',
        error: null,
        created_at: nowIso,
        updated_at: nowIso,
      }
      this.sends.push(s)
    }
    s.attempts += 1
    s.updated_at = nowIso
    return { ...s }
  }
  async updateSend(id: string, patch: Partial<ReactivationSend>) {
    Object.assign(this.sends.find((s) => s.id === id)!, patch)
  }
  async latestConversationId(contactId: string) {
    return `conv-${contactId}`
  }
  async getTemplate(id: string) {
    return id === TEMPLATE.id ? TEMPLATE : null
  }
  async insertDryRunMessage(conversationId: string, _templateName: string, wamid: string) {
    this.dryRunMessages.push({ conversationId, wamid })
    return `msg-${wamid}`
  }
  async findMessageId() {
    return 'msg-real'
  }
  async pauseCampaign(id: string, reason: string) {
    const c = this.campaigns.get(id)!
    c.status = 'paused'
    c.pause_reason = reason
  }
  async finishIdleCampaigns(nowIso: string) {
    let n = 0
    for (const c of this.campaigns.values()) {
      if (c.status !== 'active') continue
      const open = [...this.enrollments.values()].some(
        (e) => e.campaign_id === c.id && (e.status === 'pending' || e.status === 'active'),
      )
      if (!open) {
        c.status = 'finished'
        c.finished_at = nowIso
        n++
      }
    }
    return n
  }
}

function setup(over: Partial<ReactivationCampaign> = {}) {
  const store = new MemStore()
  store.campaigns.set('camp', campaign(over))
  const send = vi.fn(async () => ({ whatsapp_message_id: 'wamid.1' }))
  return { store, send, deps: { store, send, dryRun: false } }
}

describe('runReactivation', () => {
  it('sends step 1 with resolved params and schedules step 2', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1')
    const r = await runReactivation(deps, NOW)
    expect(r.sent).toBe(1)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc',
        contactId: 'c-e1',
        conversationId: 'conv-c-e1',
        templateName: 'volta',
        language: 'pt_BR',
        params: ['Maria'],
      }),
    )
    const e = store.enrollments.get('e1')!
    expect(e.current_step).toBe(1)
    expect(e.status).toBe('active')
    expect(e.next_run_at).toBe(addDays(NOW, 3).toISOString())
    expect(store.sends[0]).toMatchObject({ step: 1, status: 'sent', whatsapp_message_id: 'wamid.1' })
  })

  it('completes the enrollment after the last step and finishes the campaign', async () => {
    const { store, deps } = setup()
    store.addEnrollment('e1', { status: 'active', current_step: 1 })
    await runReactivation(deps, NOW)
    const e = store.enrollments.get('e1')!
    expect(e.status).toBe('completed')
    expect(e.ended_at).toBe(NOW.toISOString())
    expect(store.campaigns.get('camp')!.status).toBe('finished')
  })

  it('claims are exclusive', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1')
    await Promise.all([runReactivation(deps, NOW), runReactivation(deps, NOW)])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('unique send per step', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1')
    store.sends.push({
      id: 'old',
      account_id: 'acc',
      enrollment_id: 'e1',
      step: 1,
      attempts: 1,
      whatsapp_message_id: 'wamid.0',
      message_id: null,
      status: 'sent',
      error: null,
      created_at: addDays(NOW, -1).toISOString(),
      updated_at: addDays(NOW, -1).toISOString(),
    })
    await runReactivation(deps, NOW)
    expect(send).not.toHaveBeenCalled()
    expect(store.enrollments.get('e1')!.current_step).toBe(1)
  })

  it('skips when replied after enrollment', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1', { status: 'active', current_step: 1 }, {
      last_inbound_at: addDays(NOW, -0.5).toISOString(),
    })
    await runReactivation(deps, NOW)
    expect(send).not.toHaveBeenCalled()
    expect(store.enrollments.get('e1')).toMatchObject({ status: 'replied', replied_step: 1 })
  })

  it('cancels when the contact came back before the first touch', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1', {}, { last_inbound_at: addDays(NOW, -0.5).toISOString() })
    await runReactivation(deps, NOW)
    expect(send).not.toHaveBeenCalled()
    expect(store.enrollments.get('e1')).toMatchObject({
      status: 'cancelled',
      end_reason: 'returned_before_send',
    })
  })

  it('marks opted-out contacts', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1', {}, { do_not_contact: true })
    await runReactivation(deps, NOW)
    expect(send).not.toHaveBeenCalled()
    expect(store.enrollments.get('e1')!.status).toBe('opted_out')
  })

  it('respects the daily limit', async () => {
    const { store, send, deps } = setup()
    store.settings = { ...store.settings, daily_limit: 2 }
    store.addEnrollment('e1')
    store.addEnrollment('e2')
    store.addEnrollment('e3')
    const r = await runReactivation(deps, NOW)
    expect(send).toHaveBeenCalledTimes(2)
    expect(r.deferred).toBe(1)
    // Next day (Wednesday) 09:00 SP.
    expect(store.enrollments.get('e3')!.next_run_at).toBe('2026-11-18T12:00:00.000Z')
  })

  it('does not send on sunday', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1', { next_run_at: '2026-11-22T13:00:00.000Z' })
    await runReactivation(deps, new Date('2026-11-22T14:00:00Z'))
    expect(send).not.toHaveBeenCalled()
    expect(store.enrollments.get('e1')!.next_run_at).toBe('2026-11-23T12:00:00.000Z')
  })

  it('retries a retryable error once, next day, then fails', async () => {
    const { store, send, deps } = setup()
    send.mockRejectedValue(new Error('(#131049) This message was not delivered'))
    store.addEnrollment('e1')
    await runReactivation(deps, NOW)
    let e = store.enrollments.get('e1')!
    expect(e.status).toBe('active')
    expect(e.next_run_at).toBe(addDays(NOW, 1).toISOString())
    expect(store.sends[0]).toMatchObject({ attempts: 1, status: 'failed' })

    const later = addDays(NOW, 1)
    await runReactivation(deps, later)
    e = store.enrollments.get('e1')!
    expect(e.status).toBe('failed')
    expect(store.sends[0].attempts).toBe(2)
  })

  it('fails invalid recipients immediately', async () => {
    const { store, send, deps } = setup()
    send.mockRejectedValue(new Error('(#131030) Recipient phone number not in allowed list'))
    store.addEnrollment('e1')
    await runReactivation(deps, NOW)
    expect(store.enrollments.get('e1')!.status).toBe('failed')
  })

  it('pauses the campaign when the template is unavailable', async () => {
    const { store, send, deps } = setup()
    send.mockRejectedValue(new Error('(#132001) Template name does not exist in the translation'))
    store.addEnrollment('e1')
    await runReactivation(deps, NOW)
    const c = store.campaigns.get('camp')!
    expect(c.status).toBe('paused')
    expect(c.pause_reason).toMatch(/132001/)
    const e = store.enrollments.get('e1')!
    expect(e.status).toBe('active')
    expect(e.current_step).toBe(0)
  })

  it('dry run does not call Meta and records a dryrun message', async () => {
    const { store, send } = setup()
    store.addEnrollment('e1')
    await runReactivation({ store, send, dryRun: true }, NOW)
    expect(send).not.toHaveBeenCalled()
    expect(store.dryRunMessages).toHaveLength(1)
    expect(store.dryRunMessages[0].wamid.startsWith('dryrun-')).toBe(true)
    expect(store.sends[0]).toMatchObject({ status: 'sent', message_id: expect.stringMatching(/^msg-dryrun-/) })
  })

  it('falls back to "cliente" when the contact has no name', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1', {}, { name: null })
    await runReactivation(deps, NOW)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ params: ['cliente'] }))
  })
})
