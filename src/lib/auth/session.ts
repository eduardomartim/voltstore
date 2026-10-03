import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type SessionUser = {
  id: string;
  email: string;
  profile: Profile;
};

/**
 * Returns the authenticated user and their profile, or null. Uses getUser(),
 * which validates the session with Supabase Auth instead of trusting cookies.
 * Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return null;

  return { id: user.id, email: user.email ?? profile.email, profile };
});

export async function requireUser(nextPath = "/account"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export function isAdmin(user: Pick<SessionUser, "profile"> | null | undefined): boolean {
  return user?.profile.role === "admin";
}

/**
 * For admin pages. Layouts and pages render in parallel, so each admin page
 * checks the role itself instead of relying on the admin layout.
 */
export async function requireAdminPage(nextPath = "/admin"): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (!isAdmin(user)) notFound();
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) throw new ForbiddenError();
  return user;
}
