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
