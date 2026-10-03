"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/lib/auth/actions";
import type { FormState } from "@/lib/action-result";

const initial: FormState = {};

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field name="email" label="Email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <div className="space-y-2">
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password}
        />
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Forgot password?
          </Link>
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, initial);
  if (state.ok) {
    return (
      <div className="space-y-4" data-testid="signup-success">
        <FormMessage state={state} />
        <p className="text-sm text-muted-foreground">
          Click the link in the email to activate your account. You can close this tab afterwards.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field name="fullName" label="Full name" autoComplete="name" required error={state.fieldErrors?.fullName} />
      <Field name="email" label="Email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field name="email" label="Email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />
      <Field
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Saving…">
        Update password
      </SubmitButton>
    </form>
  );
}
