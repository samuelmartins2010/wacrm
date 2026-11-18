import type { AccountRole } from '@/lib/auth/roles'
import { hasMinRole } from '@/lib/auth/roles'

/**
 * Decisão D2: qualquer agent+ marca "não quer receber campanhas";
 * só admin+ desmarca. O banco reforça a mesma regra (migration 044).
 */
export function canChangeDoNotContact(role: AccountRole, value: boolean): boolean {
  return value ? hasMinRole(role, 'agent') : hasMinRole(role, 'admin')
}
