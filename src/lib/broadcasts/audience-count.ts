import type { SupabaseClient } from '@supabase/supabase-js'
import { isOptedOutPhone, optOutPhoneKeys } from '@/lib/reactivation/opt-out'
import { contactIdsWithTags, fetchAllPages, fetchInChunks } from './audience-query'

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

async function contactsByIds(db: SupabaseClient, ids: string[]): Promise<AudienceContact[]> {
  return fetchInChunks<string, AudienceContact>(ids, (chunk) =>
    db.from('contacts').select('id, phone').in('id', chunk),
  )
}

/** null = público incompleto (o usuário ainda está montando o filtro). */
export async function estimateAudienceCount(
  db: SupabaseClient,
  audience: AudienceFilter,
): Promise<number | null> {
  let contacts: AudienceContact[]

  if (audience.type === 'all') {
    contacts = await fetchAllPages<{ id: string; phone: string | null }>((from, to) =>
      db.from('contacts').select('id, phone').order('id').range(from, to),
    )
  } else if (audience.type === 'tags') {
    if (!audience.tagIds?.length) return null
    contacts = await contactsByIds(db, await contactIdsWithTags(db, audience.tagIds))
  } else if (audience.type === 'custom_field') {
    const f = audience.customField
    if (!f?.fieldId || !f.value) return null
    const rows = await fetchAllPages<{ contact_id: string }>((from, to) => {
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
    const existing = await fetchInChunks<string, { id: string; phone: string | null }>(phones, (chunk) =>
      db.from('contacts').select('id, phone').in('phone', chunk),
    )
    contacts = csvAudienceContacts(audience.csvContacts, existing)
  }

  const excludedContactIds = new Set(
    audience.excludeTagIds?.length ? await contactIdsWithTags(db, audience.excludeTagIds) : [],
  )

  const optedOutRows = await fetchAllPages<{ id: string; phone: string | null }>((from, to) =>
    db.from('contacts').select('id, phone').eq('do_not_contact', true).order('id').range(from, to),
  )
  const optedOut: OptedOut = {
    ids: new Set(optedOutRows.map((r) => r.id)),
    keys: optOutPhoneKeys(optedOutRows.map((r) => r.phone).filter((p): p is string => !!p)),
  }

  return countAudience({ contacts, excludedContactIds, optedOut })
}
