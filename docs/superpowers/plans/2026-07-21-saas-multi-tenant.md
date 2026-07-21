# SaaS Multi-Tenant (Super Admin Enxuto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform wacrm into a multi-tenant SaaS platform with a super admin panel for managing client accounts, subscription status, and client onboarding.

**Architecture:** Build on the existing `accounts` table and RLS isolation — add subscription fields (`status`, `plan`, `renewal_date`, `notes`, `suspended_at`) to `accounts`, a service-role API layer for the super admin, middleware that blocks suspended accounts, and a 3-step onboarding wizard for new clients. All existing CRM logic is unchanged.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Auth Admin API), TypeScript, Tailwind v4, shadcn/ui (Button, Dialog, Input, Label, Badge, Sheet, Table, Select), Vitest for unit tests.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `supabase/migrations/036_saas_subscriptions.sql` | Adds subscription fields to accounts |
| Create | `src/lib/superadmin/auth.ts` | `requireSuperAdmin()` + `isSuperAdminEmail()` |
| Create | `src/lib/superadmin/auth.test.ts` | Unit tests for auth utilities |
| Create | `src/app/api/superadmin/accounts/route.ts` | GET list + POST create account |
| Create | `src/app/api/superadmin/accounts/[id]/route.ts` | PATCH update account |
| Modify | `src/middleware.ts` | Check account.status, redirect suspended |
| Create | `src/app/suspended/page.tsx` | Suspended account page |
| Create | `src/app/superadmin/layout.tsx` | Server layout — super admin gate |
| Create | `src/app/superadmin/page.tsx` | Super admin main page |
| Create | `src/components/superadmin/accounts-table.tsx` | Accounts list with status badges |
| Create | `src/components/superadmin/create-account-modal.tsx` | Create account + send invite |
| Create | `src/components/superadmin/edit-account-drawer.tsx` | Edit plan/status/renewal |
| Create | `src/app/onboarding/page.tsx` | Server page — gate + redirect |
| Create | `src/components/onboarding/onboarding-wizard.tsx` | 3-step wizard client component |
| Modify | `src/app/(dashboard)/dashboard-shell.tsx` | Redirect to /onboarding if not configured |
| Modify | `.env.local.example` | Add SUPER_ADMIN_EMAIL, SUPPORT_PHONE, SUPPORT_EMAIL |

---

## Task 1: Database Migration — Subscription Fields

**Files:**
- Create: `supabase/migrations/036_saas_subscriptions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 036_saas_subscriptions.sql
-- Adds subscription management fields to the accounts table.
-- Safe to run multiple times (IF NOT EXISTS / idempotent DDL).

-- ============================================================
-- TYPES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status_enum') THEN
    CREATE TYPE account_status_enum AS ENUM ('active', 'suspended', 'trial');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_plan_enum') THEN
    CREATE TYPE account_plan_enum AS ENUM ('basic', 'pro');
  END IF;
END $$;

-- ============================================================
-- COLUMNS
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status      account_status_enum NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS plan        account_plan_enum   NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS renewal_date DATE,
  ADD COLUMN IF NOT EXISTS notes       TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- ============================================================
-- INDEX (for filtering by status in the super admin panel)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

-- ============================================================
-- RLS: Super admin reads via service role (bypasses RLS).
-- Regular accounts read their own row via existing policy.
-- No new policies needed.
-- ============================================================
```

- [ ] **Step 2: Apply the migration to Supabase**

Go to your Supabase dashboard → SQL Editor, paste and run the migration.
Or if using the Supabase CLI: `supabase db push`

Expected: no errors. The `accounts` table now has `status`, `plan`, `renewal_date`, `notes`, `suspended_at` columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/036_saas_subscriptions.sql
git commit -m "feat(db): add subscription fields to accounts (status, plan, renewal_date)"
```

---

## Task 2: Super Admin Auth Utility

**Files:**
- Create: `src/lib/superadmin/auth.ts`
- Create: `src/lib/superadmin/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/superadmin/auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isSuperAdminEmail } from './auth'

describe('isSuperAdminEmail', () => {
  it('returns true when email matches env var exactly', () => {
    expect(isSuperAdminEmail('admin@example.com', 'admin@example.com')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isSuperAdminEmail('Admin@Example.COM', 'admin@example.com')).toBe(true)
  })

  it('returns false when email does not match', () => {
    expect(isSuperAdminEmail('other@example.com', 'admin@example.com')).toBe(false)
  })

  it('returns false when user email is undefined', () => {
    expect(isSuperAdminEmail(undefined, 'admin@example.com')).toBe(false)
  })

  it('returns false when env var is not set', () => {
    expect(isSuperAdminEmail('admin@example.com', undefined)).toBe(false)
  })

  it('returns false when both are undefined', () => {
    expect(isSuperAdminEmail(undefined, undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
cd "C:\Users\Samuel\Documents\CRM whatsapp\wacrm"
npm test -- auth.test.ts
```

Expected: FAIL — `isSuperAdminEmail` not found.

- [ ] **Step 3: Implement `src/lib/superadmin/auth.ts`**

```typescript
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
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
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
npm test -- auth.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/superadmin/auth.ts src/lib/superadmin/auth.test.ts
git commit -m "feat(superadmin): add requireSuperAdmin and isSuperAdminEmail utilities"
```

---

## Task 3: Super Admin API — List and Create Accounts

**Files:**
- Create: `src/app/api/superadmin/accounts/route.ts`

- [ ] **Step 1: Create `src/app/api/superadmin/accounts/route.ts`**

```typescript
// GET  — list all accounts with basic stats
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
    //    trigger auto-creates their account row.
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
```

- [ ] **Step 2: Test manually with curl**

Run the dev server (`npm run dev`), sign in as super admin, then:

```bash
curl -X GET http://localhost:3000/api/superadmin/accounts \
  -H "Cookie: <your session cookie>"
```

Expected: `{ "accounts": [...] }` with all accounts.

```bash
curl -X POST http://localhost:3000/api/superadmin/accounts \
  -H "Cookie: <your session cookie>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@client.com","accountName":"Clínica Teste","plan":"basic","renewalDate":"2026-08-21"}'
```

Expected: `{ "accountId": "...", "userId": "...", "email": "test@client.com" }` (201).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/superadmin/accounts/route.ts
git commit -m "feat(superadmin): add GET/POST /api/superadmin/accounts"
```

---

## Task 4: Super Admin API — Update Account

**Files:**
- Create: `src/app/api/superadmin/accounts/[id]/route.ts`

- [ ] **Step 1: Create `src/app/api/superadmin/accounts/[id]/route.ts`**

```typescript
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
```

- [ ] **Step 2: Test manually**

```bash
curl -X PATCH http://localhost:3000/api/superadmin/accounts/<account-id> \
  -H "Cookie: <your session cookie>" \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended","notes":"Pagamento pendente"}'
```

Expected: `{ "ok": true }`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/superadmin/accounts/[id]/route.ts"
git commit -m "feat(superadmin): add PATCH /api/superadmin/accounts/[id]"
```

---

## Task 5: Middleware — Suspend Check

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Read the current middleware**

Read `src/middleware.ts` before editing to confirm the current state.

- [ ] **Step 2: Replace `src/middleware.ts` with the extended version**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated.
  const protectedPaths = [
    '/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts',
    '/automations', '/settings', '/agents', '/flows', '/superadmin',
  ]
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // API routes that need auth (not webhooks)
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  // Account suspension check — only for authenticated users on CRM pages.
  // Skip /suspended and /onboarding themselves (infinite loop guard).
  // Skip /superadmin — super admin is never suspended.
  const crmPages = [
    '/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts',
    '/automations', '/settings', '/agents', '/flows',
  ]
  const isCrmPage = crmPages.some(p => request.nextUrl.pathname.startsWith(p))

  if (user && isCrmPage) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profile?.account_id) {
      const { data: account } = await supabase
        .from('accounts')
        .select('status')
        .eq('id', profile.account_id)
        .maybeSingle()

      if (account?.status === 'suspended') {
        const url = request.nextUrl.clone()
        url.pathname = '/suspended'
        return withRefreshedCookies(NextResponse.redirect(url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 3: Test suspension manually**

1. Create a test account via the API (Task 3).
2. Suspend it: `PATCH /api/superadmin/accounts/<id>` with `{"status":"suspended"}`.
3. Sign in as that account's user and try to visit `/dashboard`.
4. Expected: redirect to `/suspended`.
5. Reactivate: `PATCH` with `{"status":"active"}`. Verify `/dashboard` loads normally.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(middleware): redirect suspended accounts to /suspended"
```

---

## Task 6: Suspended Account Page

**Files:**
- Create: `src/app/suspended/page.tsx`

- [ ] **Step 1: Create `src/app/suspended/page.tsx`**

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Conta Suspensa',
  robots: { index: false, follow: false },
}

export default function SuspendedPage() {
  const phone = process.env.SUPPORT_PHONE ?? ''
  const email = process.env.SUPPORT_EMAIL ?? ''
  const waLink = phone
    ? `https://wa.me/${phone.replace(/\D/g, '')}`
    : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-4 text-4xl">⚠️</div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">
          Conta Suspensa
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Seu acesso está temporariamente suspenso. Para regularizar, entre em
          contato com o suporte.
        </p>

        {(phone || email) && (
          <div className="mb-6 space-y-1 text-sm text-muted-foreground">
            {phone && <p>📱 {phone}</p>}
            {email && <p>✉️ {email}</p>}
          </div>
        )}

        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ebe5d] transition-colors"
          >
            Falar no WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify visually**

Navigate a suspended account to `/suspended`. Confirm the support phone/email appear (add `SUPPORT_PHONE` and `SUPPORT_EMAIL` to `.env.local` first).

- [ ] **Step 3: Commit**

```bash
git add src/app/suspended/page.tsx
git commit -m "feat: add /suspended page for suspended accounts"
```

---

## Task 7: Super Admin Layout and Page Shell

**Files:**
- Create: `src/app/superadmin/layout.tsx`
- Create: `src/app/superadmin/page.tsx`

- [ ] **Step 1: Create `src/app/superadmin/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdminEmail } from '@/lib/superadmin/auth'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isSuperAdminEmail(user.email, process.env.SUPER_ADMIN_EMAIL)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-6 py-3 flex items-center gap-3">
        <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-widest">
          Super Admin
        </span>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/superadmin/page.tsx`**

```tsx
import { AccountsTable } from '@/components/superadmin/accounts-table'

export default function SuperAdminPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie clientes, planos e status de acesso.
          </p>
        </div>
      </div>
      <AccountsTable />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/layout.tsx src/app/superadmin/page.tsx
git commit -m "feat(superadmin): add /superadmin layout and page shell"
```

---

## Task 8: Accounts Table Component

**Files:**
- Create: `src/components/superadmin/accounts-table.tsx`

- [ ] **Step 1: Create `src/components/superadmin/accounts-table.tsx`**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CreateAccountModal } from './create-account-modal'
import { EditAccountDrawer } from './edit-account-drawer'

type AccountStatus = 'active' | 'suspended' | 'trial'
type AccountPlan = 'basic' | 'pro'

interface AccountRow {
  id: string
  name: string
  owner_user_id: string
  status: AccountStatus
  plan: AccountPlan
  renewal_date: string | null
  notes: string | null
  suspended_at: string | null
  created_at: string
  profiles: { email: string; full_name: string } | null
}

const STATUS_BADGE: Record<AccountStatus, { label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' }> = {
  active: { label: 'Ativo', variant: 'default' },
  trial: { label: 'Trial', variant: 'secondary' },
  suspended: { label: 'Suspenso', variant: 'destructive' },
}

function isExpiringSoon(renewalDate: string | null): boolean {
  if (!renewalDate) return false
  const diff = new Date(renewalDate).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

function isExpired(renewalDate: string | null): boolean {
  if (!renewalDate) return false
  return new Date(renewalDate).getTime() < Date.now()
}

export function AccountsTable() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<AccountRow | null>(null)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/superadmin/accounts', { cache: 'no-store' })
    if (res.ok) {
      const json = await res.json()
      setAccounts(json.accounts ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>+ Nova Conta</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Conta</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plano</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencimento</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((acc) => {
                const expiring = isExpiringSoon(acc.renewal_date)
                const expired = isExpired(acc.renewal_date)
                const badge = STATUS_BADGE[acc.status]
                return (
                  <tr key={acc.id} className="bg-card hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{acc.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {acc.profiles?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 capitalize">{acc.plan}</td>
                    <td className="px-4 py-3">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {acc.renewal_date ? (
                        <span className={
                          expired ? 'text-destructive font-medium' :
                          expiring ? 'text-yellow-600 font-medium' :
                          'text-foreground'
                        }>
                          {new Date(acc.renewal_date).toLocaleDateString('pt-BR')}
                          {expired && ' ⚠️'}
                          {expiring && !expired && ' 🔔'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditAccount(acc)}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma conta cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <CreateAccountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadAccounts}
      />

      {editAccount && (
        <EditAccountDrawer
          account={editAccount}
          onClose={() => setEditAccount(null)}
          onSaved={loadAccounts}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/superadmin/accounts-table.tsx
git commit -m "feat(superadmin): add AccountsTable component"
```

---

## Task 9: Create Account Modal

**Files:**
- Create: `src/components/superadmin/create-account-modal.tsx`

- [ ] **Step 1: Create `src/components/superadmin/create-account-modal.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateAccountModal({ open, onClose, onCreated }: Props) {
  const [email, setEmail] = useState('')
  const [accountName, setAccountName] = useState('')
  const [plan, setPlan] = useState<'basic' | 'pro'>('basic')
  const [renewalDate, setRenewalDate] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setEmail('')
    setAccountName('')
    setPlan('basic')
    setRenewalDate('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !accountName) return

    setSaving(true)
    try {
      const res = await fetch('/api/superadmin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accountName, plan, renewalDate }),
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Erro ao criar conta')
        return
      }

      toast.success(`Conta criada! Convite enviado para ${email}`)
      onCreated()
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conta</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail do cliente *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@exemplo.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accountName">Nome da conta *</Label>
            <Input
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Clínica Odonto Saúde"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Plano</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as 'basic' | 'pro')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renewalDate">Data de vencimento</Label>
            <Input
              id="renewalDate"
              type="date"
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            O cliente receberá um e-mail de convite do Supabase para definir sua
            senha e acessar o sistema.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !email || !accountName}>
              {saving ? 'Criando...' : 'Criar e Convidar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/superadmin/create-account-modal.tsx
git commit -m "feat(superadmin): add CreateAccountModal"
```

---

## Task 10: Edit Account Drawer

**Files:**
- Create: `src/components/superadmin/edit-account-drawer.tsx`

- [ ] **Step 1: Create `src/components/superadmin/edit-account-drawer.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type AccountStatus = 'active' | 'suspended' | 'trial'
type AccountPlan = 'basic' | 'pro'

interface Account {
  id: string
  name: string
  status: AccountStatus
  plan: AccountPlan
  renewal_date: string | null
  notes: string | null
  profiles: { email: string; full_name: string } | null
}

interface Props {
  account: Account
  onClose: () => void
  onSaved: () => void
}

export function EditAccountDrawer({ account, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<AccountStatus>(account.status)
  const [plan, setPlan] = useState<AccountPlan>(account.plan)
  const [renewalDate, setRenewalDate] = useState(account.renewal_date ?? '')
  const [notes, setNotes] = useState(account.notes ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/superadmin/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          plan,
          renewal_date: renewalDate || null,
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Erro ao salvar')
        return
      }

      toast.success('Conta atualizada')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md space-y-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{account.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {account.profiles?.email ?? ''}
          </p>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AccountStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">✅ Ativo</SelectItem>
                <SelectItem value="trial">🔔 Trial</SelectItem>
                <SelectItem value="suspended">⏸ Suspenso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Plano</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as AccountPlan)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renewalDate">Data de vencimento</Label>
            <Input
              id="renewalDate"
              type="date"
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações internas</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: pagou via Pix em 20/07, plano anual..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/superadmin/edit-account-drawer.tsx
git commit -m "feat(superadmin): add EditAccountDrawer"
```

---

## Task 11: Onboarding Wizard

**Files:**
- Create: `src/app/onboarding/page.tsx`
- Create: `src/components/onboarding/onboarding-wizard.tsx`

- [ ] **Step 1: Create `src/app/onboarding/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Already onboarded if whatsapp_config row exists for the account.
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.account_id) {
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (config?.phone_number_id) {
      redirect('/dashboard')
    }
  }

  return <OnboardingWizard />
}
```

- [ ] **Step 2: Create `src/components/onboarding/onboarding-wizard.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Step = 1 | 2 | 3

const SEGMENTS = [
  { value: 'clinic', label: 'Clínica Odontológica' },
  { value: 'courses', label: 'Cursos / Educação' },
  { value: 'services', label: 'Serviços Relacionados' },
  { value: 'other', label: 'Outro' },
]

export function OnboardingWizard() {
  const router = useRouter()
  const { accountId } = useAuth()
  const supabase = createClient()

  const [step, setStep] = useState<Step>(1)
  const [businessName, setBusinessName] = useState('')
  const [segment, setSegment] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabAccountId, setWabAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null)
  const [saving, setSaving] = useState(false)

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/whatsapp/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId, accessToken }),
      })
      setTestResult(res.ok ? 'ok' : 'error')
    } catch {
      setTestResult('error')
    } finally {
      setTesting(false)
    }
  }

  const handleSaveAndFinish = async () => {
    if (!accountId) return
    setSaving(true)
    try {
      // Update account name if the user provided one.
      if (businessName) {
        await supabase.from('accounts').update({ name: businessName }).eq('id', accountId)
      }

      // Upsert whatsapp_config.
      const { error } = await supabase.from('whatsapp_config').upsert({
        account_id: accountId,
        phone_number_id: phoneNumberId,
        wab_account_id: wabAccountId,
        access_token: accessToken,
      }, { onConflict: 'account_id' })

      if (error) {
        console.error('[onboarding] save error:', error)
        return
      }

      setStep(3)
    } finally {
      setSaving(false)
    }
  }

  if (step === 3) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold">Tudo configurado!</h1>
          <p className="text-muted-foreground">
            Seu CRM está pronto para uso.
          </p>
          <ul className="text-sm text-left space-y-2 text-muted-foreground">
            <li>→ Importe seus primeiros contatos</li>
            <li>→ Configure respostas rápidas</li>
            <li>→ Convide sua equipe</li>
          </ul>
          <Button className="w-full" onClick={() => router.push('/dashboard')}>
            Ir para o Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Progress indicator */}
        <div className="flex gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Bem-vindo!</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Vamos configurar seu CRM em 2 passos rápidos.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Nome do negócio</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Clínica Odonto Saúde"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Select value={segment} onValueChange={setSegment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SEGMENTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full" onClick={() => setStep(2)}>
              Próximo →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Conectar WhatsApp</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Cole as credenciais do Meta Business.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input
                  id="phoneNumberId"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="1234567890"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wabAccountId">WhatsApp Business Account ID</Label>
                <Input
                  id="wabAccountId"
                  value={wabAccountId}
                  onChange={(e) => setWabAccountId(e.target.value)}
                  placeholder="0987654321"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accessToken">Token de Acesso</Label>
                <Input
                  id="accessToken"
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAABcde..."
                />
              </div>

              {testResult === 'ok' && (
                <p className="text-sm text-green-600 font-medium">✓ Conexão verificada</p>
              )}
              {testResult === 'error' && (
                <p className="text-sm text-destructive">✗ Credenciais inválidas. Verifique e tente novamente.</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                ← Voltar
              </Button>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing || !phoneNumberId || !accessToken}
                className="flex-1"
              >
                {testing ? 'Testando...' : 'Testar conexão'}
              </Button>
            </div>

            <Button
              className="w-full"
              onClick={handleSaveAndFinish}
              disabled={saving || !phoneNumberId || !wabAccountId || !accessToken}
            >
              {saving ? 'Salvando...' : 'Salvar e Concluir ✓'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx src/components/onboarding/onboarding-wizard.tsx
git commit -m "feat: add /onboarding wizard for new client first-access"
```

---

## Task 12: Dashboard → Onboarding Redirect

**Files:**
- Modify: `src/app/(dashboard)/dashboard-shell.tsx`

- [ ] **Step 1: Read the current `dashboard-shell.tsx`**

Read `src/app/(dashboard)/dashboard-shell.tsx` to confirm the current state.

- [ ] **Step 2: Add onboarding redirect after user check**

In `DashboardShellInner`, add a redirect to `/onboarding` if the account has no WhatsApp configured. This is a client-side check that runs once after auth resolves.

Add after the `useAuth` hook:

```typescript
const { user, accountId, loading } = useAuth()
const [checkingOnboarding, setCheckingOnboarding] = useState(true)

useEffect(() => {
  if (loading || !user || !accountId) return

  const supabase = createClient()
  supabase
    .from('whatsapp_config')
    .select('phone_number_id')
    .eq('account_id', accountId)
    .maybeSingle()
    .then(({ data }) => {
      if (!data?.phone_number_id) {
        router.push('/onboarding')
      } else {
        setCheckingOnboarding(false)
      }
    })
}, [loading, user, accountId, router])
```

And update the loading guard:

```typescript
if (loading || checkingOnboarding) {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    </div>
  )
}
```

You also need to import `createClient`:
```typescript
import { createClient } from '@/lib/supabase/client'
```

- [ ] **Step 3: Test the flow**

1. Create a new test account (Task 3) and sign in as that client.
2. Visit `/dashboard`.
3. Expected: redirected to `/onboarding`.
4. Complete the wizard.
5. Expected: redirected to `/dashboard` (no more onboarding loop).

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/dashboard-shell.tsx
git commit -m "feat(dashboard): redirect new accounts to /onboarding if WhatsApp not configured"
```

---

## Task 13: Environment Variables + Changelog

**Files:**
- Modify: `.env.local.example`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add new vars to `.env.local.example`**

Add the following block before the last comment section in `.env.local.example`:

```bash
# ============================================================
# SAAS MULTI-TENANT (Super Admin)
# ============================================================

# E-mail address that has access to /superadmin and the
# /api/superadmin/* routes. Only this exact address (case-
# insensitive) is allowed in. Set to your own e-mail.
SUPER_ADMIN_EMAIL=you@yourdomain.com

# Displayed on the /suspended page so clients can reach you.
SUPPORT_PHONE=+55 11 99999-9999
SUPPORT_EMAIL=suporte@yourdomain.com
```

- [ ] **Step 2: Add CHANGELOG entry**

Add to the top of `CHANGELOG.md` (before the existing `[0.8.0]` entry):

```markdown
## [0.9.0] — 2026-07-21

Adds multi-tenant SaaS support: one installation now serves multiple
client accounts, each isolated by the existing RLS policies.

> **Migration required:** apply `supabase/migrations/036_saas_subscriptions.sql`
> (adds `status`, `plan`, `renewal_date`, `notes`, `suspended_at` to `accounts`).

### Added

- **Super Admin Panel** (`/superadmin`). Gated to `SUPER_ADMIN_EMAIL`.
  Create client accounts (sends Supabase invite e-mail), set plan and
  renewal date, suspend or reactivate accounts.
- **Account suspension.** Middleware checks `account.status` on every
  CRM page. Suspended accounts see `/suspended` with your support
  contact info (`SUPPORT_PHONE`, `SUPPORT_EMAIL`).
- **Client onboarding wizard.** New accounts land on `/onboarding` on
  first login. A 2-step wizard collects the business segment and
  WhatsApp Business credentials, then redirects to the dashboard.
```

- [ ] **Step 3: Commit**

```bash
git add .env.local.example CHANGELOG.md
git commit -m "docs: add SaaS multi-tenant vars to .env.local.example and CHANGELOG"
```

---

## Spec Coverage Self-Check

| Spec requirement | Task |
|---|---|
| Super Admin Panel — criar contas | Task 3 (API POST), Task 9 (modal) |
| Super Admin Panel — editar plano/vencimento/obs | Task 4 (API PATCH), Task 10 (drawer) |
| Super Admin Panel — suspender/ativar | Task 4 + Task 10 |
| Alertas de vencimento (amarelo/vermelho) | Task 8 (accounts-table) |
| Tela de suspensão com contato | Task 6 |
| Webhook não bloqueado durante suspensão | Task 5 (middleware exclui /api/webhooks) |
| Onboarding wizard 3 passos | Task 11 |
| Redirect ao dashboard se já configurado | Task 11 (server page) |
| Variáveis de ambiente | Task 13 |
| Migration SQL | Task 1 |
