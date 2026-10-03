import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/security/redirect";
import { sendWelcomeOnce } from "@/lib/email/notifications";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Landing route for links in Supabase Auth emails (sign-up confirmation and
 * password recovery). Supports both the PKCE `code` flow and `token_hash`
 * templates, then redirects to a validated same-origin path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/account");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let userId: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id ?? null;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) userId = data.user?.id ?? null;
  }

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in?error=link_invalid", origin));
  }

  if (!next.startsWith("/reset-password")) {
    try {
      await sendWelcomeOnce(userId);
    } catch (error) {
      console.error("[auth] welcome email failed", error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
