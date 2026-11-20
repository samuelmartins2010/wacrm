import type { SupabaseClient } from '@supabase/supabase-js'
import type { ValidationIssue } from './validate'

/**
 * A6: steps that point at account data (tag, agent, pipeline/stage,
 * custom field) are checked on every save, so a reference that does not
 * exist in the account is refused in the editor instead of failing later
 * at run time. Empty values are left to the activation check — drafts
 * may be incomplete.
 */
export interface AccountRefs {
  tagIds: Set<string>
  stagesByPipeline: Map<string, Set<string>>
  memberIds: Set<string>
  /** Members with a view-only role: can't be assignees (migration 059). */
  viewerIds: Set<string>
  customFieldIds: Set<string>
}

interface StepLike {
  step_type: string
  step_config: Record<string, unknown>
  branches?: { yes?: StepLike[]; no?: StepLike[] }
}

const WRITABLE_CONTACT_FIELDS = new Set(['name', 'email', 'company'])
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)

export function validateStepReferences(steps: StepLike[], refs: AccountRefs): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const walk = (list: StepLike[], prefix: string) =>
    list.forEach((step, i) => {
      const path = `${prefix}steps[${i}]`
      const c = step.step_config ?? {}
      switch (step.step_type) {
        case 'add_tag':
        case 'remove_tag': {
          const id = str(c.tag_id)
          if (id && !refs.tagIds.has(id)) issues.push({ path: `${path}.tag_id`, message: 'tag not found in this account' })
          break
        }
        case 'assign_conversation': {
          const id = str(c.agent_id)
          if (c.mode !== 'round_robin' && id && !refs.memberIds.has(id)) {
            issues.push({ path: `${path}.agent_id`, message: 'agent is not a member of this account' })
          } else if (c.mode !== 'round_robin' && id && refs.viewerIds.has(id)) {
            issues.push({ path: `${path}.agent_id`, message: 'agent has a view-only role in this account' })
          }
          break
        }
        case 'create_deal': {
          const p = str(c.pipeline_id)
          const st = str(c.stage_id)
          if (p && !refs.stagesByPipeline.has(p)) {
            issues.push({ path: `${path}.pipeline_id`, message: 'pipeline not found in this account' })
          } else if (p && st && !refs.stagesByPipeline.get(p)!.has(st)) {
            issues.push({ path: `${path}.stage_id`, message: 'stage does not belong to this pipeline' })
          }
          break
        }
        case 'update_contact_field': {
          const f = str(c.field)
          if (!f) break
          const ok = f.startsWith('custom:')
            ? refs.customFieldIds.has(f.slice('custom:'.length))
            : WRITABLE_CONTACT_FIELDS.has(f)
          if (!ok) issues.push({ path: `${path}.field`, message: `field ${f} is not writable from automations` })
          break
        }
      }
      if (step.step_type === 'condition' && step.branches) {
        if (step.branches.yes) walk(step.branches.yes, `${path}.yes.`)
        if (step.branches.no) walk(step.branches.no, `${path}.no.`)
      }
    })
  walk(Array.isArray(steps) ? steps : [], '')
  return issues
}

/** Load the ids `validateStepReferences` checks against, for one account. */
export async function loadAccountRefs(db: SupabaseClient, accountId: string): Promise<AccountRefs> {
  const [tags, pipelines, members, fields] = await Promise.all([
    db.from('tags').select('id').eq('account_id', accountId),
    db.from('pipelines').select('id').eq('account_id', accountId),
    db.from('profiles').select('user_id, account_role').eq('account_id', accountId),
    db.from('custom_fields').select('id').eq('account_id', accountId),
  ])
  const pipelineIds = ((pipelines.data ?? []) as { id: string }[]).map((p) => p.id)
  const stagesByPipeline = new Map<string, Set<string>>(pipelineIds.map((id) => [id, new Set<string>()]))
  if (pipelineIds.length) {
    const { data: stages } = await db.from('pipeline_stages').select('id, pipeline_id').in('pipeline_id', pipelineIds)
    for (const s of (stages ?? []) as { id: string; pipeline_id: string }[]) stagesByPipeline.get(s.pipeline_id)?.add(s.id)
  }
  return {
    tagIds: new Set(((tags.data ?? []) as { id: string }[]).map((t) => t.id)),
    stagesByPipeline,
    memberIds: new Set(((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id)),
    viewerIds: new Set(
      ((members.data ?? []) as { user_id: string; account_role: string }[])
        .filter((m) => m.account_role === 'viewer')
        .map((m) => m.user_id),
    ),
    customFieldIds: new Set(((fields.data ?? []) as { id: string }[]).map((f) => f.id)),
  }
}
