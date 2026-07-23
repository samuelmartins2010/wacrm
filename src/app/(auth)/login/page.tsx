"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  // OAuth has no "check your email" pause step — the browser comes back
  // authenticated straight away, so the invite token has to travel via
  // `redirectTo`'s `next` query param instead of `emailRedirectTo` (the
  // mechanism the password-based signup flow uses).
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
    // On success the browser navigates away to Google — nothing left to do here.
  };

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
        <div className="pointer-events-none absolute -left-10 -top-10 size-[240px] rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 size-[320px] rounded-full bg-[#25d366]/10" />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/clientizza-logo-full.png"
          alt="Clientizza"
          className="relative h-9 w-auto"
        />

        <div className="relative flex flex-col">
          <p className="text-[42px] font-extrabold leading-tight text-white">
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

      {/* ── Painel direito: formulário ── */}
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-[440px] border-border bg-card">
          <CardHeader className="items-center text-center">
            {/* Marca compacta — visível só quando o painel esquerdo some (mobile) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/clientizza-icon.png"
              alt=""
              className="mb-2 h-10 w-10 lg:hidden"
            />
            <CardTitle className="text-2xl text-foreground">
              {inviteToken ? t("titleAccept") : t("titleWelcome")}
            </CardTitle>
            <CardDescription>
              {inviteToken ? t("descAccept") : t("descWelcome")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("passwordLabel")}</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary hover:text-primary/80"
                  >
                    {t("forgotPassword")}
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="mt-1 h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? t("signingIn") : t("signInCta")}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">
                {t("orContinueWith")}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={googleLoading}
              onClick={handleGoogleLogin}
              className="h-11 w-full gap-2 border-border text-foreground hover:bg-muted"
            >
              <GoogleIcon />
              {googleLoading ? t("signingIn") : t("signInWithGoogle")}
            </Button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("noAccount")}{" "}
              <Link
                href={
                  inviteToken
                    ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                    : "/signup"
                }
                className="text-primary hover:text-primary/80"
              >
                {t("createAccount")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
