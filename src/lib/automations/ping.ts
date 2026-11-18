/**
 * D3: after a screen writes a tag or an assignment straight to Supabase,
 * ask the server to fire the tag_added / conversation_assigned
 * automations now (the cron would pick them up later anyway).
 * Fire-and-forget; never throws.
 */
export function pingAutomationEvents(): void {
  try {
    void fetch('/api/automations/events', { method: 'POST' }).catch(() => {})
  } catch {
    // ignore — the cron is the safety net
  }
}
