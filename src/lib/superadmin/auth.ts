import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { UnauthorizedError, ForbiddenError, toErrorResponse } from '@/lib/auth/account'

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
 * Case-insensitive comparison so SUPER_ADMIN_EMAIL typos don't cause
 * silent lock-outs.
 */
export function isSuperAdminEmail(
  email: string | undefined,
  superAdminEmail: string | undefined,
): boolean {
  if (!email || !superAdminEmail) return false
  return email.toLowerCase() === superAdminEmail.toLowerCase()
}

/**
 * Verify the caller is the configured super admin.
 * Throws UnauthorizedError (401) or ForbiddenError (403).
 * Returns the service-role admin client on success.
 */
export async function requireSuperAdmin(): Promise<{ admin: SupabaseClient; userId: string }> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) throw new UnauthorizedError()

  if (!isSuperAdminEmail(user.email, process.env.SUPER_ADMIN_EMAIL)) {
    throw new ForbiddenError('Super admin access required')
  }

  return { admin: supabaseAdmin(), userId: user.id }
}

export { toErrorResponse }
