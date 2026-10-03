/**
 * Creates (or updates) the demo admin and customer accounts through the
 * Supabase Admin API, so passwords are hashed by Supabase Auth.
 *
 *   npm run seed:users
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the DEMO_*
 * variables from .env.local. Intended for local development / demo projects.
 */
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Set it in .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

type DemoUser = { email: string; password: string; fullName: string; role: "admin" | "customer" };

const users: DemoUser[] = [
  { email: env("DEMO_ADMIN_EMAIL"), password: env("DEMO_ADMIN_PASSWORD"), fullName: "Ada Admin", role: "admin" },
  { email: env("DEMO_CUSTOMER_EMAIL"), password: env("DEMO_CUSTOMER_PASSWORD"), fullName: "Casey Customer", role: "customer" },
];

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

for (const u of users) {
  let id = await findUserId(u.email);
  if (id) {
    const { error } = await supabase.auth.admin.updateUserById(id, { password: u.password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.fullName },
    });
    if (error) throw error;
    id = data.user.id;
  }

  // Role changes are only possible with the service role (customers cannot update `role`).
  const { error: roleError } = await supabase
    .from("profiles")
    .update({ role: u.role, full_name: u.fullName, welcome_email_sent_at: new Date().toISOString() })
    .eq("id", id);
  if (roleError) throw roleError;

  console.log(`✓ ${u.role.padEnd(8)} ${u.email}`);
}
