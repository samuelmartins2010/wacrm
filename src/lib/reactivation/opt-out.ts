import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'

const PAGE = 1000

/**
 * Forms the same number can take: phoneVariants (0 do DDD / trunk 0)
 * plus, for Brazil (+55), with and without the mobile 9th digit.
 */
export function phoneKeys(phone: string): string[] {
  const keys = new Set<string>()
  for (const v of phoneVariants(sanitizePhoneForMeta(phone))) {
    keys.add(v)
    if (v.startsWith('55')) {
      const rest = v.slice(2)
      if (rest.length === 11 && rest[2] === '9') keys.add('55' + rest.slice(0, 2) + rest.slice(3))
      if (rest.length === 10) keys.add('55' + rest.slice(0, 2) + '9' + rest.slice(2))
    }
  }
  return [...keys]
}

/** Lookup set with every form of every opted-out phone. */
export function optOutPhoneKeys(phones: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const p of phones) for (const k of phoneKeys(p)) out.add(k)
  return out
}

export function isOptedOutPhone(phone: string, keys: Set<string>): boolean {
  return phoneKeys(phone).some((k) => keys.has(k))
}

/**
 * Split broadcast recipients: opted out by contact_id when the caller
 * knows the contact, otherwise (CSV / raw phone) by any phone form.
 */
export function partitionBroadcastRecipients<T extends { phone: string; contact_id?: string | null }>(
  recipients: T[],
  optedOutContactIds: Set<string>,
  optedOutKeys: Set<string>,
): { allowed: T[]; optedOut: T[] } {
  const allowed: T[] = []
  const optedOut: T[] = []
  for (const r of recipients) {
    const out =
      (r.contact_id && optedOutContactIds.has(r.contact_id)) || isOptedOutPhone(r.phone, optedOutKeys)
    ;(out ? optedOut : allowed).push(r)
  }
  return { allowed, optedOut }
}

/** Ids + phone keys of every opted-out contact of the account (paged, fail closed). */
export async function loadOptedOut(
  db: SupabaseClient,
  accountId: string,
): Promise<{ ids: Set<string>; keys: Set<string> }> {
  const ids = new Set<string>()
  const phones: string[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('contacts')
      .select('id, phone')
      .eq('account_id', accountId)
      .eq('do_not_contact', true)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`opt-out check failed: ${error.message}`)
    for (const r of (data ?? []) as { id: string; phone: string }[]) {
      ids.add(r.id)
      phones.push(r.phone)
    }
    if (!data || data.length < PAGE) break
  }
  return { ids, keys: optOutPhoneKeys(phones) }
}
