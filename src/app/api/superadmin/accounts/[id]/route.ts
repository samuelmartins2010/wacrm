// PATCH — update an account: status, plan, renewal_date, notes, name,
// document (CPF/CNPJ), phone, and the owner's login email.

import { NextResponse } from 'next/server'
import { requirePlatformAdmin, toErrorResponse } from '@/lib/superadmin/auth'
import { logAdminAction } from '@/lib/superadmin/audit'
import { validateDocument, normalizeDocument } from '@/lib/documents/br-document'
import { normalizePhoneWithCountryCode } from '@/lib/whatsapp/phone-utils'

const VALID_STATUSES = ['active', 'suspended', 'trial'] as const
const VALID_PLANS = ['basic', 'pro'] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Status = (typeof VALID_STATUSES)[number]
type Plan = (typeof VALID_PLANS)[number]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Same placeholder scoping as POST /accounts — see comment there.
    const { admin, userId, email: actorEmail, role } = await requirePlatformAdmin(['superadmin'])
    const { id } = await params

    const body = (await request.json().catch(() => null)) as {
      status?: unknown
      plan?: unknown
      renewal_date?: unknown
      notes?: unknown
      name?: unknown
      document?: unknown
      phone?: unknown
      email?: unknown
    } | null

    if (!body) {
      return NextResponse.json({ error: 'Request body required' }, { status: 400 })
    }

    const update: Record<string, unknown> = {}
    // Kept separate from `update` (which targets the accounts table)
    // because email lives on auth.users, changed via a different API
    // call. Doing both from one PATCH keeps the drawer's UX as a
    // single "Salvar" button instead of two unrelated save actions.
    let newEmail: string | null = null

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

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      }
      update.name = name
    }

    if (body.document !== undefined) {
      const raw = typeof body.document === 'string' ? body.document : ''
      // Editing an existing account's document is optional to clear
      // (empty string → null) but if a value IS given, it must be a
      // real CPF/CNPJ — same bar as account creation, no exceptions
      // just because it's an edit.
      if (raw.trim() === '') {
        update.document = null
      } else if (!validateDocument(raw)) {
        return NextResponse.json(
          { error: 'CPF/CNPJ inválido — confira os dígitos' },
          { status: 400 },
        )
      } else {
        update.document = normalizeDocument(raw)
      }
    }

    if (body.phone !== undefined) {
      const raw = typeof body.phone === 'string' ? body.phone : ''
      if (raw.trim() === '') {
        update.phone = null
      } else {
        const normalized = normalizePhoneWithCountryCode(raw)
        if (!normalized) {
          return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
        }
        update.phone = normalized
      }
    }

    if (body.email !== undefined) {
      const raw = typeof body.email === 'string' ? body.email.trim() : ''
      if (!EMAIL_RE.test(raw)) {
        return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
      }
      newEmail = raw
    }

    if (Object.keys(update).length === 0 && !newEmail) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    if (newEmail) {
      const { data: account, error: lookupError } = await admin
        .from('accounts')
        .select('owner_user_id')
        .eq('id', id)
        .maybeSingle()

      if (lookupError || !account) {
        console.error('[PATCH /api/superadmin/accounts/[id]] owner lookup error:', lookupError)
        return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      }

      // Admin-triggered email change applies immediately — unlike a
      // user-initiated change, this does NOT send a confirmation link
      // to the new address first. Worth knowing before using this on
      // a real client: a typo here silently locks them out of the
      // email they expect to log in with.
      const { error: emailError } = await admin.auth.admin.updateUserById(
        account.owner_user_id,
        { email: newEmail },
      )

      if (emailError) {
        console.error('[PATCH /api/superadmin/accounts/[id]] email update error:', emailError)
        return NextResponse.json({ error: emailError.message }, { status: 400 })
      }
    }

    if (Object.keys(update).length > 0) {
      const { error } = await admin.from('accounts').update(update).eq('id', id)

      if (error) {
        console.error('[PATCH /api/superadmin/accounts/[id]]', error)
        return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
      }
    }

    await logAdminAction(
      admin,
      { userId, email: actorEmail, role },
      {
        action: 'account.update',
        targetType: 'account',
        targetId: id,
        // Document redacted to a boolean, same rationale as account
        // creation — no need to duplicate a national ID number into
        // the audit log to record that it changed.
        metadata: { ...update, document: update.document !== undefined ? '(changed)' : undefined, emailChanged: !!newEmail },
      },
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
