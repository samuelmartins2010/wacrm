// ============================================================
// Reativação — consultas e regras de gestão de campanha.
// A parte pura (buildCandidates, planEnrollments, validações) é
// testada; as funções com I/O são finas em volta dela.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MessageTemplate,
  ReactivationBand,
  ReactivationCampaign,
  ReactivationCampaignStatus,
  ReactivationSettings,
  ReactivationStep,
} from '@/types'
import { bandForDays, daysSince, exclusionFor, type ExclusionReason } from './rules'

export class ReactivationError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ReactivationError'
    this.status = status
  }
}

export interface CandidateRow {
  contact_id: string
  name: string | null
  phone: string | null
  company: string | null
  do_not_contact: boolean
  last_inbound_at: string
  tag_ids: string[]
  has_active_enrollment: boolean
  last_enrollment_ended_at: string | null
  last_outbound_at: string | null
}

export interface Candidate {
  contact_id: string
  name: string | null
  phone: string | null
  company: string | null
  days: number
  band: ReactivationBand
  tag_ids: string[]
  exclusion: ExclusionReason | null
}

export interface CandidateFilters {
  bands: ReactivationBand[]
  tagIds: string[]
  excludeTagIds: string[]
}

export const DEFAULT_SETTINGS: Omit<ReactivationSettings, 'account_id'> = {
  band_late_days: 30,
  band_cooling_days: 60,
  band_gone_days: 120,
  rest_days: 60,
  recent_outbound_days: 7,
  daily_limit: 50,
  send_window: { mon_fri: [9, 19], sat: [9, 13], sun: null },
  optout_keywords: ['SAIR', 'PARAR', 'STOP'],
  optout_reply: 'Pronto, você não vai mais receber nossas mensagens de campanha.',
}

/** Inactive contacts matching the filters, most inactive first. */
export function buildCandidates(
  rows: CandidateRow[],
  s: ReactivationSettings,
  f: CandidateFilters,
  now: Date,
  removedIds: string[] = [],
): Candidate[] {
  const removed = new Set(removedIds)
  const thresholds = { late: s.band_late_days, cooling: s.band_cooling_days, gone: s.band_gone_days }
  const out: Candidate[] = []
  for (const r of rows) {
    const days = daysSince(r.last_inbound_at, now)
    const band = bandForDays(days, thresholds)
    if (!band || !f.bands.includes(band)) continue
    if (f.tagIds.length && !f.tagIds.some((t) => r.tag_ids.includes(t))) continue
    if (f.excludeTagIds.some((t) => r.tag_ids.includes(t))) continue
    out.push({
      contact_id: r.contact_id,
      name: r.name,
      phone: r.phone,
      company: r.company,
      days,
      band,
      tag_ids: r.tag_ids,
      exclusion: exclusionFor({ ...r, removed: removed.has(r.contact_id) }, s, now),
    })
  }
  return out.sort((a, b) => b.days - a.days)
}

export function planEnrollments(c: Candidate[]): {
  enroll: string[]
  removed: string[]
  excluded: number
} {
  const enroll: string[] = []
  const removed: string[] = []
  let excluded = 0
  for (const x of c) {
    if (x.exclusion === null) enroll.push(x.contact_id)
    else if (x.exclusion === 'removed') removed.push(x.contact_id)
    else excluded++
  }
  return { enroll, removed, excluded }
}

export function assertDraft(status: ReactivationCampaignStatus): void {
  if (status !== 'draft') {
    throw new ReactivationError('Só é possível alterar campanhas em rascunho.', 409)
  }
}

export function countBodyVariables(body: string): number {
  return new Set(Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (m) => m[1])).size
}

/** Templates usable by reactivation: approved, body-only variables. */
export function isUsableTemplate(t: MessageTemplate): boolean {
  if (t.status !== 'APPROVED') return false
  if (t.header_type && t.header_type !== 'text') return false
  if (t.header_type === 'text' && /\{\{\s*\d+\s*\}\}/.test(t.header_content ?? '')) return false
  return true
}

/** Returns a PT-BR error message, or null when valid. */
export function validateCampaignSteps(
  steps: ReactivationStep[],
  templates: MessageTemplate[],
): string | null {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 3) {
    return 'A campanha precisa ter de 1 a 3 toques.'
  }
  for (const [i, s] of steps.entries()) {
    const n = i + 1
    const t = templates.find((x) => x.id === s.template_id)
    if (!t) return `Toque ${n}: template não encontrado.`
    if (t.status !== 'APPROVED') return `Toque ${n}: o template precisa estar aprovado pela Meta.`
    if (!isUsableTemplate(t)) {
      return `Toque ${n}: templates com cabeçalho de mídia ou variável no cabeçalho não são suportados.`
    }
    if (!Array.isArray(s.params) || s.params.length !== countBodyVariables(t.body_text)) {
      return `Toque ${n}: preencha todas as variáveis do template.`
    }
    if (s.params.some((p) => p.source === 'fixed' && !p.value?.trim())) {
      return `Toque ${n}: preencha todas as variáveis do template.`
    }
    if (!Number.isInteger(s.wait_days) || s.wait_days < 1 || s.wait_days > 30) {
      return `Toque ${n}: o intervalo deve ficar entre 1 e 30 dias.`
    }
  }
  return null
}

// ------------------------------------------------------------
// I/O
// ------------------------------------------------------------

export async function getSettings(
  db: SupabaseClient,
  accountId: string,
): Promise<ReactivationSettings> {
  const { data, error } = await db
    .from('reactivation_settings')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) throw new ReactivationError(error.message, 500)
  if (data) return data as ReactivationSettings
  return { account_id: accountId, ...DEFAULT_SETTINGS }
}

export async function fetchCandidateRows(
  db: SupabaseClient,
  accountId: string,
): Promise<CandidateRow[]> {
  const { data, error } = await db.rpc('reactivation_candidates', { p_account_id: accountId })
  if (error) throw new ReactivationError(error.message, 500)
  return (data ?? []) as CandidateRow[]
}

export async function loadCandidates(
  db: SupabaseClient,
  accountId: string,
  f: CandidateFilters,
  now: Date,
  removedIds: string[] = [],
): Promise<Candidate[]> {
  const [settings, rows] = await Promise.all([
    getSettings(db, accountId),
    fetchCandidateRows(db, accountId),
  ])
  return buildCandidates(rows, settings, f, now, removedIds)
}

export function campaignFilters(c: Pick<ReactivationCampaign, 'bands' | 'tag_ids' | 'exclude_tag_ids'>): CandidateFilters {
  return { bands: c.bands, tagIds: c.tag_ids, excludeTagIds: c.exclude_tag_ids }
}

export async function getCampaign(
  db: SupabaseClient,
  accountId: string,
  id: string,
): Promise<ReactivationCampaign> {
  const { data, error } = await db
    .from('reactivation_campaigns')
    .select('*')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) throw new ReactivationError(error.message, 500)
  if (!data) throw new ReactivationError('Campanha não encontrada.', 404)
  return data as ReactivationCampaign
}

export async function loadAccountTemplates(
  db: SupabaseClient,
  accountId: string,
): Promise<MessageTemplate[]> {
  const { data, error } = await db.from('message_templates').select('*').eq('account_id', accountId)
  if (error) throw new ReactivationError(error.message, 500)
  return (data ?? []) as MessageTemplate[]
}

/** Freeze the audience and start sending. `admin` = service-role client. */
export async function approveCampaign(
  admin: SupabaseClient,
  accountId: string,
  campaignId: string,
  userId: string,
  removedIds: string[],
  now: Date,
): Promise<{ enrolled: number; excluded: number }> {
  const campaign = await getCampaign(admin, accountId, campaignId)
  assertDraft(campaign.status)
  const templates = await loadAccountTemplates(admin, accountId)
  const invalid = validateCampaignSteps(campaign.steps, templates)
  if (invalid) throw new ReactivationError(invalid, 400)

  const cands = await loadCandidates(admin, accountId, campaignFilters(campaign), now, removedIds)
  const plan = planEnrollments(cands)
  if (plan.enroll.length === 0) {
    throw new ReactivationError('Nenhum contato elegível para esta campanha.', 400)
  }

  // Enrollments go in while the campaign is still a draft: the runner and
  // finishIdleCampaigns only look at active campaigns, so flipping to
  // active last means the cron can never see an active campaign with no
  // enrollments yet. Upsert-ignore makes a double click harmless.
  const iso = now.toISOString()
  const rows = [
    ...plan.enroll.map((contact_id) => ({
      account_id: accountId,
      campaign_id: campaignId,
      contact_id,
      status: 'pending',
      next_run_at: iso,
    })),
    ...plan.removed.map((contact_id) => ({
      account_id: accountId,
      campaign_id: campaignId,
      contact_id,
      status: 'removed',
      ended_at: iso,
      end_reason: 'removed_on_review',
    })),
  ]
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from('reactivation_enrollments')
      .upsert(rows.slice(i, i + 500), { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
    if (error) throw new ReactivationError(error.message, 500)
  }

  const { data: activated, error: actErr } = await admin
    .from('reactivation_campaigns')
    .update({
      status: 'active',
      approved_by: userId,
      approved_at: iso,
      updated_at: iso,
    })
    .eq('id', campaignId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()
  if (actErr) throw new ReactivationError(actErr.message, 500)
  if (!activated) throw new ReactivationError('Só é possível alterar campanhas em rascunho.', 409)
  return { enrolled: plan.enroll.length, excluded: plan.excluded }
}

export type CampaignAction = 'pause' | 'resume' | 'finish'

const ALLOWED: Record<CampaignAction, ReactivationCampaignStatus[]> = {
  pause: ['active'],
  resume: ['paused'],
  finish: ['active', 'paused'],
}

export async function setCampaignState(
  admin: SupabaseClient,
  accountId: string,
  id: string,
  action: CampaignAction,
  now: Date,
): Promise<void> {
  const campaign = await getCampaign(admin, accountId, id)
  if (!ALLOWED[action].includes(campaign.status)) {
    throw new ReactivationError('Ação não permitida no status atual da campanha.', 409)
  }
  const iso = now.toISOString()
  const patch =
    action === 'pause'
      ? { status: 'paused', updated_at: iso }
      : action === 'resume'
        ? { status: 'active', pause_reason: null, updated_at: iso }
        : { status: 'finished', finished_at: iso, updated_at: iso }
  const { error } = await admin
    .from('reactivation_campaigns')
    .update(patch)
    .eq('id', id)
    .eq('account_id', accountId)
  if (error) throw new ReactivationError(error.message, 500)

  if (action === 'finish') {
    const { error: e2 } = await admin
      .from('reactivation_enrollments')
      .update({ status: 'cancelled', ended_at: iso, end_reason: 'campaign_finished', updated_at: iso })
      .eq('campaign_id', id)
      .in('status', ['pending', 'active'])
    if (e2) throw new ReactivationError(e2.message, 500)
  }
}
