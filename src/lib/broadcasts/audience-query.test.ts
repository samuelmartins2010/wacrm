import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchBroadcastRecipients,
  findContactsByPhones,
  resolveAudienceContacts,
} from './audience-query'

// O PostgREST do Supabase corta toda resposta em 1.000 linhas (max_rows)
// sem dar erro, e uma lista muito grande no filtro `in` estoura a URL.
// Este banco falso imita as duas coisas para provar que o envio de uma
// transmissão lê o público inteiro, e não só as primeiras 1.000 linhas.

const MAX_ROWS = 1000
const MAX_IN = 500

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>) {
  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    let cols = '*'
    let orderBy: string | null = null
    let range: [number, number] | null = null
    const q = {
      select(c: string) {
        cols = c
        return q
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v)
        return q
      },
      neq(col: string, v: unknown) {
        filters.push((r) => r[col] !== v)
        return q
      },
      ilike(col: string, pattern: string) {
        const needle = pattern.replaceAll('%', '').toLowerCase()
        filters.push((r) => String(r[col] ?? '').toLowerCase().includes(needle))
        return q
      },
      in(col: string, values: unknown[]) {
        if (values.length > MAX_IN) throw new Error(`URL longa demais: in() com ${values.length} valores`)
        const set = new Set(values)
        filters.push((r) => set.has(r[col]))
        return q
      },
      order(col: string) {
        orderBy = col
        return q
      },
      range(from: number, to: number) {
        range = [from, to]
        return q
      },
      then<T>(resolve: (v: { data: Row[]; error: null }) => T) {
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
        if (orderBy) {
          const k = orderBy
          rows = [...rows].sort((a, b) => String(a[k]).localeCompare(String(b[k])))
        }
        if (range) rows = rows.slice(range[0], range[1] + 1)
        rows = rows.slice(0, MAX_ROWS)
        if (cols.includes('contact:contacts(*)')) {
          const contacts = new Map((tables.contacts ?? []).map((c) => [c.id, c]))
          rows = rows.map((r) => ({ ...r, contact: contacts.get(r.contact_id) ?? null }))
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      },
    }
    return q
  }
  return { from: builder } as unknown as SupabaseClient
}

const pad = (n: number) => String(n).padStart(5, '0')
const contact = (n: number) => ({
  id: `c-${pad(n)}`,
  phone: `+55119${pad(n)}0000`,
  name: `Contato ${n}`,
  user_id: 'u1',
})

const contacts = Array.from({ length: 1205 }, (_, i) => contact(i))

describe('resolveAudienceContacts com mais de 1.000 contatos', () => {
  it('"Todos os contatos" traz todos, não só os primeiros 1.000', async () => {
    const db = fakeDb({ contacts })
    const out = await resolveAudienceContacts(db, { type: 'all' })
    expect(out).toHaveLength(1205)
  })

  it('por etiqueta traz todos os etiquetados e tira todos os da etiqueta excluída', async () => {
    const contact_tags = [
      ...contacts.slice(0, 1100).map((c) => ({ contact_id: c.id, tag_id: 'vip' })),
      ...contacts.slice(0, 1050).map((c) => ({ contact_id: c.id, tag_id: 'sair' })),
    ]
    const db = fakeDb({ contacts, contact_tags })
    expect(await resolveAudienceContacts(db, { type: 'tags', tagIds: ['vip'] })).toHaveLength(1100)
    const semSair = await resolveAudienceContacts(db, {
      type: 'tags',
      tagIds: ['vip'],
      excludeTagIds: ['sair'],
    })
    expect(semSair).toHaveLength(50)
  })

  it('"Todos" menos uma etiqueta com mais de 1.000 contatos', async () => {
    const contact_tags = contacts.slice(0, 1150).map((c) => ({ contact_id: c.id, tag_id: 'sair' }))
    const db = fakeDb({ contacts, contact_tags })
    const out = await resolveAudienceContacts(db, { type: 'all', excludeTagIds: ['sair'] })
    expect(out).toHaveLength(55)
  })

  it('por campo personalizado traz todos os que batem', async () => {
    const contact_custom_values = contacts.map((c, i) => ({
      contact_id: c.id,
      custom_field_id: 'cidade',
      value: i < 1180 ? 'São Paulo' : 'Rio',
    }))
    const db = fakeDb({ contacts, contact_custom_values })
    const out = await resolveAudienceContacts(db, {
      type: 'custom_field',
      customField: { fieldId: 'cidade', operator: 'is', value: 'São Paulo' },
    })
    expect(out).toHaveLength(1180)
  })
})

describe('findContactsByPhones (CSV)', () => {
  it('acha os contatos de um CSV com mais de 1.000 telefones', async () => {
    const db = fakeDb({ contacts })
    const out = await findContactsByPhones(db, 'u1', contacts.map((c) => c.phone))
    expect(out).toHaveLength(1205)
  })
})

describe('fetchBroadcastRecipients', () => {
  it('lê todos os destinatários com o contato junto, não só os primeiros 1.000', async () => {
    const broadcast_recipients = contacts.map((c, i) => ({
      id: `r-${pad(i)}`,
      broadcast_id: 'b1',
      contact_id: c.id,
      status: 'pending',
    }))
    const db = fakeDb({ contacts, broadcast_recipients })
    const out = await fetchBroadcastRecipients(db, 'b1')
    expect(out).toHaveLength(1205)
    expect(out.every((r) => r.contact?.phone)).toBe(true)
  })
})
