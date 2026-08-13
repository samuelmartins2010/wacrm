/**
 * Days left until `renewal_date` (a DATE column, so day-granularity —
 * not a live countdown to the second, which would be meaningless
 * against a value with no time component). Returns null when there's
 * no renewal_date to compute from (accounts created before migration
 * 037, or never put on a trial).
 *
 * Clamped at 0 rather than going negative — middleware is what
 * actually cuts off access once expired; this is display-only and a
 * negative "days remaining" would just read as a bug to the user.
 */
export function trialDaysRemaining(renewalDate: string | null): number | null {
  if (!renewalDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const renewal = new Date(`${renewalDate}T00:00:00`);
  if (Number.isNaN(renewal.getTime())) return null;

  const diffMs = renewal.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, days);
}
