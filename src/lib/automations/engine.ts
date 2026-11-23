import type {
  Automation,
  AutomationLogStepResult,
  AutomationStep,
  AutomationTriggerType,
  ConditionStepConfig,
  KeywordMatchTriggerConfig,
  InteractiveReplyTriggerConfig,
  SendMessageStepConfig,
  SendButtonsStepConfig,
  SendListStepConfig,
  SendTemplateStepConfig,
  SendWebhookStepConfig,
  TagStepConfig,
  UpdateContactFieldStepConfig,
  WaitStepConfig,
  CreateDealStepConfig,
  AssignConversationStepConfig,
} from '@/types'
import { supabaseAdmin } from './admin-client'
import { engineSendText, engineSendTemplate, engineSendInteractive } from './meta-send'
import { validateInteractivePayload } from '@/lib/whatsapp/interactive'
import { isDeliverableUrl } from '@/lib/webhooks/ssrf'
import { keywordMatches } from '@/lib/keywords'

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

export interface AutomationContext {
  /** Raw message text, for keyword_match + message_content conditions. */
  message_text?: string
  /** Conversation the event belongs to, if any. */
  conversation_id?: string
  /** Arbitrary variables accumulated during execution. */
  vars?: Record<string, unknown>
  /** The tag id that was added, for tag_added trigger. */
  tag_id?: string
  /** Agent the conversation was assigned to, for conversation_assigned. */
  agent_id?: string
  /** Button / list-row id the customer tapped, for interactive_reply. */
  interactive_reply_id?: string
  /**
   * A7: how many automation hops led to this run. 0 = caused by the
   * customer, a screen, the API or a flow; 1 = caused by another
   * automation's step. Steps of a run write with depth + 1, and events
   * deeper than MAX_TRIGGER_DEPTH do not fire (loop protection).
   */
  automation_depth?: number
}

export interface DispatchInput {
  /** Account-level tenancy key. Drives the lookup of which active
   *  automations to fire — `automations.account_id` is the tenant
   *  isolation after migration 017. Replaces the previous `userId`
   *  field; the per-automation user_id is read off each row when
   *  needed (sender identity for outbound messages, log audit). */
  accountId: string
  triggerType: AutomationTriggerType
  contactId?: string | null
  context?: AutomationContext
  /**
   * 061: when the trigger comes from the event queue, the event's
   * created_at — only automations already active then may fire (an
   * automation switched on later does not replay queued events).
   */
  activeSince?: string
}

/**
 * Fire all active automations matching the given trigger for an
 * account.
 *
 * Must never throw — callers use fire-and-forget from the webhook.
 * All errors are caught and logged; per-automation failures are
 * recorded into automation_logs with status='failed'.
 */
export async function runAutomationsForTrigger(input: DispatchInput): Promise<void> {
  try {
    const db = supabaseAdmin()

    // Tenant isolation. `contactId` can be caller-supplied (the manual
    // POST /api/automations/engine entrypoint reads it straight from the
    // request body), and every step below runs through the service-role
    // client, which bypasses RLS. So before any step can touch the
    // contact, verify it actually belongs to this account. A foreign or
    // forged id is refused silently — callers are fire-and-forget, and a
    // distinct error would leak whether a given contact UUID exists.
    if (input.contactId) {
      const { data: owned, error: ownErr } = await db
        .from('contacts')
        .select('id')
        .eq('id', input.contactId)
        .eq('account_id', input.accountId)
        .maybeSingle()
      if (ownErr) {
        console.error('[automations] contact ownership check failed:', ownErr)
        return
      }
      if (!owned) {
        console.warn('[automations] contact not in account, refusing dispatch', input.contactId)
        return
      }
    }

    const automationsQuery = db
      .from('automations')
      .select('*')
      .eq('account_id', input.accountId)
      .eq('trigger_type', input.triggerType)
      .eq('is_active', true)
    const { data: automations, error } = await (input.activeSince
      ? automationsQuery.lte('activated_at', input.activeSince)
      : automationsQuery)
      // D6: every matching automation runs, oldest first (stable order).
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      console.error('[automations] fetch failed:', error)
      return
    }
    if (!automations || automations.length === 0) return

    for (const automation of automations as Automation[]) {
      if (!triggerMatches(automation, input.context)) continue
      try {
        await executeAutomation(automation, input)
      } catch (err) {
        console.error('[automations] execute failed:', automation.id, err)
      }
    }
  } catch (err) {
    console.error('[automations] dispatch failed:', err)
  }
}

/**
 * Resume a run that was parked at a wait step. Called from the cron
 * endpoint after it grabs a due `automation_pending_executions` row.
 */
export async function resumePendingExecution(pending: {
  id: string
  automation_id: string
  /** Audit-only; the automation row carries account_id for tenancy. */
  user_id: string
  /** Account-scoped lookups read from the automation row, so this
   *  field is just here to mirror the row shape and keep the cron's
   *  pass-through self-documenting. */
  account_id: string
  contact_id: string | null
  log_id: string | null
  parent_step_id: string | null
  branch: 'yes' | 'no' | null
  next_step_position: number
  context: AutomationContext
}): Promise<void> {
  const db = supabaseAdmin()
  const { data: automation, error } = await db
    .from('automations')
    .select('*')
    .eq('id', pending.automation_id)
    .maybeSingle()

  if (error) {
    console.error('[automations] resume: lookup failed', pending.automation_id, error)
    await markPending(pending.id, 'failed')
    return
  }
  // A2: deleted or switched off while this run was waiting → it does not
  // resume. Cancel the pending step and say why on the run's log.
  if (!automation || !(automation as Automation).is_active) {
    const why = automation ? 'automation is no longer active' : 'automation was deleted'
    await markPending(pending.id, 'cancelled')
    await appendResults(
      pending.log_id,
      [{ step_id: pending.id, step_type: 'wait', status: 'skipped', detail: `not resumed: ${why}` }],
      'cancelled',
      null,
    )
    return
  }

  try {
    const args: ExecuteArgs = {
      automation: automation as Automation,
      contactId: pending.contact_id,
      context: pending.context ?? {},
      parentStepId: pending.parent_step_id,
      branch: pending.branch,
      startPosition: pending.next_step_position,
      logId: pending.log_id,
      triggerEvent: 'resumed_wait',
    }
    const outcome = await executeStepsFrom(args)
    if (outcome === 'completed' && args.parentStepId) await continueAfterBranch(args)
    await markPending(pending.id, 'done')
  } catch (err) {
    console.error('[automations] resume failed:', err)
    await markPending(pending.id, 'failed')
  }
}

/**
 * D4 / A1: the contact sent something while one or more automations were
 * parked at a wait for them. Cancel those waits — except automations that
 * opted into "continue even if the contact replies" — and record it on
 * each run's log. Called by the webhook for every inbound from the contact,
 * before this message's own triggers run. Must never throw.
 */
export async function cancelWaitsOnContactReply(accountId: string, contactId: string): Promise<number> {
  try {
    const db = supabaseAdmin()
    const { data: open } = await db
      .from('automation_pending_executions')
      .select('id, automation_id, log_id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('status', 'pending')
    const rows = (open ?? []) as { id: string; automation_id: string; log_id: string | null }[]
    if (rows.length === 0) return 0

    const { data: keep } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('continue_on_reply', true)
    const keepIds = new Set(((keep ?? []) as { id: string }[]).map((a) => a.id))

    let cancelled = 0
    for (const row of rows) {
      if (keepIds.has(row.automation_id)) continue
      const { data: hit } = await db
        .from('automation_pending_executions')
        .update({ status: 'cancelled' })
        .eq('id', row.id)
        .eq('status', 'pending') // the cron may have claimed it meanwhile
        .select('id')
      if (!hit || (hit as unknown[]).length === 0) continue
      cancelled++
      await appendResults(
        row.log_id,
        [{ step_id: row.id, step_type: 'wait', status: 'skipped', detail: 'cancelled: contact replied during the wait' }],
        'cancelled',
        null,
      )
    }
    return cancelled
  } catch (err) {
    console.error('[automations] cancelWaitsOnContactReply failed:', err)
    return 0
  }
}

/** A1: does this automation already have an open (waiting) run for the contact? */
async function hasOpenRun(automationId: string, contactId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from('automation_pending_executions')
    .select('id')
    .eq('automation_id', automationId)
    .eq('contact_id', contactId)
    .in('status', ['pending', 'running'])
    .limit(1)
  return ((data ?? []) as unknown[]).length > 0
}

/** A7: events deeper than this are recorded but do not fire. */
export const MAX_TRIGGER_DEPTH = 1

interface TriggerEventRow {
  id: string
  account_id: string
  trigger_type: 'tag_added' | 'conversation_assigned'
  contact_id: string | null
  context: AutomationContext | null
  depth: number
  created_at: string
}

/**
 * D3: run the automations for tag_added / conversation_assigned events
 * recorded by the database (migration 055), whatever wrote the change:
 * a screen, the public API, a flow or an automation step. Called right
 * after server-side writes (webhook, API, the inbox's ping) and by the
 * automations cron as a safety net. Loops through rounds so a chain
 * (tag → automation → tag) is processed now, bounded by the depth cap.
 * Never throws.
 */
export async function drainAutomationTriggerEvents(accountId: string | null, limit = 50): Promise<number> {
  let fired = 0
  try {
    const db = supabaseAdmin()
    // 061: events left in the queue for more than 60 minutes are dropped
    // (a late drain must not fire stale tags/assignments); the database also
    // writes a 'skipped' row ("evento vencido") to each automation's logs.
    const { data: expired, error: expireErr } = await db.rpc('expire_stale_automation_trigger_events', {
      p_account_id: accountId,
    })
    if (expireErr) {
      console.error('[automations] expire stale trigger events failed:', expireErr)
    } else if (Number(expired) > 0) {
      console.warn('[automations] eventos da fila com mais de 60 min descartados:', {
        accountId,
        count: Number(expired),
      })
    }
    for (let round = 0; round < 10; round++) {
      const { data, error } = await db.rpc('claim_automation_trigger_events', {
        p_account_id: accountId,
        p_limit: limit,
      })
      if (error) {
        console.error('[automations] claim trigger events failed:', error)
        return fired
      }
      const events = (data ?? []) as TriggerEventRow[]
      if (events.length === 0) return fired
      for (const ev of events) {
        const skip = ev.depth > MAX_TRIGGER_DEPTH
        if (!skip) {
          await runAutomationsForTrigger({
            accountId: ev.account_id,
            triggerType: ev.trigger_type,
            contactId: ev.contact_id,
            context: { ...(ev.context ?? {}), automation_depth: ev.depth },
            // 061: only automations already active when the event happened
            activeSince: ev.created_at,
          })
          fired++
        }
        await db
          .from('automation_trigger_events')
          .update({ status: skip ? 'skipped' : 'done', processed_at: new Date().toISOString() })
          .eq('id', ev.id)
      }
    }
  } catch (err) {
    console.error('[automations] drainAutomationTriggerEvents failed:', err)
  }
  return fired
}

// ------------------------------------------------------------
// Internal execution
// ------------------------------------------------------------

async function executeAutomation(automation: Automation, input: DispatchInput) {
  const db = supabaseAdmin()

  // A1: one execution per automation and contact. While a run is parked
  // at a wait for this contact (it survived the reply because of
  // continue_on_reply), the trigger firing again does not start another.
  if (input.contactId && (await hasOpenRun(automation.id, input.contactId))) {
    return
  }

  const { data: log, error: logErr } = await db
    .from('automation_logs')
    .insert({
      automation_id: automation.id,
      // Tenancy: matches automation.account_id (NOT NULL post-017).
      account_id: automation.account_id,
      // Audit: keeps the historical "author of this automation"
      // pointer so logs still attribute to the right user even
      // after teammates join the account.
      user_id: automation.user_id,
      contact_id: input.contactId ?? null,
      trigger_event: input.triggerType,
      steps_executed: [],
      status: 'success',
    })
    .select()
    .single()

  if (logErr || !log) {
    console.error('[automations] cannot create log:', logErr)
    return
  }

  await executeStepsFrom({
    automation,
    contactId: input.contactId ?? null,
    context: input.context ?? {},
    parentStepId: null,
    branch: null,
    startPosition: 0,
    logId: log.id,
    triggerEvent: input.triggerType,
  })

  // Atomic counter update via the SQL function from migration 007.
  // Doing this with a client-side read-modify-write raced when the
  // same automation fired for two contacts simultaneously — both
  // would read N and both write N+1, losing one count permanently.
  const { error: rpcErr } = await db.rpc('increment_automation_execution_count', {
    p_automation_id: automation.id,
  })
  if (rpcErr) {
    console.error('[automations] increment counter failed:', rpcErr)
  }
}

interface ExecuteArgs {
  automation: Automation
  contactId: string | null
  context: AutomationContext
  parentStepId: string | null
  branch: 'yes' | 'no' | null
  startPosition: number
  logId: string | null
  triggerEvent: string
}

/**
 * How a scope (the top level or one condition branch) ended:
 * - completed: every step ran; the enclosing scope continues;
 * - suspended: a wait parked the run; nothing after it runs now (A4);
 * - failed: a step threw; the whole run stops (A5).
 */
type ScopeOutcome = 'completed' | 'suspended' | 'failed'

async function executeStepsFrom(args: ExecuteArgs): Promise<ScopeOutcome> {
  const db = supabaseAdmin()
  const topLevel = args.parentStepId === null

  const baseQuery = db
    .from('automation_steps')
    .select('*')
    .eq('automation_id', args.automation.id)
    .gte('position', args.startPosition)
    .order('position', { ascending: true })

  const scoped = topLevel
    ? baseQuery.is('parent_step_id', null)
    : baseQuery.eq('parent_step_id', args.parentStepId).eq('branch', args.branch ?? 'yes')

  const { data: steps, error: stepsErr } = await scoped

  if (stepsErr) {
    await finalizeLog(args.logId, 'failed', stepsErr.message)
    return 'failed'
  }
  if (!steps || steps.length === 0) {
    if (topLevel && args.logId) await finalizeLog(args.logId, 'success', null)
    return 'completed'
  }

  // Results are flushed to the log before descending into a branch so
  // steps_executed stays in execution order.
  let results: AutomationLogStepResult[] = []
  const flush = async () => {
    if (results.length) await appendResults(args.logId, results, null, null)
    results = []
  }

  for (const step of steps as AutomationStep[]) {
    // `wait` is the suspension point: enqueue and stop. The cron resumes
    // this scope later and then climbs back to the enclosing scopes.
    if (step.step_type === 'wait') {
      const cfg = step.step_config as WaitStepConfig
      const ms = waitMs(cfg)
      const { error: waitErr } = await db.from('automation_pending_executions').insert({
        automation_id: args.automation.id,
        // Tenancy: account_id required NOT NULL post-017.
        account_id: args.automation.account_id,
        user_id: args.automation.user_id,
        contact_id: args.contactId,
        log_id: args.logId,
        parent_step_id: args.parentStepId,
        branch: args.branch,
        next_step_position: step.position + 1,
        context: args.context,
        run_at: new Date(Date.now() + ms).toISOString(),
        status: 'pending',
      })
      if (waitErr) {
        // 23505: another run of this automation is already waiting for
        // this contact (A1) — this one stops instead of running in parallel.
        const msg =
          (waitErr as { code?: string }).code === '23505'
            ? 'another run of this automation is already waiting for this contact'
            : `could not schedule the wait: ${waitErr.message}`
        results.push({ step_id: step.id, step_type: step.step_type, status: 'failed', detail: msg })
        await appendResults(args.logId, results, 'failed', msg)
        return 'failed'
      }
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail: `waiting ${cfg.amount} ${cfg.unit}`,
      })
      // A4: an open wait is never reported as success.
      await appendResults(args.logId, results, 'waiting', null)
      return 'suspended'
    }

    if (step.step_type === 'condition') {
      let taken: boolean
      try {
        taken = await evaluateCondition(step.step_config as ConditionStepConfig, args)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ step_id: step.id, step_type: 'condition', status: 'failed', detail: msg })
        await appendResults(args.logId, results, 'failed', msg)
        return 'failed'
      }
      results.push({
        step_id: step.id,
        step_type: 'condition',
        status: 'success',
        detail: `branch=${taken ? 'yes' : 'no'}`,
      })
      await flush()
      const branchOutcome = await executeStepsFrom({
        ...args,
        parentStepId: step.id,
        branch: taken ? 'yes' : 'no',
        startPosition: 0,
      })
      // A5: a failed branch fails the whole run, like a top-level error.
      if (branchOutcome === 'failed') {
        await appendResults(args.logId, [], 'failed', null)
        return 'failed'
      }
      if (branchOutcome === 'suspended') return 'suspended'
      continue
    }

    try {
      const detail = await runStep(step, args)
      results.push({ step_id: step.id, step_type: step.step_type, status: 'success', detail })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ step_id: step.id, step_type: step.step_type, status: 'failed', detail: msg })
      await appendResults(args.logId, results, 'failed', msg)
      return 'failed'
    }
  }

  // Only the top level decides the final status; a finished branch hands
  // control back to its parent scope.
  await appendResults(args.logId, results, topLevel ? 'success' : null, null)
  return 'completed'
}

/**
 * A4: after a wait inside a branch finishes, keep going in the enclosing
 * scopes — the steps after the condition — up to the top level.
 */
async function continueAfterBranch(args: ExecuteArgs): Promise<void> {
  let parentStepId = args.parentStepId
  while (parentStepId) {
    const { data: parent } = await supabaseAdmin()
      .from('automation_steps')
      .select('id, position, parent_step_id, branch')
      .eq('id', parentStepId)
      .maybeSingle()
    if (!parent) {
      await finalizeLog(args.logId, 'failed', 'condition step removed while waiting')
      return
    }
    const p = parent as { position: number; parent_step_id: string | null; branch: 'yes' | 'no' | null }
    const outcome = await executeStepsFrom({
      ...args,
      parentStepId: p.parent_step_id,
      branch: p.branch,
      startPosition: p.position + 1,
    })
    if (outcome !== 'completed') return
    parentStepId = p.parent_step_id
  }
}

async function runStep(step: AutomationStep, args: ExecuteArgs): Promise<string> {
  const db = supabaseAdmin()

  switch (step.step_type) {
    case 'send_message': {
      const cfg = step.step_config as SendMessageStepConfig
      if (!args.contactId) throw new Error('send_message needs a contact')
      const text = interpolate(cfg.text, args)
      if (!text.trim()) throw new Error('send_message has empty text')
      const conversationId = await resolveConversationId(args)
      const { whatsapp_message_id } = await engineSendText({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        text,
      })
      return `sent via Meta (${whatsapp_message_id})`
    }

    case 'send_buttons':
    case 'send_list': {
      const payload = step.step_config as SendButtonsStepConfig | SendListStepConfig
      if (!args.contactId) throw new Error(`${step.step_type} needs a contact`)
      // Validate against Meta's limits before the network call so a bad
      // payload surfaces as a clear failed-step detail rather than a raw
      // Meta 400 mid-conversation.
      const check = validateInteractivePayload(payload)
      if (!check.ok) throw new Error(check.error)
      const conversationId = await resolveConversationId(args)
      const { whatsapp_message_id } = await engineSendInteractive({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        payload,
      })
      return `interactive sent via Meta (${whatsapp_message_id})`
    }

    case 'send_template': {
      const cfg = step.step_config as SendTemplateStepConfig
      if (!args.contactId) throw new Error('send_template needs a contact')
      if (!cfg.template_name) throw new Error('send_template needs template_name')
      const conversationId = await resolveConversationId(args)
      // Meta templates use positional {{1}}, {{2}}, … placeholders, so
      // we MUST emit params in strict numeric order. Lexicographic sort
      // of "1", "2", …, "10" yields "1", "10", "2", … which silently
      // scrambles every template with ≥10 variables.
      const params = cfg.variables
        ? Object.keys(cfg.variables)
            .sort((a, b) => {
              const na = Number(a)
              const nb = Number(b)
              const aNum = Number.isFinite(na)
              const bNum = Number.isFinite(nb)
              if (aNum && bNum) return na - nb
              if (aNum) return -1
              if (bNum) return 1
              return a.localeCompare(b)
            })
            .map((k) => String(cfg.variables![k]))
        : []
      const { whatsapp_message_id } = await engineSendTemplate({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        templateName: cfg.template_name,
        language: cfg.language,
        params,
      })
      return `template sent via Meta (${whatsapp_message_id})`
    }

    case 'add_tag': {
      // contact_tags has no account_id column; cross-tenant protection for
      // the attacker-supplied contactId comes from the ownership guard in
      // runAutomationsForTrigger.
      const cfg = step.step_config as TagStepConfig
      if (!args.contactId || !cfg.tag_id) throw new Error('add_tag needs contact + tag_id')
      // A6: the tag must exist in this account.
      await requireRow('tags', { id: cfg.tag_id, account_id: args.automation.account_id }, 'add_tag: tag not found in this account')
      // Through the RPC so the tag_added event carries this run's depth (A7).
      const { data: inserted, error: tagErr } = await db.rpc('automation_add_tag', {
        p_contact_id: args.contactId,
        p_tag_id: cfg.tag_id,
        p_depth: (args.context.automation_depth ?? 0) + 1,
      })
      if (tagErr) throw new Error(`add_tag failed: ${tagErr.message}`)
      return inserted === false ? `tag ${cfg.tag_id} already present` : `tag ${cfg.tag_id} added`
    }

    case 'remove_tag': {
      // See add_tag: tenant scoping relies on the runAutomationsForTrigger
      // ownership guard, since contact_tags carries no account_id.
      const cfg = step.step_config as TagStepConfig
      if (!args.contactId || !cfg.tag_id) throw new Error('remove_tag needs contact + tag_id')
      const { error: rmErr } = await db
        .from('contact_tags')
        .delete()
        .eq('contact_id', args.contactId)
        .eq('tag_id', cfg.tag_id)
      if (rmErr) throw new Error(`remove_tag failed: ${rmErr.message}`)
      return `tag ${cfg.tag_id} removed`
    }

    case 'assign_conversation': {
      const cfg = step.step_config as AssignConversationStepConfig
      if (!args.contactId) throw new Error('assign_conversation needs a contact')
      let agentId = cfg.agent_id
      if (cfg.mode === 'round_robin') {
        // Pick any member of the account. The existing implementation
        // only ever returned the automation's author; preserving that
        // shape until a real round-robin algorithm replaces it.
        const { data: profiles } = await db
          .from('profiles')
          .select('user_id')
          .eq('account_id', args.automation.account_id)
          .neq('account_role', 'viewer') // 059: viewers can't own conversations
          .limit(1)
        agentId = profiles?.[0]?.user_id
      }
      if (!agentId) throw new Error('assign_conversation: no agent resolved')
      // A6: only a member of this account can be assigned.
      // 059: and not a view-only member (the database refuses it too).
      const { data: member, error: memberErr } = await db
        .from('profiles')
        .select('account_role')
        .eq('user_id', agentId)
        .eq('account_id', args.automation.account_id)
        .maybeSingle()
      if (memberErr) throw new Error(`assign_conversation: could not check the agent (${memberErr.message})`)
      if (!member) throw new Error('assign_conversation: agent is not a member of this account')
      if (member.account_role === 'viewer') {
        throw new Error('assign_conversation: agent has a view-only role in this account')
      }
      // Through the RPC so the conversation_assigned event carries depth (A7).
      const { data: assigned, error: assignErr } = await db.rpc('automation_assign_conversation', {
        p_account_id: args.automation.account_id,
        p_contact_id: args.contactId,
        p_agent_id: agentId,
        p_depth: (args.context.automation_depth ?? 0) + 1,
      })
      if (assignErr) throw new Error(`assign_conversation failed: ${assignErr.message}`)
      if (!assigned) {
        throw new Error('assign_conversation: no conversation for this contact')
      }
      return `assigned to ${agentId}`
    }

    case 'update_contact_field': {
      const cfg = step.step_config as UpdateContactFieldStepConfig
      if (!args.contactId) throw new Error('update_contact_field needs a contact')
      // Resolve workflow variables ({{ vars.* }}, {{ message.text }}) so custom
      // values can be populated dynamically from the triggering context.
      const value = interpolate(cfg.value, args)

      // Custom fields are encoded as `custom:<custom_field_id>`; anything else
      // is a built-in contact column.
      if (cfg.field.startsWith('custom:')) {
        const customFieldId = cfg.field.slice('custom:'.length)
        if (!customFieldId) {
          throw new Error(`update_contact_field: field ${cfg.field} not writable from automations`)
        }
        // Defense in depth: the service-role client bypasses RLS, so confirm
        // the field definition belongs to this account before writing.
        const { data: field } = await db
          .from('custom_fields')
          .select('id')
          .eq('id', customFieldId)
          .eq('account_id', args.automation.account_id)
          .maybeSingle()
        if (!field) {
          throw new Error(`update_contact_field: field ${cfg.field} not writable from automations`)
        }
        // Upsert on the table's UNIQUE(contact_id, custom_field_id) so repeated
        // runs overwrite rather than duplicate. Tenancy is enforced above and,
        // for the contact side, by the entry-point ownership guard.
        const { error: cfErr } = await db
          .from('contact_custom_values')
          .upsert(
            { contact_id: args.contactId, custom_field_id: customFieldId, value },
            { onConflict: 'contact_id,custom_field_id' },
          )
        if (cfErr) throw new Error(`update_contact_field failed: ${cfErr.message}`)
        return `custom field updated`
      }

      const allowed = new Set(['name', 'email', 'company'])
      if (!allowed.has(cfg.field)) {
        throw new Error(`update_contact_field: field ${cfg.field} not writable from automations`)
      }
      // Defense in depth: scope the service-role write to the account so
      // a future caller that skips the entry-point ownership guard still
      // cannot write across tenants.
      const { data: updatedRows, error: upErr } = await db
        .from('contacts')
        .update({ [cfg.field]: value, updated_at: new Date().toISOString() })
        .eq('id', args.contactId)
        .eq('account_id', args.automation.account_id)
        .select('id')
      if (upErr) throw new Error(`update_contact_field failed: ${upErr.message}`)
      if (!updatedRows || (updatedRows as unknown[]).length === 0) {
        throw new Error('update_contact_field: contact not found')
      }
      return `${cfg.field} updated`
    }

    case 'create_deal': {
      const cfg = step.step_config as CreateDealStepConfig
      if (!cfg.pipeline_id || !cfg.stage_id) throw new Error('create_deal needs pipeline + stage')
      // A6: pipeline from this account, stage from that pipeline.
      await requireRow(
        'pipelines',
        { id: cfg.pipeline_id, account_id: args.automation.account_id },
        'create_deal: pipeline not found in this account',
      )
      await requireRow(
        'pipeline_stages',
        { id: cfg.stage_id, pipeline_id: cfg.pipeline_id },
        'create_deal: stage does not belong to this pipeline',
      )
      // Match the account's configured default currency rather than
      // the static `deals.currency` DB default — keeps automation-
      // created deals consistent with the one-currency-per-account
      // rule (issue #218). Fall back to USD if the row is somehow
      // missing the value (pre-021 forks).
      const { data: acct } = await db
        .from('accounts')
        .select('default_currency')
        .eq('id', args.automation.account_id)
        .maybeSingle()
      const { error: dealErr } = await db.from('deals').insert({
        // Tenancy + audit, same split as automation_logs above.
        account_id: args.automation.account_id,
        user_id: args.automation.user_id,
        pipeline_id: cfg.pipeline_id,
        stage_id: cfg.stage_id,
        contact_id: args.contactId,
        title: interpolate(cfg.title, args),
        value: cfg.value ?? 0,
        currency: acct?.default_currency ?? 'USD',
        status: 'open',
      })
      if (dealErr) throw new Error(`create_deal failed: ${dealErr.message}`)
      return 'deal created'
    }

    case 'send_webhook': {
      const cfg = step.step_config as SendWebhookStepConfig
      if (!cfg.url) throw new Error('send_webhook needs url')
      // SSRF guard: the URL and headers are account-controlled and the
      // server makes the request, so refuse any destination that resolves
      // to a private / loopback / link-local / reserved address. Mirrors
      // the webhook_endpoints delivery path (see lib/webhooks/deliver.ts).
      if (!(await isDeliverableUrl(cfg.url))) {
        throw new Error('send_webhook: destination not allowed')
      }
      const body = cfg.body_template ? interpolate(cfg.body_template, args) : JSON.stringify(args.context)
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.headers ?? {}) },
        body,
        // Do NOT follow redirects — a public URL could 3xx-bounce to an
        // internal address, defeating the guard above. Bound the request
        // so a hung/slow internal host can't tie up the runner.
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`webhook returned ${res.status}`)
      return `webhook ${res.status}`
    }

    case 'close_conversation': {
      if (!args.contactId) throw new Error('close_conversation needs a contact')
      await db
        .from('conversations')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('account_id', args.automation.account_id)
        .eq('contact_id', args.contactId)
      return 'conversation closed'
    }

    default:
      return `unknown step: ${step.step_type}`
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** A6: throw `message` unless a row matching `match` exists in `table`. */
async function requireRow(table: string, match: Record<string, string>, message: string): Promise<void> {
  let q = supabaseAdmin().from(table).select('id')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data, error } = await q.limit(1)
  if (error) throw new Error(`${message} (${error.message})`)
  if (!data || (data as unknown[]).length === 0) throw new Error(message)
}

/**
 * Pick the conversation a send-type step should use. Prefer the id the
 * webhook handed us (it's the one that just got the inbound message);
 * fall back to the contact's conversation for resumed/wait paths and
 * manual engine POSTs. Throws if none exists — send steps have
 * no meaningful target without a conversation.
 */
async function resolveConversationId(args: ExecuteArgs): Promise<string> {
  const fromCtx = args.context.conversation_id
  if (fromCtx) return fromCtx
  if (!args.contactId) throw new Error('cannot resolve conversation: no contact')
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .select('id')
    .eq('account_id', args.automation.account_id)
    .eq('contact_id', args.contactId)
    .maybeSingle()
  if (error) throw new Error(`conversation lookup failed: ${error.message}`)
  if (!data?.id) throw new Error('no conversation for contact')
  return data.id as string
}

export function triggerMatches(automation: Automation, ctx: AutomationContext | undefined): boolean {
  if (automation.trigger_type === 'keyword_match') {
    const cfg = automation.trigger_config as KeywordMatchTriggerConfig
    if (!cfg?.keywords || cfg.keywords.length === 0) return false
    // D5: shared rule with flows (src/lib/keywords.ts).
    return keywordMatches((ctx?.message_text ?? '').toString(), cfg.keywords, cfg.match_type)
  }

  // D3: tag_added fires for the configured tag only.
  if (automation.trigger_type === 'tag_added') {
    const tagId = (automation.trigger_config as { tag_id?: string } | null)?.tag_id
    return !tagId || ctx?.tag_id === tagId
  }
  // conversation_assigned: optionally only for one agent.
  if (automation.trigger_type === 'conversation_assigned') {
    const agentId = (automation.trigger_config as { agent_id?: string } | null)?.agent_id
    return !agentId || ctx?.agent_id === agentId
  }

  // Match on the tapped button / list-row id (exact). Lets multi-step
  // menus be chained: automation A sends buttons, automation B fires on
  // the reply id and sends the next step.
  if (automation.trigger_type === 'interactive_reply') {
    const cfg = automation.trigger_config as InteractiveReplyTriggerConfig
    const replyId = ctx?.interactive_reply_id
    if (!replyId || !Array.isArray(cfg?.reply_ids) || cfg.reply_ids.length === 0) {
      return false
    }
    return cfg.reply_ids.includes(replyId)
  }

  return true
}

async function evaluateCondition(cfg: ConditionStepConfig, args: ExecuteArgs): Promise<boolean> {
  const db = supabaseAdmin()
  switch (cfg.subject) {
    case 'tag_presence': {
      if (!args.contactId || !cfg.operand) return false
      // contact_tags has no account_id column (its RLS keys off the parent
      // contact), so tenant scoping here relies on the contact-ownership
      // guard in runAutomationsForTrigger.
      const { count } = await db
        .from('contact_tags')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', args.contactId)
        .eq('tag_id', cfg.operand)
      return (count ?? 0) > 0
    }
    case 'contact_field': {
      if (!args.contactId || !cfg.operand) return false
      // Scope to the account so the condition can't be turned into a
      // cross-tenant read oracle via the service-role client.
      const { data } = await db
        .from('contacts')
        .select(cfg.operand)
        .eq('id', args.contactId)
        .eq('account_id', args.automation.account_id)
        .maybeSingle()
      const v = (data as Record<string, unknown> | null)?.[cfg.operand]
      return v != null && String(v) === String(cfg.value ?? '')
    }
    case 'message_content': {
      const text = (args.context.message_text ?? '').toString()
      return text.toLowerCase().includes((cfg.value ?? '').toLowerCase())
    }
    case 'time_of_day': {
      // operand form "HH:mm-HH:mm" — true if now is within that window
      // (supports over-midnight ranges like "18:00-09:00").
      const [from, to] = (cfg.operand ?? '').split('-')
      if (!from || !to) return false
      // A3: the window is in the account's time zone, never the server's.
      const mins = minutesOfDayIn(new Date(), await accountTimeZone(args.automation.account_id))
      const parse = (s: string) => {
        const [h, m] = s.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
      }
      const f = parse(from)
      const t = parse(to)
      return f <= t ? mins >= f && mins < t : mins >= f || mins < t
    }
    default:
      return false
  }
}

export const DEFAULT_ACCOUNT_TIME_ZONE = 'America/Sao_Paulo'

async function accountTimeZone(accountId: string): Promise<string> {
  const { data } = await supabaseAdmin()
    .from('accounts')
    .select('timezone')
    .eq('id', accountId)
    .maybeSingle()
  const tz = (data as { timezone?: string | null } | null)?.timezone
  return tz || DEFAULT_ACCOUNT_TIME_ZONE
}

/** Minutes since midnight of `at` in `timeZone` (invalid zone → default). */
export function minutesOfDayIn(at: Date, timeZone: string): number {
  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  } catch {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_ACCOUNT_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  }
  const parts = fmt.formatToParts(at)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

function waitMs(cfg: WaitStepConfig): number {
  const unitMs = cfg.unit === 'days' ? 86_400_000 : cfg.unit === 'hours' ? 3_600_000 : 60_000
  return Math.max(1_000, cfg.amount * unitMs)
}

function interpolate(s: string, args: ExecuteArgs): string {
  return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const [ns, prop] = String(key).split('.')
    if (ns === 'message' && prop === 'text') return String(args.context.message_text ?? '')
    if (ns === 'vars' && prop) return String(args.context.vars?.[prop] ?? '')
    return ''
  })
}

async function appendResults(
  logId: string | null,
  newItems: AutomationLogStepResult[],
  status: 'success' | 'partial' | 'failed' | 'cancelled' | 'waiting' | null,
  errorMessage: string | null,
) {
  if (!logId) return
  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('automation_logs')
    .select('steps_executed, status')
    .eq('id', logId)
    .single()
  const merged = [
    ...((existing?.steps_executed as AutomationLogStepResult[] | undefined) ?? []),
    ...newItems,
  ]
  const update: Record<string, unknown> = { steps_executed: merged }
  // Only overwrite status on the outermost scope — nested branches pass null.
  if (status !== null) {
    update.status = status
  }
  if (errorMessage) update.error_message = errorMessage
  await db.from('automation_logs').update(update).eq('id', logId)
}

async function finalizeLog(
  logId: string | null,
  status: 'success' | 'partial' | 'failed',
  errorMessage: string | null,
) {
  if (!logId) return
  await supabaseAdmin()
    .from('automation_logs')
    .update({ status, error_message: errorMessage })
    .eq('id', logId)
}

async function markPending(id: string, status: 'done' | 'failed' | 'cancelled') {
  await supabaseAdmin()
    .from('automation_pending_executions')
    .update({ status })
    .eq('id', id)
}
