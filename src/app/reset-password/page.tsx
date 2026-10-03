import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from the recovery email via /auth/confirm, which establishes a session. */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <AuthCard title="Reset link expired" description="Password reset links are valid for a limited time. Request a new one to continue.">
        <Button asChild className="h-11 w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" description={`Signed in as ${user.email}`}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
