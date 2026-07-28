export const metadata = {
  title: "Suporte",
};

export default function SuportePage() {
  return (
    <article className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Suporte</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Precisa de ajuda com sua conta, dúvidas sobre a plataforma ou
          encontrou um problema? Fale com a gente:
        </p>
      </div>

      <a
        href="mailto:suporte@clientizza.com"
        className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-foreground transition-colors hover:border-primary/50"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MailIcon />
        </span>
        <span>
          <span className="block text-sm text-muted-foreground">E-mail</span>
          <span className="block font-medium">suporte@clientizza.com</span>
        </span>
      </a>

      <p className="text-sm text-muted-foreground">
        Respondemos o mais rápido possível durante dias úteis. Para contas
        criadas por convite, qualquer dúvida sobre acesso pode ser
        direcionada tanto para o administrador da sua empresa quanto para o
        e-mail acima.
      </p>
    </article>
  );
}

function MailIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
