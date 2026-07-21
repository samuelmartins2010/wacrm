// PATCH — update plan, status, renewal_date, notes for an account.

import { NextResponse } from 'next/server'
import { requireSuperAdmin, toErrorResponse } from '@/lib/superadmin/auth'

const VALID_STATUSES = ['active', 'suspended', 'trial'] as const
const VALID_PLANS = ['basic', 'pro'] as const

type Status = (typeof VALID_STATUSES)[number]
type Plan = (typeof VALID_PLANS)[number]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin } = await requireSuperAdmin()
    const { id } = await params

    const body = (await request.json().catch(() => null)) as {
      status?: unknown
      plan?: unknown
      renewal_date?: unknown
      notes?: unknown
    } | null

    if (!body) {
      return NextResponse.json({ error: 'Request body required' }, { status: 400 })
    }

    const update: Record<string, unknown> = {}

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status as Status)) {
        return NextResponse.json(
          { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 },
        )
      }
      update.status = body.status
      // Track when the account was suspended.
      if (body.status === 'suspended') {
        update.suspended_at = new Date().toISOString()
      }
    }

    if (body.plan !== undefined) {
      if (!VALID_PLANS.includes(body.plan as Plan)) {
        return NextResponse.json(
          { error: `plan must be one of: ${VALID_PLANS.join(', ')}` },
          { status: 400 },
        )
      }
      update.plan = body.plan
    }

    if (body.renewal_date !== undefined) {
      update.renewal_date = body.renewal_date === '' ? null : body.renewal_date
    }

    if (body.notes !== undefined) {
      update.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await admin.from('accounts').update(update).eq('id', id)

    if (error) {
      console.error('[PATCH /api/superadmin/accounts/[id]]', error)
      return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
