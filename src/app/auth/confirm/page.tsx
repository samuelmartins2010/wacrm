'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { EmailOtpType } from '@supabase/supabase-js'

// Why this page exists instead of verifying on load
//   Email security scanners (Gmail, Outlook Safe Links, corporate
//   antivirus) GET every link in an email automatically to check for
//   phishing — including the one-time invite/recovery link. Supabase's
//   token is single-use, so a scanner opening it first burns it before
//   the real person clicks, and they land on an "expired" error even
//   though the email arrived seconds ago. Requiring an explicit button
//   click here (not auto-verifying on page load) defeats that: a
//   scanner fetches this page and stops, it doesn't click buttons.
//   The Supabase email template must link here with `token_hash` and
//   `type` instead of the default `{{ .ConfirmationURL }}` — see
//   CHANGELOG for the exact template text.
function ConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const rawNext = searchParams.get('next') ?? '/onboarding'
  // `next` may arrive as a full URL (when the email template uses
  // `{{ .RedirectTo }}` verbatim) or a bare path — normalize to a
  // path so router.push behaves the same either way.
  const next = rawNext.startsWith('http') ? new URL(rawNext).pathname + new URL(rawNext).search : rawNext

  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const missingParams = !tokenHash || !type

  const handleConfirm = async () => {
    if (!tokenHash || !type) return
    setStatus('verifying')
    setErrorMessage(null)

    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    router.push(next)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Confirmar convite</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Clique no botão abaixo para confirmar e continuar.
          </p>
        </div>

        {missingParams ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Link inválido — faltam parâmetros de confirmação. Peça um novo
            convite ao administrador.
          </p>
        ) : status === 'error' ? (
          <div className="space-y-3">
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage ?? 'Não foi possível confirmar o convite.'} Esse
              link pode já ter sido usado ou expirado — peça um novo convite
              ao administrador.
            </p>
          </div>
        ) : (
          <Button className="w-full" onClick={handleConfirm} disabled={status === 'verifying'}>
            {status === 'verifying' ? 'Confirmando...' : 'Confirmar e continuar →'}
          </Button>
        )}
      </div>
    </div>
  )
}

// `useSearchParams` opts the component out of static prerendering
// unless wrapped in Suspense — same pattern as /login and /signup.
export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  )
}
