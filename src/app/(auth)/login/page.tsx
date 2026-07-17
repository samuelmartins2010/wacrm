"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (inviteToken) {
      router.push(`/join/${encodeURIComponent(inviteToken)}`);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div
      className="relative flex min-h-screen w-full overflow-hidden"
      style={{
        background:
          "linear-gradient(140deg, rgb(10, 25, 50) 14.3%, rgb(26, 51, 92) 50%, rgb(30, 62, 111) 85.7%)",
      }}
    >
      {/* Ellipses decorativas */}
      <div
        className="pointer-events-none absolute -left-[120px] -top-[80px] size-[560px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(59,123,247,0.35) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-[100px] -right-[60px] size-[400px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(5,192,229,0.2) 0%, transparent 70%)",
        }}
      />

      {/* ── Painel esquerdo: branding (desktop) ── */}
      <div className="hidden lg:flex lg:w-[640px] flex-shrink-0 flex-col justify-between px-[72px] py-[64px]">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 items-center justify-center rounded-xl border border-[rgba(96,153,250,0.4)] bg-[rgba(59,123,247,0.2)] px-3">
            <span className="text-base font-extrabold text-white">Clientizza</span>
          </div>
        </div>

        {/* Conteúdo central */}
        <div className="flex flex-col">

          {/* Headline */}
          <div className="mb-6">
            <p className="text-[56px] font-extrabold leading-tight text-white">
              {t("headline1")}
            </p>
            <p className="text-[56px] font-extrabold leading-tight text-[#6099fa]">
              {inviteToken ? t("headline2Invite") : t("headline2")}
            </p>
            <p className="text-[56px] font-extrabold leading-tight text-white">
              {t("headline3")}
            </p>
          </div>

          {/* Descrição */}
          <p className="mb-10 text-[16px] leading-[28px] text-[#a5abb8]">
            Acompanhe seus contatos, atendimentos
            <br />e conversas em um só lugar.
          </p>

          {/* Feature badges */}
          <div className="flex flex-col gap-3">
            {[t("feature1"), t("feature2"), t("feature3")].map((feat) => (
              <div
                key={feat}
                className="inline-flex w-fit items-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] px-[17px] py-[9px]"
              >
                <span className="text-[13px] font-medium text-white">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <div />
      </div>

      {/* Divisor vertical */}
      <div className="hidden lg:block w-px self-stretch bg-[rgba(255,255,255,0.06)]" />

      {/* ── Painel direito: formulário ── */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div
          className="w-full max-w-[460px] overflow-hidden rounded-[28px] border border-[rgba(255,255,255,0.15)] px-[31px] py-[47px] shadow-[0px_24px_64px_-8px_rgba(10,25,50,0.4)]"
          style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(1px)" }}
        >
          {/* Ícone */}
          <div
            className="mx-auto mb-5 flex h-16 items-center justify-center rounded-[20px] px-4"
            style={{ background: "linear-gradient(90deg, #3b7bf7, #1a335c)" }}
          >
            <span className="text-[20px] font-extrabold text-white">Clientizza</span>
          </div>

          {/* Título */}
          <h2 className="mb-2 text-center text-[22px] font-bold text-white">
            {inviteToken ? t("titleAccept") : t("titleWelcome")}
          </h2>
          <p className="mb-6 text-center text-[14px] text-[#b2bfd9]">
            {inviteToken ? t("descAccept") : t("descWelcome")}
          </p>

          {/* Formulário */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[12px] font-medium text-[#a6b2cc]"
              >
                {t("emailLabel")}
              </label>
              <div className="flex h-[48px] items-center rounded-[14px] border-[1.5px] border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] px-[14px]">
                <input
                  id="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-transparent text-[14px] text-white placeholder:text-[#66738c] focus:outline-none"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-[12px] font-medium text-[#a6b2cc]"
                >
                  {t("passwordLabel")}
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[12px] text-[#6099fa] hover:text-[#3b7bf7]"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <div className="flex h-[48px] items-center rounded-[14px] border-[1.5px] border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] px-[14px]">
                <input
                  id="password"
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-transparent text-[14px] text-white placeholder:text-[#66738c] focus:outline-none"
                />
              </div>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-[52px] w-full rounded-[16px] text-[15px] font-semibold text-white shadow-[0px_8px_24px_-4px_rgba(37,99,235,0.5)] transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(90deg, #3b7bf7, #1a335c)" }}
            >
              {loading ? t("signingIn") : t("signInCta")}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[#99a6bf]">
            {t("noAccount")}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="text-[#6099fa] hover:text-[#3b7bf7]"
            >
              {t("createAccount")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
