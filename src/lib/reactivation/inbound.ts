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
import { addDays, isOptoutMessage } from './rules'

const OPTOUT_LOOKBACK_DAYS = 30

export interface InboundStore {
  touchLastInbound(contactId: string, nowIso: string): Promise<void>
  openEnrollments(contactId: string): Promise<ReactivationEnrollment[]>
  hasRecentSend(contactId: string, sinceIso: string): Promise<boolean>
  getSettings(accountId: string): Promise<ReactivationSettings>
  markDoNotContact(contactId: string, nowIso: string): Promise<void>
  updateEnrollment(id: string, patch: Partial<ReactivationEnrollment>): Promise<void>
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
): Promise<void> {
  if (!(status in RANK) || status === 'sent') return
  const send = await store.getSendByWamid(wamid)
  if (!send) return
  const next = status as ReactivationSendStatus
  const ok =
    next === 'failed' ? send.status === 'sent' : RANK[next] > RANK[send.status] && send.status !== 'failed'
  if (!ok) return
  await store.updateSend(send.id, { status: next, updated_at: new Date().toISOString() })
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
    async updateEnrollment(id, patch) {
      await db.from('reactivation_enrollments').update(patch).eq('id', id)
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
