import { describe, expect, it } from 'vitest'
import type { Conversation } from '@/types'
import { compareAwaiting, formatWait, matchesInboxFilter, waitBand } from './filters'

// Mesmas regras do banco (migration 057 / inbox_filter_counts): encerradas
// ficam fora de Minhas, Sem dono e Aguardando; Não lidas conta todas.

const ME = 'user-me'
const conv = (over: Partial<Conversation> = {}) => ({
  status: 'open' as Conversation['status'],
  assigned_agent_id: undefined as string | undefined,
  awaiting_since: null as string | null,
  unread_count: 0,
  ...over,
})

describe('matchesInboxFilter', () => {
  it('Minhas: só as abertas em que eu sou o responsável', () => {
    expect(matchesInboxFilter(conv({ assigned_agent_id: ME }), 'mine', ME)).toBe(true)
    expect(matchesInboxFilter(conv({ assigned_agent_id: ME, status: 'closed' }), 'mine', ME)).toBe(false)
    expect(matchesInboxFilter(conv({ assigned_agent_id: 'outro' }), 'mine', ME)).toBe(false)
  })

  it('Sem dono: sem responsável e não encerrada', () => {
    expect(matchesInboxFilter(conv({ status: 'pending' }), 'unassigned', ME)).toBe(true)
    expect(matchesInboxFilter(conv({ assigned_agent_id: null as unknown as string }), 'unassigned', ME)).toBe(true)
    expect(matchesInboxFilter(conv({ status: 'closed' }), 'unassigned', ME)).toBe(false)
    expect(matchesInboxFilter(conv({ assigned_agent_id: ME }), 'unassigned', ME)).toBe(false)
  })

  it('Aguardando: com espera e não encerrada', () => {
    const at = '2026-11-19T10:00:00Z'
    expect(matchesInboxFilter(conv({ awaiting_since: at }), 'awaiting', ME)).toBe(true)
    expect(matchesInboxFilter(conv({ awaiting_since: null }), 'awaiting', ME)).toBe(false)
    expect(matchesInboxFilter(conv({ awaiting_since: at, status: 'closed' }), 'awaiting', ME)).toBe(false)
  })

  it('Não lidas: conta mesmo encerrada', () => {
    expect(matchesInboxFilter(conv({ unread_count: 2, status: 'closed' }), 'unread', ME)).toBe(true)
    expect(matchesInboxFilter(conv({ unread_count: 0 }), 'unread', ME)).toBe(false)
  })

  it('Todas: qualquer conversa', () => {
    expect(matchesInboxFilter(conv({ status: 'closed' }), 'all', ME)).toBe(true)
  })

  it('conversa que recebe resposta em outra aba sai de Aguardando (evento de tempo real)', () => {
    const antes = conv({ awaiting_since: '2026-11-19T10:00:00Z' })
    const depois = { ...antes, awaiting_since: null }
    expect(matchesInboxFilter(antes, 'awaiting', ME)).toBe(true)
    expect(matchesInboxFilter(depois, 'awaiting', ME)).toBe(false)
  })
})

const since = '2026-11-19T10:00:00Z'
const after = (ms: number) => new Date(Date.parse(since) + ms)
const MIN = 60_000

describe('waitBand', () => {
  it('limites: < 15 min neutro, 15 a 60 min amarelo, >= 60 min vermelho', () => {
    expect(waitBand(since, after(15 * MIN - 1000))).toBe('neutral')
    expect(waitBand(since, after(15 * MIN))).toBe('warning')
    expect(waitBand(since, after(60 * MIN - 1000))).toBe('warning')
    expect(waitBand(since, after(60 * MIN))).toBe('danger')
  })

  it('relógio do navegador atrasado (espera no futuro) fica neutro', () => {
    expect(waitBand(since, after(-2 * MIN))).toBe('neutral')
  })
})

describe('formatWait', () => {
  const t = (key: string, values?: Record<string, number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key

  it('menos de 1 min e espera no futuro mostram "agora"', () => {
    expect(formatWait(since, after(30_000), t)).toBe('Inbox.wait.now')
    expect(formatWait(since, after(-2 * MIN), t)).toBe('Inbox.wait.now')
  })

  it('minutos, horas (para baixo) e dias', () => {
    expect(formatWait(since, after(3 * MIN), t)).toBe('Inbox.wait.minutes:{"n":3}')
    expect(formatWait(since, after(130 * MIN), t)).toBe('Inbox.wait.hours:{"n":2}')
    expect(formatWait(since, after(26 * 60 * MIN), t)).toBe('Inbox.wait.days:{"n":1}')
  })
})

describe('compareAwaiting', () => {
  it('mais antiga primeiro, sem espera por último', () => {
    const list = [
      { id: 'b', awaiting_since: '2026-11-19T10:05:00Z' },
      { id: 'n', awaiting_since: null },
      { id: 'a', awaiting_since: '2026-11-19T09:00:00Z' },
    ] as Conversation[]
    expect([...list].sort(compareAwaiting).map((c) => c.id)).toEqual(['a', 'b', 'n'])
  })
})
