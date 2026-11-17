import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'

const PAGE = 1000

/**
 * Every opted-out phone of the account (sanitized), paged past PostgREST's
 * row cap. Throws on any error so callers fail closed instead of sending.
 */
export async function loadOptedOutPhones(db: SupabaseClient, accountId: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('contacts')
      .select('phone')
      .eq('account_id', accountId)
      .eq('do_not_contact', true)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`opt-out check failed: ${error.message}`)
    for (const r of (data ?? []) as { phone: string }[]) out.add(sanitizePhoneForMeta(r.phone))
    if (!data || data.length < PAGE) break
  }
  return out
}
