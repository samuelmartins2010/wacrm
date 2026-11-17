// ============================================================
// Reativação — runner do cron (spec 5.4).
// Toda leitura/escrita passa por RunnerStore, para o runner ser
// testável em memória; supabaseRunnerStore() é a implementação real.
// ============================================================

import { randomUUID } from 'node:crypto'
import type {
  MessageTemplate,
  ReactivationCampaign,
  ReactivationEnrollment,
  ReactivationSend,
  ReactivationSettings,
} from '@/types'
import type { engineSendTemplate } from '@/lib/automations/meta-send'
import {
  addDays,
  classifySendError,
  MAX_SEND_ATTEMPTS,
  isWithinWindow,
  nextDayWindowOpen,
  nextWindowOpen,
  resolveParams,
  startOfLocalDay,
} from './rules'

export interface RunnerContact {
  id: string
  name: string | null
  phone: string | null
  company: string | null
  do_not_contact: boolean
  last_inbound_at: string | null
}

export interface DueItem {
  enrollment: ReactivationEnrollment
  campaign: ReactivationCampaign
  contact: RunnerContact
}

export interface RunnerStore {
  loadDue(now: Date, limit: number): Promise<DueItem[]>
  getSettings(accountId: string): Promise<ReactivationSettings>
  countSendsSince(accountId: string, sinceIso: string): Promise<number>
  /** Atomically move next_run_at from `expected` to `nextRunAt`; false if someone else did. */
  claim(enrollmentId: string, expected: string, nextRunAt: string): Promise<boolean>
  /** With onlyOpen, applies only while status is pending/active; returns whether it applied. */
  updateEnrollment(id: string, patch: Partial<ReactivationEnrollment>, onlyOpen?: boolean): Promise<boolean>
  /** Fresh enrollment + contact state (after the claim). */
  refresh(enrollmentId: string): Promise<{ enrollment: ReactivationEnrollment; contact: RunnerContact } | null>
  getSend(enrollmentId: string, step: number): Promise<ReactivationSend | null>
  /** Upsert the (enrollment, step) row and increment attempts. */
  recordAttempt(accountId: string, enrollmentId: string, step: number, nowIso: string): Promise<ReactivationSend>
  updateSend(id: string, patch: Partial<ReactivationSend>): Promise<void>
  latestConversationId(contactId: string): Promise<string | null>
  getTemplate(id: string): Promise<MessageTemplate | null>
  /** Dry run: persist a bot message without calling Meta. Returns messages.id. */
  insertDryRunMessage(conversationId: string, templateName: string, wamid: string): Promise<string | null>
  findMessageId(conversationId: string, wamid: string): Promise<string | null>
  pauseCampaign(id: string, reason: string): Promise<void>
  finishIdleCampaigns(nowIso: string): Promise<number>
}

export interface RunnerDeps {
  store: RunnerStore
  send: typeof engineSendTemplate
  dryRun: boolean
  batchSize?: number
}

export interface RunResult {
  sent: number
  skipped: number
  failed: number
  deferred: number
}

const CLAIM_LEASE_MS = 10 * 60_000
/** engineSendTemplate throws this after Meta already accepted the message. */
const SENT_BUT_NOT_SAVED = /sent to Meta but DB insert failed/i

export async function runReactivation(deps: RunnerDeps, now: Date): Promise<RunResult> {
  const { store } = deps
  const nowIso = now.toISOString()
  const result: RunResult = { sent: 0, skipped: 0, failed: 0, deferred: 0 }
  const due = await store.loadDue(now, deps.batchSize ?? 50)

  const settingsCache = new Map<string, ReactivationSettings>()
  const sentToday = new Map<string, number>()
  const pausedCampaigns = new Set<string>()

  for (const { enrollment: e, campaign, contact: staleContact } of due) {
    if (pausedCampaigns.has(campaign.id)) continue
    const accountId = e.account_id
    let settings = settingsCache.get(accountId)
    if (!settings) {
      settings = await store.getSettings(accountId)
      settingsCache.set(accountId, settings)
    }
    const window = campaign.send_window ?? settings.send_window

    // 1. Send window.
    if (!isWithinWindow(now, window)) {
      await store.updateEnrollment(e.id, { next_run_at: nextWindowOpen(now, window).toISOString() })
      result.deferred++
      continue
    }

    // 2. Daily limit (per account, every attempt counts).
    if (!sentToday.has(accountId)) {
      sentToday.set(accountId, await store.countSendsSince(accountId, startOfLocalDay(now).toISOString()))
    }
    if (sentToday.get(accountId)! >= settings.daily_limit) {
      await store.updateEnrollment(e.id, { next_run_at: nextDayWindowOpen(now, window).toISOString() })
      result.deferred++
      continue
    }

    // 3. Claim.
    const claimed = await store.claim(
      e.id,
      e.next_run_at!,
      new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
    )
    if (!claimed) {
      result.skipped++
      continue
    }

    // Re-read after the claim: the loadDue snapshot can be minutes old.
    const fresh = await store.refresh(e.id)
    if (!fresh || (fresh.enrollment.status !== 'pending' && fresh.enrollment.status !== 'active')) {
      result.skipped++
      continue
    }
    const contact = fresh.contact ?? staleContact

    // Every terminal/advancing write only applies while the enrollment is
    // still open, so a reply/opt-out recorded by the webhook is never
    // overwritten by the runner.
    const end = (status: ReactivationEnrollment['status'], extra: Partial<ReactivationEnrollment> = {}) =>
      store.updateEnrollment(
        e.id,
        { status, ended_at: nowIso, next_run_at: null, updated_at: nowIso, ...extra },
        true,
      )

    // 4. Re-check eligibility right before sending.
    if (contact.do_not_contact) {
      await end('opted_out', { end_reason: 'do_not_contact' })
      result.skipped++
      continue
    }
    if (
      contact.last_inbound_at &&
      new Date(contact.last_inbound_at).getTime() > new Date(e.created_at).getTime()
    ) {
      if (e.current_step >= 1) {
        await end('replied', { replied_at: contact.last_inbound_at, replied_step: e.current_step })
      } else {
        await end('cancelled', { end_reason: 'returned_before_send' })
      }
      result.skipped++
      continue
    }

    const stepNo = e.current_step + 1
    const step = campaign.steps[e.current_step]
    const advance = async () => {
      const next = campaign.steps[stepNo]
      if (next) {
        await store.updateEnrollment(
          e.id,
          {
            current_step: stepNo,
            next_run_at: addDays(now, next.wait_days).toISOString(),
            updated_at: nowIso,
          },
          true,
        )
      } else {
        await end('completed', { current_step: stepNo })
      }
    }

    if (!step) {
      await end('completed')
      continue
    }

    // 5. Idempotency: this step already went out.
    const existing = await store.getSend(e.id, stepNo)
    if (existing && existing.status !== 'failed') {
      await advance()
      result.skipped++
      continue
    }

    // 6. Resolve conversation + template.
    const conversationId = await store.latestConversationId(contact.id)
    if (!conversationId) {
      await end('failed', { end_reason: 'no_conversation' })
      result.failed++
      continue
    }
    const template = await store.getTemplate(step.template_id)
    if (!template) {
      await store.pauseCampaign(campaign.id, `Template do toque ${stepNo} não encontrado.`)
      pausedCampaigns.add(campaign.id)
      await store.updateEnrollment(e.id, { next_run_at: nowIso })
      continue
    }

    const attempt = await store.recordAttempt(accountId, e.id, stepNo, nowIso)
    sentToday.set(accountId, sentToday.get(accountId)! + 1)

    // Only the Meta call decides success/failure. Bookkeeping after a
    // successful send must never turn into a retry (= duplicate touch).
    let wamid: string | null = null
    let messageId: string | null = null
    try {
      if (deps.dryRun) {
        wamid = `dryrun-${randomUUID()}`
        messageId = await store.insertDryRunMessage(conversationId, template.name, wamid)
      } else {
        const r = await deps.send({
          accountId,
          userId: campaign.approved_by ?? campaign.created_by ?? '',
          conversationId,
          contactId: contact.id,
          templateName: template.name,
          language: template.language ?? 'pt_BR',
          params: resolveParams(step.params, contact),
        })
        wamid = r.whatsapp_message_id
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!SENT_BUT_NOT_SAVED.test(msg)) {
        const code = (err as { code?: unknown }).code
        const errorCode = typeof code === 'number' ? code : null
        await store.updateSend(attempt.id, {
          status: 'failed',
          error: msg.slice(0, 500),
          error_code: errorCode,
          updated_at: nowIso,
        })
        const kind = classifySendError({ code: errorCode, message: msg })
        if (kind === 'template_unavailable') {
          await store.pauseCampaign(campaign.id, `Toque ${stepNo}: ${msg}`.slice(0, 500))
          pausedCampaigns.add(campaign.id)
          await store.updateEnrollment(e.id, { next_run_at: nowIso }, true)
        } else if (kind === 'retryable' && attempt.attempts < MAX_SEND_ATTEMPTS) {
          await store.updateEnrollment(e.id, { next_run_at: addDays(now, 1).toISOString() }, true)
        } else {
          await end('failed', { end_reason: kind })
        }
        result.failed++
        continue
      }
      // Meta has it; only our inbox copy is missing. Count as sent.
    }

    if (wamid && !messageId && !deps.dryRun) {
      try {
        messageId = await store.findMessageId(conversationId, wamid)
      } catch {
        messageId = null
      }
    }
    await store.updateSend(attempt.id, {
      status: 'sent',
      whatsapp_message_id: wamid,
      message_id: messageId,
      error: null,
      updated_at: nowIso,
    })
    await advance()
    result.sent++
  }

  await store.finishIdleCampaigns(nowIso)
  return result
}
