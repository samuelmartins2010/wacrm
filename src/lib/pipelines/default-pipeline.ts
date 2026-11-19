/**
 * The pipeline every new account gets on its first visit to /pipelines.
 * Names come from next-intl (Pipelines.defaultPipeline) so the seed is
 * written in the language the account is using — once written they are
 * ordinary data the user can rename.
 */
export const DEFAULT_STAGE_KEYS = [
  { key: 'newLead', color: '#3b82f6' }, // blue
  { key: 'qualified', color: '#eab308' }, // yellow
  { key: 'proposalSent', color: '#f97316' }, // orange
  { key: 'negotiation', color: '#8b5cf6' }, // purple
  { key: 'won', color: '#22c55e' }, // green
] as const

export function defaultPipelineSeed(t: (key: string) => string) {
  return {
    name: t('name'),
    stages: DEFAULT_STAGE_KEYS.map((s, position) => ({ name: t(`stages.${s.key}`), color: s.color, position })),
  }
}

/** Deal card date ("18 de nov. de 2026" / "Nov 18, 2026"). */
export function formatDealDate(locale: string, iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso))
}
