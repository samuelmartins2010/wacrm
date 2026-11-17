// ============================================================
// Reativação — mensagens recebidas e status (spec 5.5).
// Chamado best-effort pelo webhook do WhatsApp.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ReactivationEnrollment,
  ReactivationSend,
  ReactivationSendStatus,
  ReactivationSettings,
} from '@/types'
import type { engineSendText } from '@/lib/automations/meta-send'
import { getSettings } from './queries'
import { MAX_SEND_ATTEMPTS, addDays, classifySendError, isOptoutMessage, type SendErrorInfo } from './rules'

const OPTOUT_LOOKBACK_DAYS = 30

export interface InboundStore {
  touchLastInbound(contactId: string, nowIso: string): Promise<void>
  openEnrollments(contactId: string): Promise<ReactivationEnrollment[]>
  hasRecentSend(contactId: string, sinceIso: string): Promise<boolean>
  getSettings(accountId: string): Promise<ReactivationSettings>
  markDoNotContact(contactId: string, nowIso: string): Promise<void>
  /** With onlyOpen, applies only while status is pending/active. */
  updateEnrollment(id: string, patch: Partial<ReactivationEnrollment>, onlyOpen?: boolean): Promise<boolean | void>
  getEnrollment(id: string): Promise<ReactivationEnrollment | null>
  pauseCampaign(id: string, reason: string): Promise<void>
  insertDryRunText(conversationId: string, text: string): Promise<void>
  getSendByWamid(wamid: string): Promise<ReactivationSend | null>
  updateSend(id: string, patch: Partial<ReactivationSend>): Promise<void>
}

export interface InboundInput {
  accountId: string
  contactId: string
  conversationId: string
  /** Text of the inbound message; null for media / non-text. */
  text: string | null
  configOwnerUserId: string
  now: Date
}

export interface InboundDeps {
  sendText: typeof engineSendText
  dryRun: boolean
}

export async function handleReactivationInbound(
  store: InboundStore,
  input: InboundInput,
  deps: InboundDeps,
): Promise<'opted_out' | 'replied' | 'none'> {
  const nowIso = input.now.toISOString()
  await store.touchLastInbound(input.contactId, nowIso)

  const open = await store.openEnrollments(input.contactId)

  if (input.text) {
    const settings = await store.getSettings(input.accountId)
    if (isOptoutMessage(input.text, settings.optout_keywords)) {
      const eligible =
        open.length > 0 ||
        (await store.hasRecentSend(
          input.contactId,
          addDays(input.now, -OPTOUT_LOOKBACK_DAYS).toISOString(),
        ))
      if (eligible) {
        await store.markDoNotContact(input.contactId, nowIso)
        for (const e of open) {
          await store.updateEnrollment(e.id, {
            status: 'opted_out',
            ended_at: nowIso,
            next_run_at: null,
            end_reason: 'optout_keyword',
            updated_at: nowIso,
          })
        }
        if (deps.dryRun) {
          await store.insertDryRunText(input.conversationId, settings.optout_reply)
        } else {
          await deps.sendText({
            accountId: input.accountId,
            userId: input.configOwnerUserId,
            conversationId: input.conversationId,
            contactId: input.contactId,
            text: settings.optout_reply,
          })
        }
        return 'opted_out'
      }
    }
  }

  let replied = false
  for (const e of open) {
    if (e.current_step >= 1) {
      await store.updateEnrollment(e.id, {
        status: 'replied',
        replied_at: nowIso,
        replied_step: e.current_step,
        ended_at: nowIso,
        next_run_at: null,
        updated_at: nowIso,
      })
      replied = true
    } else {
      await store.updateEnrollment(e.id, {
        status: 'cancelled',
        end_reason: 'returned_before_send',
        ended_at: nowIso,
        next_run_at: null,
        updated_at: nowIso,
      })
    }
  }
  return replied ? 'replied' : 'none'
}

const RANK: Record<ReactivationSendStatus, number> = { failed: 0, sent: 1, delivered: 2, read: 3 }

export async function mirrorReactivationStatus(
  store: InboundStore,
  wamid: string,
  status: string,
  error: SendErrorInfo | null = null,
  now: Date = new Date(),
): Promise<void> {
  if (!(status in RANK) || status === 'sent') return
  const send = await store.getSendByWamid(wamid)
  if (!send) return
  const next = status as ReactivationSendStatus
  const nowIso = now.toISOString()

  if (next !== 'failed') {
    if (RANK[next] > RANK[send.status] && send.status !== 'failed') {
      await store.updateSend(send.id, { status: next, updated_at: nowIso })
    }
    return
  }

  // Meta accepted the touch and reported the failure later (e.g. 131026
  // number without WhatsApp, 131049 marketing limit). Same rules as a
  // synchronous failure in the runner.
  if (send.status === 'failed') return
  await store.updateSend(send.id, {
    status: 'failed',
    error: (error?.message ?? 'failed (status webhook)').slice(0, 500),
    error_code: typeof error?.code === 'number' ? error.code : null,
    updated_at: nowIso,
  })

  const enrollment = await store.getEnrollment(send.enrollment_id)
  if (!enrollment || (enrollment.status !== 'pending' && enrollment.status !== 'active')) return

  const kind = classifySendError(error ?? { message: '' })
  if (kind === 'invalid_recipient') {
    await store.updateEnrollment(
      enrollment.id,
      { status: 'failed', end_reason: kind, ended_at: nowIso, next_run_at: null, updated_at: nowIso },
      true,
    )
    return
  }

  // Retry / re-queue only if this failed touch is still the latest one.
  const isLatest = enrollment.current_step === send.step
  if (kind === 'template_unavailable') {
    await store.pauseCampaign(
      enrollment.campaign_id,
      `Toque ${send.step}: (#${error?.code ?? '?'}) ${error?.message ?? ''}`.slice(0, 500),
    )
    if (isLatest) {
      await store.updateEnrollment(
        enrollment.id,
        { current_step: send.step - 1, next_run_at: nowIso, updated_at: nowIso },
        true,
      )
    }
    return
  }

  if (send.attempts >= MAX_SEND_ATTEMPTS) {
    await store.updateEnrollment(
      enrollment.id,
      { status: 'failed', end_reason: kind, ended_at: nowIso, next_run_at: null, updated_at: nowIso },
      true,
    )
  } else if (isLatest) {
    await store.updateEnrollment(
      enrollment.id,
      { current_step: send.step - 1, next_run_at: addDays(now, 1).toISOString(), updated_at: nowIso },
      true,
    )
  }
}

// ------------------------------------------------------------
// Supabase implementation (service role)
// ------------------------------------------------------------

export function supabaseInboundStore(db: SupabaseClient): InboundStore {
  return {
    async touchLastInbound(contactId, nowIso) {
      await db.from('contacts').update({ last_inbound_at: nowIso }).eq('id', contactId)
    },
    async openEnrollments(contactId) {
      const { data } = await db
        .from('reactivation_enrollments')
        .select('*')
        .eq('contact_id', contactId)
        .in('status', ['pending', 'active'])
      return (data ?? []) as ReactivationEnrollment[]
    },
    async hasRecentSend(contactId, sinceIso) {
      const { count } = await db
        .from('reactivation_sends')
        .select('id, reactivation_enrollments!inner(contact_id)', { count: 'exact', head: true })
        .eq('reactivation_enrollments.contact_id', contactId)
        .neq('status', 'failed')
        .gte('created_at', sinceIso)
      return (count ?? 0) > 0
    },
    getSettings: (accountId) => getSettings(db, accountId),
    async markDoNotContact(contactId, nowIso) {
      await db
        .from('contacts')
        .update({ do_not_contact: true, do_not_contact_at: nowIso, do_not_contact_source: 'reativacao_sair' })
        .eq('id', contactId)
    },
    async updateEnrollment(id, patch, onlyOpen = false) {
      let q = db.from('reactivation_enrollments').update(patch).eq('id', id)
      if (onlyOpen) q = q.in('status', ['pending', 'active'])
      await q
    },
    async getEnrollment(id) {
      const { data } = await db.from('reactivation_enrollments').select('*').eq('id', id).maybeSingle()
      return (data as ReactivationEnrollment | null) ?? null
    },
    async pauseCampaign(id, reason) {
      await db
        .from('reactivation_campaigns')
        .update({ status: 'paused', pause_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'active')
    },
    async insertDryRunText(conversationId, text) {
      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'bot',
        content_type: 'text',
        content_text: `[simulado] ${text}`,
        message_id: `dryrun-${crypto.randomUUID()}`,
        status: 'sent',
      })
    },
    async getSendByWamid(wamid) {
      const { data } = await db
        .from('reactivation_sends')
        .select('*')
        .eq('whatsapp_message_id', wamid)
        .limit(1)
        .maybeSingle()
      return (data as ReactivationSend | null) ?? null
    },
    async updateSend(id, patch) {
      await db.from('reactivation_sends').update(patch).eq('id', id)
    },
  }
}
