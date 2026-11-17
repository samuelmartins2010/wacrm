import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import type { ReactivationBand, ReactivationStep } from '@/types'
import { ReactivationError, loadAccountTemplates, validateCampaignSteps } from './queries'

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ReactivationError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  return toErrorResponse(err)
}

const BANDS: ReactivationBand[] = ['late', 'cooling', 'gone']

export function parseBands(v: unknown): ReactivationBand[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []
  const out = arr.filter((b): b is ReactivationBand => BANDS.includes(b as ReactivationBand))
  return out.length ? out : [...BANDS]
}

export function parseIds(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []
  return arr.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))
}

export interface CampaignBody {
  name?: unknown
  bands?: unknown
  tag_ids?: unknown
  exclude_tag_ids?: unknown
  steps?: unknown
}

/** Shared by POST and PATCH: returns a DB patch or an error message. */
export async function campaignPatchFromBody(
  body: CampaignBody,
  loadTemplates: () => ReturnType<typeof loadAccountTemplates>,
): Promise<{ patch: Record<string, unknown> } | { error: string }> {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return { error: 'Dê um nome para a campanha.' }
  const steps = (Array.isArray(body.steps) ? body.steps : []) as ReactivationStep[]
  const invalid = validateCampaignSteps(steps, await loadTemplates())
  if (invalid) return { error: invalid }
  return {
    patch: {
      name: name.slice(0, 120),
      bands: parseBands(body.bands),
      tag_ids: parseIds(body.tag_ids),
      exclude_tag_ids: parseIds(body.exclude_tag_ids),
      steps: steps.map((s) => ({ template_id: s.template_id, params: s.params, wait_days: s.wait_days })),
    },
  }
}
