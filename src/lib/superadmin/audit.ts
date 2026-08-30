// ============================================================
// Audit log for /superadmin actions.
//
// Design decision (revisit if it stops being good enough):
//   Logging happens AFTER the mutation succeeds, from inside the
//   route handler. If the audit insert itself fails, we log to
//   the server console but do NOT fail the request — the
//   underlying action already committed, and turning a successful
//   account update into a 500 because the audit write hiccuped is
//   worse than a gap in the log for that one call. This means the
//   audit log is best-effort, not a hard guarantee. If you need a
//   hard guarantee (e.g. for compliance), the correct fix is a
//   Postgres trigger on `accounts` itself, not an app-level call —
//   flag it if that's the bar you need.
//
// Every call site in src/app/api/superadmin/** that mutates data
// MUST call this after a successful write. Reads (GET) are not
// logged for now — only mutations count as "administrative
// action" per the current scope.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlatformAdminRole } from './auth'

export interface AuditActor {
  userId: string
  email: string
  role: PlatformAdminRole
}

export interface AuditEntry {
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

export async function logAdminAction(
  admin: SupabaseClient,
  actor: AuditActor,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await admin.from('platform_admin_audit_log').insert({
    admin_user_id: actor.userId,
    admin_email: actor.email,
    admin_role: actor.role,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? null,
  })

  if (error) {
    // Deliberately non-throwing — see module comment above.
    console.error('[platform_admin_audit_log] failed to record action', {
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      error,
    })
  }
}
