// ============================================================
// Server-side auth guard for /superadmin.
//
// Replaces the old single-email `SUPER_ADMIN_EMAIL` comparison
// with a real `platform_admins` table (migration 038). The
// service-role client still bypasses RLS by design — that part
// hasn't changed, and it's still the highest-privilege surface in
// the app. What changed is that access is now role-based and
// every mutation gets logged (see ./audit.ts), instead of gated
// by a single string comparison with zero audit trail.
// ============================================================

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { UnauthorizedError, ForbiddenError, toErrorResponse } from '@/lib/auth/account'

export type PlatformAdminRole = 'superadmin' | 'financeiro' | 'suporte' | 'comercial'

const ALL_PLATFORM_ADMIN_ROLES: readonly PlatformAdminRole[] = [
  'superadmin',
  'financeiro',
  'suporte',
  'comercial',
]

// Lazy singleton service-role client (bypasses RLS — server-only).
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}

/**
 * Pure function — testable without Supabase.
 * True if the admin's role is one of the roles the caller
 * requires for this action.
 */
export function hasRequiredRole(
  role: PlatformAdminRole | null | undefined,
  allowedRoles: readonly PlatformAdminRole[],
): boolean {
  if (!role) return false
  return allowedRoles.includes(role)
}

export interface PlatformAdminContext {
  admin: SupabaseClient
  userId: string
  email: string
  role: PlatformAdminRole
}

/**
 * Verify the caller is an active platform admin whose role is in
 * `allowedRoles` (defaults to any active admin — use this default
 * for reads; pass a narrower list for mutations until the real
 * permissions matrix exists).
 *
 * Throws UnauthorizedError (401) or ForbiddenError (403).
 */
export async function requirePlatformAdmin(
  allowedRoles: readonly PlatformAdminRole[] = ALL_PLATFORM_ADMIN_ROLES,
): Promise<PlatformAdminContext> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user || !user.email) throw new UnauthorizedError()

  const admin = supabaseAdmin()

  const { data: adminRow, error: lookupError } = await admin
    .from('platform_admins')
    .select('role, active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (lookupError) {
    console.error('[requirePlatformAdmin] lookup error:', lookupError)
    throw new ForbiddenError('Platform admin access required')
  }

  if (!adminRow || !adminRow.active) {
    throw new ForbiddenError('Platform admin access required')
  }

  const role = adminRow.role as PlatformAdminRole

  if (!hasRequiredRole(role, allowedRoles)) {
    throw new ForbiddenError(`This action requires one of: ${allowedRoles.join(', ')}`)
  }

  return { admin, userId: user.id, email: user.email, role }
}

export { toErrorResponse }
