"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/security/redirect";
import { siteUrl } from "@/lib/site";
import { GENERIC_ERROR, type FormState } from "@/lib/action-result";
import {
  fieldErrors,
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/schemas";

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email address first. Check your inbox for the confirmation link." };
    }
    if (error.status === 429) return { error: "Too many attempts. Please wait a moment and try again." };
    // Do not reveal whether the email exists.
    return { error: "Invalid email or password." };
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next"), "/account"));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/account`,
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    if (error.code === "weak_password") return { fieldErrors: { password: [error.message] }, error: error.message };
    if (error.status === 429) return { error: "Too many attempts. Please wait a moment and try again." };
    if (error.code === "user_already_exists") {
      // Only returned when email confirmation is disabled; keep the message neutral.
      return { ok: true, message: "Check your inbox to confirm your email address." };
    }
    console.error("[auth] sign up failed", { code: error.code, status: error.status });
    return { error: GENERIC_ERROR };
  }

  // Same response whether or not the address was already registered (no account enumeration).
  return { ok: true, message: "Check your inbox to confirm your email address." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
  });
  if (error?.status === 429) return { error: "Too many requests. Please wait a moment and try again." };
  if (error) console.error("[auth] reset request failed", { code: error.code, status: error.status });

  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your reset link has expired. Please request a new one." };

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: ["Choose a different password."] } };
    if (error.code === "weak_password") return { fieldErrors: { password: [error.message] } };
    return { error: GENERIC_ERROR };
  }

  redirect("/account?password=updated");
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };

  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  // RLS restricts the update to the caller's own row; column grants restrict it to full_name.
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  if (error) {
    console.error("[account] profile update failed", { code: error.code });
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  return { ok: true, message: "Profile updated." };
}
