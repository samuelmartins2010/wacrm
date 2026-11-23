import type { SupabaseClient } from '@supabase/supabase-js'
import type { Contact } from '@/types'
import type { AudienceFilter } from './audience-count'

/**
 * Leitura do público de uma transmissão sem perder ninguém.
 *
 * O PostgREST do Supabase corta toda resposta em 1.000 linhas (max_rows)
 * sem avisar, e um filtro `in` com milhares de valores estoura a URL.
 * Por isso toda leitura aqui é paginada (`fetchAllPages`, com ordem
 * estável) e toda busca por lista de ids/telefones vai em lotes
 * (`fetchInChunks`).
 */

export const PAGE_SIZE = 1000
export const IN_CHUNK = 200

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Lê todas as páginas. `run` deve ordenar por uma coluna única. */
export async function fetchAllPages<T>(run: (from: number, to: number) => Result<T>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return out
  }
}

/** Roda `run` em lotes de `IN_CHUNK` valores e junta os resultados. */
export async function fetchInChunks<V, T>(values: V[], run: (chunk: V[]) => Result<T>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const { data, error } = await run(values.slice(i, i + IN_CHUNK))
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
  }
  return out
}

export async function contactIdsWithTags(db: SupabaseClient, tagIds: string[]): Promise<string[]> {
  const rows = await fetchAllPages<{ contact_id: string }>((from, to) =>
    db.from('contact_tags').select('contact_id').in('tag_id', tagIds).order('contact_id').range(from, to),
  )
  return [...new Set(rows.map((r) => r.contact_id))]
}

async function contactsByIds(db: SupabaseClient, ids: string[]): Promise<Contact[]> {
  return fetchInChunks<string, Contact>(ids, (chunk) => db.from('contacts').select('*').in('id', chunk))
}

/**
 * Contatos do público (todos / etiquetas / campo personalizado), já sem
 * quem tem etiqueta excluída. O CSV é resolvido por quem chama (cria os
 * contatos que faltam) e passado em `csvContacts`; a exclusão por
 * etiqueta vale para ele também. Quem pediu para sair é filtrado no
 * servidor, em /api/whatsapp/broadcast.
 */
export async function resolveAudienceContacts(
  db: SupabaseClient,
  audience: AudienceFilter,
  csvContacts: Contact[] = [],
): Promise<Contact[]> {
  let contacts: Contact[] = []

  if (audience.type === 'all') {
    contacts = await fetchAllPages<Contact>((from, to) =>
      db.from('contacts').select('*').order('id').range(from, to),
    )
  } else if (audience.type === 'tags' && audience.tagIds?.length) {
    contacts = await contactsByIds(db, await contactIdsWithTags(db, audience.tagIds))
  } else if (audience.type === 'custom_field' && audience.customField) {
    const f = audience.customField
    const rows = await fetchAllPages<{ contact_id: string }>((from, to) => {
      let q = db.from('contact_custom_values').select('contact_id').eq('custom_field_id', f.fieldId)
      if (f.operator === 'is') q = q.eq('value', f.value)
      else if (f.operator === 'is_not') q = q.neq('value', f.value)
      else q = q.ilike('value', `%${f.value}%`)
      return q.order('contact_id').range(from, to)
    })
    contacts = await contactsByIds(db, [...new Set(rows.map((r) => r.contact_id))])
  } else if (audience.type === 'csv') {
    contacts = csvContacts
  }

  if (audience.excludeTagIds?.length) {
    const excluded = new Set(await contactIdsWithTags(db, audience.excludeTagIds))
    contacts = contacts.filter((c) => !excluded.has(c.id))
  }
  return contacts
}

/** Contatos do usuário com estes telefones exatos (CSV), em lotes. */
export async function findContactsByPhones(
  db: SupabaseClient,
  userId: string,
  phones: string[],
): Promise<Contact[]> {
  return fetchInChunks<string, Contact>(phones, (chunk) =>
    db.from('contacts').select('*').eq('user_id', userId).in('phone', chunk),
  )
}

export interface BroadcastRecipientRow {
  id: string
  broadcast_id: string
  contact_id: string | null
  status: string
  contact: Contact | null
}

/** Todos os destinatários da transmissão, com o contato junto. */
export async function fetchBroadcastRecipients(
  db: SupabaseClient,
  broadcastId: string,
): Promise<BroadcastRecipientRow[]> {
  return fetchAllPages<BroadcastRecipientRow>((from, to) =>
    db
      .from('broadcast_recipients')
      .select('*, contact:contacts(*)')
      .eq('broadcast_id', broadcastId)
      .order('id')
      .range(from, to),
  )
}
