import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Teste grátis encerrado',
  robots: { index: false, follow: false },
}

export default function TrialExpiredPage() {
  const email = process.env.SUPPORT_EMAIL ?? 'suporte@clientizza.com'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-4 text-4xl">⏰</div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">
          Seu teste grátis acabou
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Os 10 dias de acesso gratuito à sua conta chegaram ao fim. Fale com
          a gente para continuar usando o Clientizza.
        </p>

        
          href={`mailto:${email}`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Falar com o suporte
        </a>
      </div>
    </div>
  )
}
