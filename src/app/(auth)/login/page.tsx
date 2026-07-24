"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus_Jakarta_Sans } from "next/font/google";
import { createClient } from "@/lib/supabase/client";

// O Figma usa Plus Jakarta Sans só nos títulos e no botão principal —
// o resto do app usa Inter (carregada globalmente em layout.tsx), então
// carregamos essa fonte aqui, escopada só a essa página.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["700", "800"],
});

// `useSearchParams` opts the component out of static prerendering
// unless wrapped in Suspense — same pattern as /signup.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

// Google's four-color "G" mark, used only inside the OAuth button per
// Google's own sign-in button guidelines.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);

    const nextPath = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };

  // NOTE: every color below is a literal value, deliberately NOT the
  // app's --primary/--background tokens. This screen is a pre-auth
  // brand surface pinned to the Figma spec — it must look identical
  // no matter what dark/light mode or accent theme the visitor's
  // browser has stored, since they haven't logged in yet to have a
  // preference at all. Same approach the old (blue) design used.
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      {/* ── Painel esquerdo: branding (oculto no mobile) ── */}
      <div
        className="relative hidden flex-shrink-0 flex-col justify-between overflow-hidden px-12 py-16 lg:flex lg:w-[45%]"
        style={{
          background:
            "linear-gradient(155deg, #064e3b 8%, #065f46 46%, #047857 92%)",
        }}
      >
        {/* Bolhas de chat decorativas — mesma composição do Figma */}
        <div className="pointer-events-none absolute left-[54px] top-[98px] h-[52px] w-[160px] rounded-tl-[18px] rounded-tr-[18px] rounded-br-[18px] rounded-bl-[4px] bg-white/[0.07]" />
        <div className="pointer-events-none absolute left-[190px] top-[171px] h-[40px] w-[120px] rounded-tl-[18px] rounded-tr-[18px] rounded-bl-[18px] rounded-br-[4px] bg-[#25d366]/[0.13]" />
        <div className="pointer-events-none absolute left-[34px] top-[506px] h-[44px] w-[200px] rounded-tl-[18px] rounded-tr-[18px] rounded-br-[18px] rounded-bl-[4px] bg-white/[0.05]" />
        <div className="pointer-events-none absolute left-[136px] top-[588px] h-[36px] w-[140px] rounded-tl-[18px] rounded-tr-[18px] rounded-bl-[18px] rounded-br-[4px] bg-[#25d366]/10" />

        <div
          className="pointer-events-none absolute -left-10 -top-10 size-[240px] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.06), rgba(0,0,0,0) 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute size-[320px] rounded-full"
          style={{
            left: "419px",
            top: "556px",
            background:
              "radial-gradient(circle at 30% 30%, rgba(16,185,129,0.18), rgba(8,93,65,0.09) 35%, rgba(0,0,0,0) 70%)",
          }}
        />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/clientizza-logo-full.png"
          alt="Clientizza"
          className="relative h-9 w-auto self-start"
        />

        <div className="relative flex flex-col">
          <p className={`${jakarta.className} text-[42px] font-extrabold leading-tight text-white`}>
            {t("headline1")}{" "}
            <span className="text-[#25d366]">
              {inviteToken ? t("headline2Invite") : t("headline2")}
            </span>{" "}
            {t("headline3")}
          </p>
          <p className="mt-4 max-w-[380px] text-[15px] leading-relaxed text-white/60">
            {t("subheadline")}
          </p>
        </div>

        <div className="relative" />
      </div>

      {/* ── Painel direito: formulário (sempre claro, ver nota acima) ── */}
      <div className="flex flex-1 items-center justify-center bg-[#f0f4f2] px-4 py-12">
        <div className="w-full max-w-[440px] rounded-2xl border border-[#e5e7eb] bg-white p-10 shadow-[0px_4px_10px_rgba(0,0,0,0.1)]">
          {/* Marca compacta — visível só quando o painel esquerdo some (mobile) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/clientizza-icon.png"
            alt=""
            className="mx-auto mb-4 h-10 w-10 lg:hidden"
          />

          <h1 className={`${jakarta.className} text-center text-[26px] font-extrabold tracking-tight text-[#064e3b]`}>
            {inviteToken ? t("titleAccept") : t("titleWelcome")}
          </h1>
          <p className="mt-2 text-center text-[14.5px] text-[#6b7280]">
            {inviteToken ? t("descAccept") : t("descWelcome")}
          </p>

          <form onSubmit={handleLogin} className="mt-8 flex flex-col gap-[18px]">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[13px] font-semibold text-[#374151]">
                {t("emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-[48px] rounded-xl border border-[#d1d5db] bg-[#f8faf9] px-4 text-[14.5px] text-[#111827] placeholder:text-[#111827]/50 outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[13px] font-semibold text-[#374151]">
                  {t("passwordLabel")}
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[12.5px] font-medium text-[#065f46] hover:text-[#047857]"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-[48px] w-full rounded-xl border border-[#d1d5db] bg-[#f8faf9] pl-4 pr-11 text-[14.5px] text-[#111827] placeholder:text-[#111827]/50 outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#374151]"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-[9px]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="size-4 rounded-[2px] border border-[#767676] text-[#047857] focus:ring-[#047857]/30"
              />
              <span className="text-[13.5px] text-[#6b7280]">{t("rememberMe")}</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className={`${jakarta.className} mt-1 h-[50px] w-full rounded-xl text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50`}
              style={{ background: "linear-gradient(173deg, #065f46 0%, #047857 100%)" }}
            >
              {loading ? t("signingIn") : t("signInCta")}
            </button>
          </form>

          <div className="my-[26px] flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e5e7eb]" />
            <span className="text-xs text-[#9ca3af]">{t("orContinueWith")}</span>
            <div className="h-px flex-1 bg-[#e5e7eb]" />
          </div>

          <button
            type="button"
            disabled={googleLoading}
            onClick={handleGoogleLogin}
            className="flex h-[48px] w-full items-center justify-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
          >
            <GoogleIcon />
            {googleLoading ? t("signingIn") : t("signInWithGoogle")}
          </button>

          <p className="mt-6 text-center text-[13.5px] text-[#6b7280]">
            {t("noAccount")}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="font-medium text-[#065f46] hover:text-[#047857]"
            >
              {t("createAccount")}
            </Link>
          </p>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-[#6b7280]">
            <a
              href="https://clientizza.com/termos"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#374151]"
            >
              {t("termsOfUse")}
            </a>
            <span className="text-[#666]">•</span>
            <a
              href="https://clientizza.com/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#374151]"
            >
              {t("privacyPolicy")}
            </a>
            <span className="text-[#666]">•</span>
            <a
              href="https://clientizza.com/suporte"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#374151]"
            >
              {t("support")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
