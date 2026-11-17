import { describe, it, expect } from 'vitest'
import type { MessageTemplate, ReactivationSettings, ReactivationStep } from '@/types'
import { addDays } from './rules'
import {
  ReactivationError,
  approveCampaign,
  assertDraft,
  buildCandidates,
  countBodyVariables,
  planEnrollments,
  validateCampaignSteps,
  type CandidateRow,
} from './queries'

const NOW = new Date('2026-11-17T13:00:00Z')
const ago = (d: number) => addDays(NOW, -d).toISOString()

const settings: ReactivationSettings = {
  account_id: 'a',
  band_late_days: 30,
  band_cooling_days: 60,
  band_gone_days: 120,
  rest_days: 60,
  recent_outbound_days: 7,
  daily_limit: 50,
  send_window: { mon_fri: [9, 19], sat: [9, 13], sun: null },
  optout_keywords: ['SAIR'],
  optout_reply: 'x',
}

function row(id: string, days: number, extra: Partial<CandidateRow> = {}): CandidateRow {
  return {
    contact_id: id,
    name: `Contato ${id}`,
    phone: '+5511999990000',
    company: null,
    do_not_contact: false,
    last_inbound_at: ago(days),
    tag_ids: [],
    has_active_enrollment: false,
    last_enrollment_ended_at: null,
    last_outbound_at: null,
    ...extra,
  }
}

const ALL = { bands: ['late', 'cooling', 'gone'] as const, tagIds: [], excludeTagIds: [] }

describe('buildCandidates', () => {
  it('drops active contacts and assigns bands', () => {
    const out = buildCandidates(
      [row('a', 10), row('b', 35), row('c', 70), row('d', 130)],
      settings,
      { ...ALL, bands: [...ALL.bands] },
      NOW,
    )
    expect(out.map((c) => [c.contact_id, c.band])).toEqual([
      ['d', 'gone'],
      ['c', 'cooling'],
      ['b', 'late'],
    ])
  })

  it('keeps do_not_contact contacts but marks the exclusion', () => {
    const out = buildCandidates([row('a', 40, { do_not_contact: true })], settings, {
      ...ALL,
      bands: [...ALL.bands],
    }, NOW)
    expect(out).toHaveLength(1)
    expect(out[0].exclusion).toBe('do_not_contact')
  })

  it('filters by band, tag and excluded tag', () => {
    const rows = [
      row('a', 40, { tag_ids: ['vip'] }),
      row('b', 40, { tag_ids: ['vip', 'bloq'] }),
      row('c', 40),
      row('d', 70, { tag_ids: ['vip'] }),
    ]
    const out = buildCandidates(
      rows,
      settings,
      { bands: ['late'], tagIds: ['vip'], excludeTagIds: ['bloq'] },
      NOW,
    )
    expect(out.map((c) => c.contact_id)).toEqual(['a'])
  })

  it('marks removed contacts', () => {
    const out = buildCandidates([row('a', 40)], settings, { ...ALL, bands: [...ALL.bands] }, NOW, [
      'a',
    ])
    expect(out[0].exclusion).toBe('removed')
  })
})

describe('planEnrollments', () => {
  it('splits eligible and removed, ignoring other exclusions', () => {
    const cands = buildCandidates(
      [row('a', 40), row('b', 40), row('c', 40, { do_not_contact: true })],
      settings,
      { ...ALL, bands: [...ALL.bands] },
      NOW,
      ['b'],
    )
    expect(planEnrollments(cands)).toEqual({ enroll: ['a'], removed: ['b'], excluded: 1 })
  })
})

describe('assertDraft', () => {
  it('throws 409 when the campaign is not a draft', () => {
    expect(() => assertDraft('active')).toThrow(ReactivationError)
    try {
      assertDraft('active')
    } catch (e) {
      expect((e as ReactivationError).status).toBe(409)
    }
    expect(() => assertDraft('draft')).not.toThrow()
  })
})

function tpl(over: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    id: 't1',
    user_id: 'u',
    name: 'volta',
    category: 'Marketing',
    language: 'pt_BR',
    body_text: 'Oi {{1}}, sentimos sua falta na {{2}}!',
    status: 'APPROVED',
    created_at: '',
    ...over,
  }
}

const step = (over: Partial<ReactivationStep> = {}): ReactivationStep => ({
  template_id: 't1',
  params: [{ source: 'first_name' }, { source: 'fixed', value: 'Loja' }],
  wait_days: 3,
  ...over,
})

describe('countBodyVariables', () => {
  it('counts distinct {{n}} placeholders', () => {
    expect(countBodyVariables('Oi {{1}}, {{2}} e {{1}}')).toBe(2)
    expect(countBodyVariables('sem variáveis')).toBe(0)
  })
})

describe('validateCampaignSteps', () => {
  it('accepts a valid single step', () => {
    expect(validateCampaignSteps([step()], [tpl()])).toBeNull()
  })
  it('rejects zero or more than 3 steps', () => {
    expect(validateCampaignSteps([], [tpl()])).toMatch(/1 a 3/)
    expect(validateCampaignSteps([step(), step(), step(), step()], [tpl()])).toMatch(/1 a 3/)
  })
  it('rejects a template that is not approved', () => {
    expect(validateCampaignSteps([step()], [tpl({ status: 'PENDING' })])).toMatch(/aprovado/)
  })
  it('rejects templates with a media header', () => {
    expect(validateCampaignSteps([step()], [tpl({ header_type: 'image' })])).toMatch(/cabeçalho/)
  })
  it('rejects templates with a text header variable', () => {
    expect(
      validateCampaignSteps([step()], [tpl({ header_type: 'text', header_content: 'Oi {{1}}' })]),
    ).toMatch(/cabeçalho/)
  })
  it('rejects unknown templates', () => {
    expect(validateCampaignSteps([step({ template_id: 'x' })], [tpl()])).toMatch(/não encontrado/)
  })
  it('rejects params that do not match the variables', () => {
    expect(validateCampaignSteps([step({ params: [{ source: 'name' }] })], [tpl()])).toMatch(
      /variáveis/,
    )
  })
  it('rejects wait_days outside 1-30', () => {
    expect(validateCampaignSteps([step({ wait_days: 0 })], [tpl()])).toMatch(/1 e 30/)
    expect(validateCampaignSteps([step({ wait_days: 31 })], [tpl()])).toMatch(/1 e 30/)
  })
})

// ------------------------------------------------------------
// approveCampaign ordering (review finding: race with finishIdleCampaigns)
// ------------------------------------------------------------

type Op = { table: string; op: string; payload?: unknown }

/** Thenable query builder that records writes and answers reads per table. */
function recordingDb(answers: Record<string, unknown>, rpcRows: unknown[]) {
  const ops: Op[] = []
  const db = {
    rpc: async () => ({ data: rpcRows, error: null }),
    from(table: string) {
      let op = 'select'
      let payload: unknown
      const result = () => {
        if (op !== 'select') return { data: op === 'update' ? { id: 'x' } : null, error: null }
        return { data: answers[table] ?? null, error: null }
      }
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b
      for (const m of ['insert', 'update', 'upsert', 'delete']) {
        b[m] = (p: unknown) => {
          op = m
          payload = p
          ops.push({ table, op: m, payload })
          return b
        }
      }
      b.maybeSingle = async () => result()
      b.single = async () => result()
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        const r = result()
        const data = op === 'select' && !Array.isArray(r.data) && r.data ? [r.data] : r.data
        return Promise.resolve({ ...r, data }).then(res, rej)
      }
      return b
    },
  }
  return { db: db as unknown as import('@supabase/supabase-js').SupabaseClient, ops }
}

describe('approveCampaign', () => {
  it('inserts enrollments before flipping the campaign to active', async () => {
    const campaign = {
      id: 'camp',
      account_id: 'a',
      status: 'draft',
      bands: ['late', 'cooling', 'gone'],
      tag_ids: [],
      exclude_tag_ids: [],
      steps: [step()],
    }
    const { db, ops } = recordingDb(
      { reactivation_campaigns: campaign, message_templates: [tpl()], reactivation_settings: null },
      [row('c1', 40)],
    )
    await approveCampaign(db, 'a', 'camp', 'u', [], NOW)
    const insertIdx = ops.findIndex(
      (o) => o.table === 'reactivation_enrollments' && (o.op === 'insert' || o.op === 'upsert'),
    )
    const activateIdx = ops.findIndex(
      (o) =>
        o.table === 'reactivation_campaigns' &&
        o.op === 'update' &&
        (o.payload as { status?: string }).status === 'active',
    )
    expect(insertIdx).toBeGreaterThanOrEqual(0)
    expect(activateIdx).toBeGreaterThan(insertIdx)
  })
})
