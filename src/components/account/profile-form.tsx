"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Field, SubmitButton, useActionToast } from "@/components/forms";
import { updateProfile } from "@/lib/auth/actions";
import type { FormState } from "@/lib/action-result";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, action] = useActionState(updateProfile, {} as FormState);
  useActionToast(state);
  return (
    <form action={action} className="max-w-md space-y-4">
      <Field name="fullName" label="Full name" defaultValue={fullName} autoComplete="name" required error={state.fieldErrors?.fullName} />
      <Field name="email" label="Email" defaultValue={email} disabled readOnly hint="Your email address is used to sign in." />
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}

export function PasswordUpdatedToast() {
  useEffect(() => {
    toast.success("Your password was updated.", { id: "password-updated" });
    window.history.replaceState(null, "", "/account");
  }, []);
  return null;
}
