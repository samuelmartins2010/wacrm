import type { SupabaseClient } from '@supabase/supabase-js'

const CHUNK = 500

/**
 * D10: apply one tag to many contacts at once. Goes through
 * contacts_bulk_add_tag (migration 056), which writes without
 * tag_added events — bulk operations never fire automations; only
 * individual changes do. Returns how many contacts newly got the tag.
 */
export async function bulkAddTag(supabase: SupabaseClient, contactIds: string[], tagId: string): Promise<number> {
  let added = 0
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('contacts_bulk_add_tag', {
      p_contact_ids: contactIds.slice(i, i + CHUNK),
      p_tag_id: tagId,
    })
    if (error) throw new Error(error.message)
    added += Number(data ?? 0)
  }
  return added
}
