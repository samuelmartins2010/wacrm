// GET  — list all accounts with owner email
// POST — invite a new client (creates auth user + updates their auto-created account)

import { NextResponse } from 'next/server'
import { requireSuperAdmin, toErrorResponse } from '@/lib/superadmin/auth'

export async function GET() {
  try {
    const { admin } = await requireSuperAdmin()

    const { data, error } = await admin
      .from('accounts')
      .select(`
        id,
        name,
        owner_user_id,
        status,
        plan,
        renewal_date,
        notes,
        suspended_at,
        created_at,
        profiles!inner ( email, full_name )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/superadmin/accounts]', error)
      return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 })
    }

    return NextResponse.json({ accounts: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { admin } = await requireSuperAdmin()

    const body = (await request.json().catch(() => null)) as {
      email?: unknown
      accountName?: unknown
      plan?: unknown
      renewalDate?: unknown
    } | null

    const email = typeof body?.email === 'string' ? body.email.trim() : null
    const accountName = typeof body?.accountName === 'string' ? body.accountName.trim() : null
    const plan = body?.plan === 'pro' ? 'pro' : 'basic'
    const renewalDate = typeof body?.renewalDate === 'string' ? body.renewalDate : null

    if (!email || !accountName) {
      return NextResponse.json(
        { error: 'email and accountName are required' },
        { status: 400 },
      )
    }

    // 1. Invite user — Supabase sends the email and the handle_new_user
    //    trigger auto-creates their account row synchronously.
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name: accountName },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/onboarding`,
      },
    )

    if (inviteError || !inviteData.user) {
      console.error('[POST /api/superadmin/accounts] invite error:', inviteError)
      return NextResponse.json(
        { error: inviteError?.message ?? 'Failed to invite user' },
        { status: 400 },
      )
    }

    const userId = inviteData.user.id

    // 2. Look up the account the trigger created.
    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle()

    if (accountError || !account) {
      console.error('[POST /api/superadmin/accounts] account lookup error:', accountError)
      return NextResponse.json({ error: 'Account was not created by trigger' }, { status: 500 })
    }

    // 3. Stamp the subscription fields.
    const updatePayload: Record<string, unknown> = {
      name: accountName,
      plan,
      status: 'trial',
    }
    if (renewalDate) updatePayload.renewal_date = renewalDate

    const { error: updateError } = await admin
      .from('accounts')
      .update(updatePayload)
      .eq('id', account.id)

    if (updateError) {
      console.error('[POST /api/superadmin/accounts] update error:', updateError)
      return NextResponse.json({ error: 'Failed to configure account' }, { status: 500 })
    }

    return NextResponse.json(
      { accountId: account.id, userId, email },
      { status: 201 },
    )
  } catch (err) {
    return toErrorResponse(err)
  }
}
