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
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
