// GET — aggregate KPIs for /superadmin/dashboard.
//
// Deliberately NOT included here: revenue, MRR, churn risk,
// inadimplentes. Those require the payments ledger, which is a
// separate decision still pending (see project notes) — a fake
// R$0,00 revenue card would be worse than no card at all.

import { NextResponse } from 'next/server'
import { requirePlatformAdmin, toErrorResponse } from '@/lib/superadmin/auth'
import { isExpiringSoon, isExpired } from '@/lib/superadmin/account-status'

interface AccountForDashboard {
  id: string
  name: string
  status: 'active' | 'suspended' | 'trial'
  plan: 'basic' | 'pro'
  renewal_date: string | null
  created_at: string
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7) // 'YYYY-MM'
}

/** Last N months as 'YYYY-MM' keys, oldest first, ending this month. */
export function lastNMonthKeys(n: number, now: Date): string[] {
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    keys.push(d.toISOString().slice(0, 7))
  }
  return keys
}

export async function GET() {
  try {
    const { admin } = await requirePlatformAdmin()

    const { data, error } = await admin
      .from('accounts')
      .select('id, name, status, plan, renewal_date, created_at')

    if (error) {
      console.error('[GET /api/superadmin/dashboard]', error)
      return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
    }

    const accounts = (data ?? []) as AccountForDashboard[]
    const now = new Date()

    const counts = {
      total: accounts.length,
      active: accounts.filter((a) => a.status === 'active').length,
      trial: accounts.filter((a) => a.status === 'trial').length,
      suspended: accounts.filter((a) => a.status === 'suspended').length,
      pro: accounts.filter((a) => a.plan === 'pro').length,
      basic: accounts.filter((a) => a.plan === 'basic').length,
    }

    // Growth: new accounts per month, last 12 months.
    const monthKeys = lastNMonthKeys(12, now)
    const monthCounts = new Map(monthKeys.map((k) => [k, 0]))
    for (const acc of accounts) {
      const key = monthKey(acc.created_at)
      if (monthCounts.has(key)) {
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1)
      }
    }
    const growth = monthKeys.map((key) => ({ month: key, count: monthCounts.get(key) ?? 0 }))

    const expiringSoon = accounts
      .filter((a) => a.status !== 'suspended' && isExpiringSoon(a.renewal_date, now))
      .map((a) => ({ id: a.id, name: a.name, renewal_date: a.renewal_date }))
      .sort((a, b) => (a.renewal_date ?? '').localeCompare(b.renewal_date ?? ''))

    const overdue = accounts
      .filter((a) => a.status !== 'suspended' && isExpired(a.renewal_date, now))
      .map((a) => ({ id: a.id, name: a.name, renewal_date: a.renewal_date }))
      .sort((a, b) => (a.renewal_date ?? '').localeCompare(b.renewal_date ?? ''))

    return NextResponse.json({ counts, growth, expiringSoon, overdue })
  } catch (err) {
    return toErrorResponse(err)
  }
}
