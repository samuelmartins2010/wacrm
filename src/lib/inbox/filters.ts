import type { Conversation } from '@/types'

/**
 * Regras dos filtros rápidos do Inbox e do tempo de espera.
 *
 * São as mesmas do banco (migration 057, `inbox_filter_counts`): a lista
 * busca já filtrada no banco, e estas funções decidem, a cada evento de
 * tempo real, se a conversa entra, fica ou sai da lista aberta.
 *  - Minhas / Sem dono / Aguardando: só conversas não encerradas.
 *  - Não lidas: qualquer status (igual ao filtro de hoje).
 */

export type InboxQuickFilter = 'all' | 'mine' | 'unassigned' | 'awaiting' | 'unread'

type FilterFields = Pick<Conversation, 'status' | 'assigned_agent_id' | 'awaiting_since' | 'unread_count'>

export function matchesInboxFilter(c: FilterFields, filter: InboxQuickFilter, userId: string): boolean {
  const open = c.status !== 'closed'
  switch (filter) {
    case 'all':
      return true
    case 'mine':
      return open && !!c.assigned_agent_id && c.assigned_agent_id === userId
    case 'unassigned':
      return open && !c.assigned_agent_id
    case 'awaiting':
      return open && !!c.awaiting_since
    case 'unread':
      return (c.unread_count ?? 0) > 0
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Tempo de espera em ms; nunca negativo (relógio do navegador atrasado conta como 0). */
function elapsed(awaitingSince: string, now: Date): number {
  const ms = now.getTime() - Date.parse(awaitingSince)
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

/** Cor da espera: < 15 min neutro · 15 min a < 1 h amarelo · >= 1 h vermelho. */
export function waitBand(awaitingSince: string, now: Date): 'neutral' | 'warning' | 'danger' {
  const ms = elapsed(awaitingSince, now)
  if (ms >= HOUR) return 'danger'
  if (ms >= 15 * MINUTE) return 'warning'
  return 'neutral'
}

/** Texto curto da espera ("agora", "3 min", "2 h", "1 d"), arredondando para baixo. */
export function formatWait(
  awaitingSince: string,
  now: Date,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const ms = elapsed(awaitingSince, now)
  if (ms < MINUTE) return t('Inbox.wait.now')
  if (ms < HOUR) return t('Inbox.wait.minutes', { n: Math.floor(ms / MINUTE) })
  if (ms < DAY) return t('Inbox.wait.hours', { n: Math.floor(ms / HOUR) })
  return t('Inbox.wait.days', { n: Math.floor(ms / DAY) })
}

/** Quem espera há mais tempo primeiro; conversas sem espera por último. */
export function compareAwaiting(
  a: Pick<Conversation, 'awaiting_since'>,
  b: Pick<Conversation, 'awaiting_since'>,
): number {
  const ta = a.awaiting_since ? Date.parse(a.awaiting_since) : Infinity
  const tb = b.awaiting_since ? Date.parse(b.awaiting_since) : Infinity
  if (ta === tb) return 0
  return ta < tb ? -1 : 1
}

/** O mínimo do query builder do Supabase que o filtro usa. */
interface FilterableQuery<Q> {
  eq(column: string, value: unknown): Q
  is(column: string, value: null): Q
  neq(column: string, value: unknown): Q
  not(column: string, operator: string, value: unknown): Q
  gt(column: string, value: unknown): Q
  order(column: string, options: { ascending: boolean }): Q
}

/**
 * Aplica o filtro rápido na consulta de conversas (o Inbox lê no máximo
 * 1.000 por vez, então o filtro precisa rodar no banco). Mesmas regras de
 * `matchesInboxFilter` e de `inbox_filter_counts`.
 */
export function applyQuickFilter<Q extends FilterableQuery<Q>>(q: Q, filter: InboxQuickFilter, userId: string): Q {
  switch (filter) {
    case 'all':
      return q
    case 'mine':
      return q.eq('assigned_agent_id', userId).neq('status', 'closed')
    case 'unassigned':
      return q.is('assigned_agent_id', null).neq('status', 'closed')
    case 'awaiting':
      return q.not('awaiting_since', 'is', null).neq('status', 'closed').order('awaiting_since', { ascending: true })
    case 'unread':
      return q.gt('unread_count', 0)
  }
}
