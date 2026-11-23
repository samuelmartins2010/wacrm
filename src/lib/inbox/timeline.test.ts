import { describe, expect, it } from 'vitest'
import type { ConversationEvent, Message } from '@/types'
import { mergeTimeline } from './timeline'

const msg = (id: string, at: string) => ({ id, created_at: at }) as Message
const ev = (id: string, at: string, over: Partial<ConversationEvent> = {}) =>
  ({
    id,
    created_at: at,
    type: 'note',
    actor_kind: 'user',
    note_id: null,
    ...over,
  }) as ConversationEvent

const keys = (items: ReturnType<typeof mergeTimeline>) =>
  items.map((i) => (i.kind === 'message' ? `m:${i.message.id}` : `e:${i.event.id}`))

describe('mergeTimeline', () => {
  it('ordena mensagens e eventos pela hora', () => {
    expect(
      keys(
        mergeTimeline(
          [msg('m1', '2026-11-21T10:00:00Z'), msg('m2', '2026-11-21T10:05:00Z')],
          [ev('n1', '2026-11-21T10:02:00Z')],
        ),
      ),
    ).toEqual(['m:m1', 'e:n1', 'm:m2'])
  })

  it('no empate, a mensagem vem antes do evento', () => {
    const at = '2026-11-21T10:00:00Z'
    expect(keys(mergeTimeline([msg('m1', at)], [ev('n1', at)]))).toEqual(['m:m1', 'e:n1'])
  })

  it('a observação de uma transferência vem logo depois da linha de troca, mesmo gravada antes', () => {
    const at = '2026-11-21T10:00:00Z'
    const items = mergeTimeline(
      [msg('m1', '2026-11-21T09:59:00Z')],
      [
        ev('obs', at), // a nota nasce primeiro na transação
        ev('n-solta', '2026-11-21T09:58:00Z'),
        ev('troca', at, { type: 'transferred', note_id: 'obs' }),
      ],
    )
    expect(keys(items)).toEqual(['e:n-solta', 'm:m1', 'e:troca', 'e:obs'])
  })

  it('não duplica evento recebido duas vezes (carga + tempo real)', () => {
    const e = ev('n1', '2026-11-21T10:00:00Z')
    expect(keys(mergeTimeline([], [e, { ...e }]))).toEqual(['e:n1'])
  })

  it('observação cuja linha de troca não chegou ainda aparece sozinha, na sua hora', () => {
    expect(keys(mergeTimeline([], [ev('obs', '2026-11-21T10:00:00Z')]))).toEqual(['e:obs'])
  })
})
