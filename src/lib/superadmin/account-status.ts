// ============================================================
// Shared "is this account's renewal date a problem?" helpers.
// Previously duplicated inline in accounts-table.tsx; pulled out
// so the dashboard KPIs and the accounts list use the exact same
// definition of "expiring soon" / "expired" — a KPI card and a
// table row disagreeing on the same account would be worse than
// either one alone.
// ============================================================

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function isExpiringSoon(renewalDate: string | null, now: Date = new Date()): boolean {
  if (!renewalDate) return false
  const diff = new Date(renewalDate).getTime() - now.getTime()
  return diff > 0 && diff <= SEVEN_DAYS_MS
}

export function isExpired(renewalDate: string | null, now: Date = new Date()): boolean {
  if (!renewalDate) return false
  return new Date(renewalDate).getTime() < now.getTime()
}
