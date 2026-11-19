// RunnerStore backed by Supabase (service-role client — the cron has no session).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MessageTemplate, ReactivationCampaign, ReactivationEnrollment, ReactivationSend } from '@/types'
import { getSettings } from './queries'
import type { DueItem, RunnerContact, RunnerStore } from './runner'

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`[reactivation] ${what}: ${error.message}`)
}

export function supabaseRunnerStore(db: SupabaseClient): RunnerStore {
  return {
    async loadDue(now, limit) {
      const { data, error } = await db
        .from('reactivation_enrollments')
        .select(
          '*, campaign:reactivation_campaigns!inner(*), contact:contacts!inner(id, name, phone, company, do_not_contact, last_inbound_at)',
        )
        .in('status', ['pending', 'active'])
        .lte('next_run_at', now.toISOString())
        .eq('campaign.status', 'active')
        .order('next_run_at', { ascending: true })
        .limit(limit)
      check(error, 'loadDue')
      return (data ?? []).map((row) => {
        const { campaign, contact, ...enrollment } = row as ReactivationEnrollment & {
          campaign: ReactivationCampaign
          contact: RunnerContact
        }
        return { enrollment, campaign, contact } satisfies DueItem
      })
    },

    getSettings: (accountId) => getSettings(db, accountId),

    async countSendsSince(accountId, sinceIso) {
      const { count, error } = await db
        .from('reactivation_sends')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('attempted_at', sinceIso)
      check(error, 'countSendsSince')
      return count ?? 0
    },

    async claim(id, expected, nextRunAt) {
      const { data, error } = await db
        .from('reactivation_enrollments')
        .update({ status: 'active', next_run_at: nextRunAt, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('next_run_at', expected)
        .in('status', ['pending', 'active'])
        .select('id')
        .maybeSingle()
      check(error, 'claim')
      return !!data
    },

    async updateEnrollment(id, patch, onlyOpen = false) {
      let q = db.from('reactivation_enrollments').update(patch).eq('id', id)
      if (onlyOpen) q = q.in('status', ['pending', 'active'])
      const { data, error } = await q.select('id')
      check(error, 'updateEnrollment')
      return (data ?? []).length > 0
    },

    async refresh(enrollmentId) {
      const { data, error } = await db
        .from('reactivation_enrollments')
        .select(
          '*, contact:contacts!inner(id, name, phone, company, do_not_contact, last_inbound_at), campaign:reactivation_campaigns!inner(status)',
        )
        .eq('id', enrollmentId)
        .maybeSingle()
      check(error, 'refresh')
      if (!data) return null
      const { contact, campaign, ...enrollment } = data as ReactivationEnrollment & {
        contact: RunnerContact
        campaign: { status: ReactivationCampaign['status'] }
      }
      return { enrollment, contact, campaignStatus: campaign.status }
    },

    async hasActiveFlowRun(contactId) {
      const { data, error } = await db
        .from('flow_runs')
        .select('id')
        .eq('contact_id', contactId)
        .eq('status', 'active')
        .limit(1)
      check(error, 'hasActiveFlowRun')
      return (data ?? []).length > 0
    },

    async getSend(enrollmentId, step) {
      const { data, error } = await db
        .from('reactivation_sends')
        .select('*')
        .eq('enrollment_id', enrollmentId)
        .eq('step', step)
        .maybeSingle()
      check(error, 'getSend')
      return (data as ReactivationSend | null) ?? null
    },

    async recordAttempt(accountId, enrollmentId, step, nowIso) {
      const existing = await this.getSend(enrollmentId, step)
      if (existing) {
        // Conditional on the attempts we read: 0 rows = another run got here first.
        const { data, error } = await db
          .from('reactivation_sends')
          .update({ attempts: existing.attempts + 1, attempted_at: nowIso, updated_at: nowIso })
          .eq('id', existing.id)
          .eq('attempts', existing.attempts)
          .select('*')
          .maybeSingle()
        check(error, 'recordAttempt(update)')
        return (data as ReactivationSend | null) ?? null
      }
      // UNIQUE(enrollment_id, step) rejects a concurrent duplicate → null.
      const { data, error } = await db
        .from('reactivation_sends')
        .insert({
          account_id: accountId,
          enrollment_id: enrollmentId,
          step,
          attempts: 1,
          status: 'failed',
          error: 'in_progress',
          attempted_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('*')
        .single()
      if (error?.code === '23505') return null
      check(error, 'recordAttempt(insert)')
      return data as ReactivationSend
    },

    async updateSend(id, patch) {
      const { error } = await db.from('reactivation_sends').update(patch).eq('id', id)
      check(error, 'updateSend')
    },

    async latestConversationId(contactId) {
      const { data, error } = await db
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      check(error, 'latestConversationId')
      return data?.id ?? null
    },

    async getTemplate(id) {
      const { data, error } = await db.from('message_templates').select('*').eq('id', id).maybeSingle()
      check(error, 'getTemplate')
      return (data as MessageTemplate | null) ?? null
    },

    async insertDryRunMessage(conversationId, templateName, wamid) {
      const nowIso = new Date().toISOString()
      const { data, error } = await db
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_type: 'bot',
          content_type: 'template',
          content_text: `[simulado] template ${templateName}`,
          template_name: templateName,
          message_id: wamid,
          status: 'sent',
        })
        .select('id')
        .single()
      check(error, 'insertDryRunMessage')
      await db
        .from('conversations')
        .update({ last_message_text: `[simulado] ${templateName}`, last_message_at: nowIso })
        .eq('id', conversationId)
      return data?.id ?? null
    },

    async findMessageId(conversationId, wamid) {
      const { data } = await db
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('message_id', wamid)
        .limit(1)
        .maybeSingle()
      return data?.id ?? null
    },

    async pauseCampaign(id, reason) {
      const { error } = await db
        .from('reactivation_campaigns')
        .update({ status: 'paused', pause_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'active')
      check(error, 'pauseCampaign')
    },

    async acquireRunLock(holder, ttlSeconds) {
      const { data, error } = await db.rpc('reactivation_try_lock', {
        p_holder: holder,
        p_ttl_seconds: ttlSeconds,
      })
      check(error, 'acquireRunLock')
      return data === true
    },

    async releaseRunLock(holder) {
      const { error } = await db.rpc('reactivation_release_lock', { p_holder: holder })
      if (error) console.error('[reactivation] releaseRunLock:', error.message)
    },

    async finishIdleCampaigns(nowIso) {
      const { data: active, error } = await db
        .from('reactivation_campaigns')
        .select('id')
        .eq('status', 'active')
      check(error, 'finishIdleCampaigns')
      let n = 0
      for (const c of active ?? []) {
        const { count } = await db
          .from('reactivation_enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id)
          .in('status', ['pending', 'active'])
        if ((count ?? 0) === 0) {
          await db
            .from('reactivation_campaigns')
            .update({ status: 'finished', finished_at: nowIso, updated_at: nowIso })
            .eq('id', c.id)
            .eq('status', 'active')
          n++
        }
      }
      return n
    },
  }
}
