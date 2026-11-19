import { describe, expect, it } from 'vitest'
import { countAudience, csvAudienceContacts } from './audience-count'
import { optOutPhoneKeys } from '@/lib/reactivation/opt-out'

// Mesma regra do envio (broadcast-core → partitionBroadcastRecipients):
// sai quem está marcado como "não contatar" (pelo id) OU tem o mesmo
// telefone, em qualquer forma, de um contato marcado; e sai quem tem
// alguma etiqueta excluída.

const ana = { id: 'a', phone: '+5511990000001' }
const bruno = { id: 'b', phone: '+5511990000002' } // pediu para sair
const carla = { id: 'c', phone: '+5511990000003' } // etiqueta excluída
const diego = { id: 'd', phone: '+5511990000004' }

const optedOut = { ids: new Set(['b']), keys: optOutPhoneKeys([bruno.phone]) }

describe('countAudience', () => {
  it('desconta quem pediu para sair e quem tem etiqueta excluída (público por etiqueta)', () => {
    expect(
      countAudience({
        contacts: [ana, bruno, carla, diego],
        excludedContactIds: new Set(['c']),
        optedOut,
      }),
    ).toBe(2)
  })

  it('não desconta duas vezes quem pediu para sair E tem etiqueta excluída', () => {
    expect(
      countAudience({
        contacts: [ana, bruno, carla],
        excludedContactIds: new Set(['b', 'c']),
        optedOut,
      }),
    ).toBe(1)
  })

  it('desconta outro contato com o mesmo número (sem o 9) de quem saiu', () => {
    const brunoSem9 = { id: 'b2', phone: '+551190000002' }
    expect(
      countAudience({ contacts: [ana, brunoSem9], excludedContactIds: new Set(), optedOut }),
    ).toBe(1)
  })

  it('conta cada contato uma vez (mesmo contato em duas etiquetas)', () => {
    expect(
      countAudience({ contacts: [ana, ana, diego], excludedContactIds: new Set(), optedOut }),
    ).toBe(2)
  })

  it('aceita contato sem telefone (só a checagem por id vale)', () => {
    expect(
      countAudience({
        contacts: [{ id: 'x', phone: null }, { id: 'b', phone: null }],
        excludedContactIds: new Set(),
        optedOut,
      }),
    ).toBe(1)
  })
})

describe('csvAudienceContacts', () => {
  it('liga cada telefone do CSV ao contato existente e remove telefones repetidos', () => {
    const rows = [{ phone: ana.phone }, { phone: bruno.phone }, { phone: ana.phone }, { phone: '+5511990000099' }]
    const existing = [ana, bruno]
    expect(csvAudienceContacts(rows, existing)).toEqual([
      { id: 'a', phone: ana.phone },
      { id: 'b', phone: bruno.phone },
      { id: null, phone: '+5511990000099' },
    ])
  })

  it('no CSV, quem pediu para sair e quem tem etiqueta excluída também saem da contagem', () => {
    const rows = [{ phone: ana.phone }, { phone: bruno.phone }, { phone: carla.phone }, { phone: '+5511990000099' }]
    const contacts = csvAudienceContacts(rows, [ana, bruno, carla])
    expect(countAudience({ contacts, excludedContactIds: new Set(['c']), optedOut })).toBe(2)
  })
})
