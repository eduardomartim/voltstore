import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES Row Level Security — use only for trusted,
 * server-side operations (order creation, Stripe webhooks, email bookkeeping).
 * The `server-only` import makes bundling this into client code a build error.
 */
export function createAdminClient() {
  return createClient<Database>(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
