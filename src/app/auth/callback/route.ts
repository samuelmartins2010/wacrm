import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Shared callback for every Supabase redirect-based flow: Google OAuth
// (login/signup) and the password-reset email link. Both hand Supabase
// a `code` to exchange for a session, then send the browser on to
// `next` (defaults to /dashboard).
//
// NOTE: this route did not exist before — `forgot-password/page.tsx`
// was already pointing `redirectTo` here, so password reset was
// silently broken until this file was added.
//
// NOTE 2: don't build the redirect origin from `new URL(request.url)`.
// Behind Nginx, Next.js's own request parsing sometimes resolves that
// to the internal bind address (http://localhost:3000) instead of the
// public host, even though Nginx is correctly forwarding the Host
// header — the OAuth exchange itself works fine, but the browser gets
// redirected to a URL only reachable on the server, not the visitor's
// machine. Read X-Forwarded-Host/Proto directly instead, since those
// are exactly what Nginx sends (confirmed in sites-available/wacrm).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : new URL(request.url).origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Detect a brand-new signup (not just any login) to show the
      // welcome dialog exactly once. Supabase doesn't expose an
      // explicit "just created" flag, but on someone's very first
      // sign-in ever, `created_at` and `last_sign_in_at` are the same
      // instant; on every later login `last_sign_in_at` has moved on.
      // A few seconds of slack covers clock/serialization jitter.
      const user = data.user;
      const isNewSignup =
        !!user?.created_at &&
        !!user?.last_sign_in_at &&
        Math.abs(
          new Date(user.last_sign_in_at).getTime() -
            new Date(user.created_at).getTime(),
        ) < 5000;

      const redirectUrl = new URL(`${origin}${next}`);
      if (isNewSignup) {
        redirectUrl.searchParams.set("welcome", "1");
      }
      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
