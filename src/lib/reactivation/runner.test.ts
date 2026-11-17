import { afterEach, describe, it, expect, vi } from 'vitest'
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
import { MetaApiError } from '@/lib/whatsapp/meta-api'

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
        contact: { ...this.contacts.get(e.contact_id)! },
      }))
  }
  async getSettings() {
    return this.settings
  }
  async countSendsSince(_accountId: string, sinceIso: string) {
    return this.sends.filter((s) => s.updated_at >= sinceIso).length
  }
  claimedUntil = new Map<string, string>()
  async claim(id: string, expected: string, nextRunAt: string) {
    this.claimedUntil.set(id, nextRunAt)
    const e = this.enrollments.get(id)!
    if (e.next_run_at !== expected) return false
    e.next_run_at = nextRunAt
    e.status = 'active'
    return true
  }
  async updateEnrollment(id: string, patch: Partial<ReactivationEnrollment>, onlyOpen = false) {
    const e = this.enrollments.get(id)!
    if (onlyOpen && e.status !== 'pending' && e.status !== 'active') return false
    Object.assign(e, patch)
    return true
  }
  async refresh(id: string) {
    const e = this.enrollments.get(id)
    if (!e) return null
    return {
      enrollment: { ...e },
      contact: { ...this.contacts.get(e.contact_id)! },
      campaignStatus: this.campaigns.get(e.campaign_id)!.status,
    }
  }
  async getSend(enrollmentId: string, step: number) {
    return this.sends.find((s) => s.enrollment_id === enrollmentId && s.step === step) ?? null
  }
  failAttemptFor = new Set<string>()
  async recordAttempt(accountId: string, enrollmentId: string, step: number, nowIso: string) {
    if (this.failAttemptFor.has(enrollmentId)) return null
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
  lockHolder: string | null = null
  async acquireRunLock(holder: string) {
    if (this.lockHolder && this.lockHolder !== holder) return false
    this.lockHolder = holder
    return true
  }
  async releaseRunLock(holder: string) {
    if (this.lockHolder === holder) this.lockHolder = null
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

  it('treats "sent to Meta but DB insert failed" as sent', async () => {
    const { store, send, deps } = setup()
    send.mockRejectedValue(new Error('sent to Meta but DB insert failed: boom'))
    store.addEnrollment('e1')
    await runReactivation(deps, NOW)
    expect(store.enrollments.get('e1')).toMatchObject({ status: 'active', current_step: 1 })
    expect(store.sends[0].status).toBe('sent')
  })

  it('bookkeeping failure after a successful send is not retried', async () => {
    const { store, deps } = setup()
    store.findMessageId = async () => {
      throw new Error('db down')
    }
    store.addEnrollment('e1')
    await runReactivation(deps, NOW)
    expect(store.enrollments.get('e1')!.current_step).toBe(1)
    expect(store.sends[0]).toMatchObject({ status: 'sent', whatsapp_message_id: 'wamid.1' })
  })

  it('rechecks the contact after the claim', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1', { status: 'active', current_step: 1 })
    const stale = await store.loadDue(NOW, 50)
    // Reply lands after loadDue's snapshot.
    store.contacts.get('c-e1')!.last_inbound_at = addDays(NOW, -0.1).toISOString()
    store.loadDue = async () => stale
    await runReactivation(deps, NOW)
    expect(send).not.toHaveBeenCalled()
    expect(store.enrollments.get('e1')).toMatchObject({ status: 'replied', replied_step: 1 })
  })

  it('does not overwrite a reply that arrives during the send', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1', { status: 'active', current_step: 1 })
    send.mockImplementation(async () => {
      store.enrollments.get('e1')!.status = 'replied'
      return { whatsapp_message_id: 'wamid.2' }
    })
    await runReactivation(deps, NOW)
    expect(store.enrollments.get('e1')!.status).toBe('replied')
  })

  it('classifies by Meta code and records it on the send', async () => {
    const { store, send, deps } = setup()
    send.mockRejectedValue(new MetaApiError('Template is disabled', 400, 132016))
    store.addEnrollment('e1')
    await runReactivation(deps, NOW)
    expect(store.campaigns.get('camp')!.status).toBe('paused')
    expect(store.sends[0]).toMatchObject({ status: 'failed', error_code: 132016, error: 'Template is disabled' })
  })

  it('only one run at a time: concurrent runs respect the daily limit', async () => {
    const { store, send, deps } = setup()
    store.settings = { ...store.settings, daily_limit: 2 }
    for (const id of ['e1', 'e2', 'e3', 'e4', 'e5']) store.addEnrollment(id)
    // Slow Meta so the runs really overlap.
    send.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5))
      return { whatsapp_message_id: 'w' }
    })
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => runReactivation(deps, NOW)))
    expect(send).toHaveBeenCalledTimes(2)
    expect(results.filter((r) => r.locked).length).toBe(4)
    expect(store.lockHolder).toBeNull()
  })

  it('releases the lock even when the run throws', async () => {
    const { store, deps } = setup()
    store.addEnrollment('e1')
    store.getSettings = async () => {
      throw new Error('db down')
    }
    await expect(runReactivation(deps, NOW)).rejects.toThrow('db down')
    expect(store.lockHolder).toBeNull()
  })

  it('passes a Meta timeout shorter than the enrollment claim', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1')
    await runReactivation(deps, NOW)
    const args = (send.mock.calls[0] as unknown as [{ timeoutMs?: number }])[0]
    expect(args.timeoutMs).toBe(15_000)
  })

  it('9a: pausing the campaign after loadDue stops the send right away', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1')
    const stale = await store.loadDue(NOW, 50)
    store.campaigns.get('camp')!.status = 'paused'
    store.loadDue = async () => stale
    await runReactivation(deps, NOW)
    expect(send).not.toHaveBeenCalled()
    expect(store.sends).toHaveLength(0)
  })

  it('9b: a lost race on the attempt row skips that item instead of aborting the run', async () => {
    const { store, send, deps } = setup()
    store.addEnrollment('e1')
    store.addEnrollment('e2')
    store.failAttemptFor.add('e1')
    const r = await runReactivation(deps, NOW)
    expect(send).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
    expect(r.skipped).toBe(1)
    expect(store.campaigns.get('camp')!.status).toBe('active')
  })

  describe('claim lease counts from the claim, not from the start of the run', () => {
    afterEach(() => vi.useRealTimers())

    it('an enrollment claimed 7:59 into the run is locked until ~17:59', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const runStart = new Date('2026-11-17T13:00:00.000Z')
      vi.setSystemTime(runStart)
      const { store, send, deps } = setup()
      store.addEnrollment('e1')
      store.addEnrollment('e2', { next_run_at: new Date(NOW.getTime() + 1).toISOString() })
      // The first send takes 7:59 of wall-clock time.
      send.mockImplementationOnce(async () => {
        vi.setSystemTime(new Date(runStart.getTime() + (7 * 60 + 59) * 1000))
        return { whatsapp_message_id: 'w1' }
      })
      await runReactivation(deps, new Date(NOW.getTime() + 1))
      expect(store.claimedUntil.get('e1')).toBe('2026-11-17T13:10:00.001Z')
      expect(store.claimedUntil.get('e2')).toBe('2026-11-17T13:17:59.001Z')
    })
  })
})
