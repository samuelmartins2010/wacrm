import type { SupabaseClient } from '@supabase/supabase-js'
import { isOptedOutPhone, optOutPhoneKeys } from '@/lib/reactivation/opt-out'

/**
 * Estimativa do público de uma transmissão, usada nos passos 2 e 4 do
 * assistente. Segue a mesma regra do envio (`broadcast-core` →
 * `partitionBroadcastRecipients`) para os dois passos mostrarem o mesmo
 * número e esse número bater com quem recebe:
 *  - cada contato conta uma vez;
 *  - sai quem tem alguma etiqueta excluída;
 *  - sai quem pediu para sair (`do_not_contact`), pelo id do contato OU
 *    por ter o mesmo telefone, em qualquer forma, de um contato que saiu.
 */

export interface AudienceContact {
  /** null = telefone do CSV que ainda não é contato. */
  id: string | null
  phone: string | null
}

export interface OptedOut {
  ids: Set<string>
  keys: Set<string>
}

export function countAudience(args: {
  contacts: AudienceContact[]
  excludedContactIds: Set<string>
  optedOut: OptedOut
}): number {
  const { contacts, excludedContactIds, optedOut } = args
  const seen = new Set<string>()
  let count = 0
  for (const c of contacts) {
    const key = c.id ?? (c.phone ? `phone:${c.phone}` : null)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (c.id && excludedContactIds.has(c.id)) continue
    if (c.id && optedOut.ids.has(c.id)) continue
    if (c.phone && isOptedOutPhone(c.phone, optedOut.keys)) continue
    count++
  }
  return count
}

/** Linhas do CSV → contatos (liga ao contato existente pelo telefone exato, como o envio faz). */
export function csvAudienceContacts(
  rows: { phone: string }[],
  existing: { id: string; phone: string | null }[],
): AudienceContact[] {
  const byPhone = new Map<string, string>()
  for (const c of existing) if (c.phone) byPhone.set(c.phone, c.id)
  const seen = new Set<string>()
  const out: AudienceContact[] = []
  for (const r of rows) {
    if (!r.phone || seen.has(r.phone)) continue
    seen.add(r.phone)
    out.push({ id: byPhone.get(r.phone) ?? null, phone: r.phone })
  }
  return out
}

// ── Busca no banco (RLS limita à conta de quem está logado) ─────────

export interface AudienceFilter {
  type: 'all' | 'tags' | 'custom_field' | 'csv'
  tagIds?: string[]
  customField?: { fieldId: string; operator: 'is' | 'is_not' | 'contains'; value: string }
  csvContacts?: { phone: string; name?: string }[]
  excludeTagIds?: string[]
}

const PAGE = 1000
const IN_CHUNK = 200

type Row = Record<string, unknown>

/** Lê todas as páginas (o PostgREST corta cada resposta em 1.000 linhas). */
async function allPages<T extends Row>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

async function contactsByIds(db: SupabaseClient, ids: string[]): Promise<AudienceContact[]> {
  const out: AudienceContact[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    const { data, error } = await db.from('contacts').select('id, phone').in('id', chunk)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as AudienceContact[]))
  }
  return out
}

async function contactIdsWithTags(db: SupabaseClient, tagIds: string[]): Promise<string[]> {
  const rows = await allPages<{ contact_id: string }>((from, to) =>
    db.from('contact_tags').select('contact_id').in('tag_id', tagIds).order('contact_id').range(from, to),
  )
  return [...new Set(rows.map((r) => r.contact_id))]
}

/** null = público incompleto (o usuário ainda está montando o filtro). */
export async function estimateAudienceCount(
  db: SupabaseClient,
  audience: AudienceFilter,
): Promise<number | null> {
  let contacts: AudienceContact[]

  if (audience.type === 'all') {
    contacts = await allPages<{ id: string; phone: string | null }>((from, to) =>
      db.from('contacts').select('id, phone').order('id').range(from, to),
    )
  } else if (audience.type === 'tags') {
    if (!audience.tagIds?.length) return null
    contacts = await contactsByIds(db, await contactIdsWithTags(db, audience.tagIds))
  } else if (audience.type === 'custom_field') {
    const f = audience.customField
    if (!f?.fieldId || !f.value) return null
    const rows = await allPages<{ contact_id: string }>((from, to) => {
      let q = db.from('contact_custom_values').select('contact_id').eq('custom_field_id', f.fieldId)
      if (f.operator === 'is') q = q.eq('value', f.value)
      else if (f.operator === 'is_not') q = q.neq('value', f.value)
      else q = q.ilike('value', `%${f.value}%`)
      return q.order('contact_id').range(from, to)
    })
    contacts = await contactsByIds(db, [...new Set(rows.map((r) => r.contact_id))])
  } else {
    if (!audience.csvContacts?.length) return null
    const phones = [...new Set(audience.csvContacts.map((r) => r.phone).filter(Boolean))]
    const existing: { id: string; phone: string | null }[] = []
    for (let i = 0; i < phones.length; i += IN_CHUNK) {
      const { data, error } = await db.from('contacts').select('id, phone').in('phone', phones.slice(i, i + IN_CHUNK))
      if (error) throw new Error(error.message)
      existing.push(...((data ?? []) as { id: string; phone: string | null }[]))
    }
    contacts = csvAudienceContacts(audience.csvContacts, existing)
  }

  const excludedContactIds = new Set(
    audience.excludeTagIds?.length ? await contactIdsWithTags(db, audience.excludeTagIds) : [],
  )

  const optedOutRows = await allPages<{ id: string; phone: string | null }>((from, to) =>
    db.from('contacts').select('id, phone').eq('do_not_contact', true).order('id').range(from, to),
  )
  const optedOut: OptedOut = {
    ids: new Set(optedOutRows.map((r) => r.id)),
    keys: optOutPhoneKeys(optedOutRows.map((r) => r.phone).filter((p): p is string => !!p)),
  }

  return countAudience({ contacts, excludedContactIds, optedOut })
}
