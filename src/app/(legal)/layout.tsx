import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/login" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/clientizza-icon.png"
              alt=""
              className="h-7 w-7 object-contain"
            />
            <span className="text-sm font-semibold text-foreground">
              Clientizza
            </span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/termos" className="hover:text-foreground">
              Termos de uso
            </Link>
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/suporte" className="hover:text-foreground">
              Suporte
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>

      <footer className="border-t border-border py-6">
        <p className="mx-auto max-w-3xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Clientizza — Samuel Anderson de Amorim
          Martins (CNPJ 50.879.523/0001-28)
        </p>
      </footer>
    </div>
  );
}
