import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("E2E tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type TestUser = { id: string; email: string; password: string };

/** Creates a confirmed customer through the Admin API (no inbox needed). */
export async function createConfirmedUser(prefix = "e2e"): Promise<TestUser> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@voltline.test`;
  const password = `E2e-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "E2E Shopper" },
  });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

export async function createAdminUser(): Promise<TestUser> {
  const user = await createConfirmedUser("admin");
  const { error } = await admin().from("profiles").update({ role: "admin" }).eq("id", user.id);
  if (error) throw error;
  return user;
}

/** Simulates a webhook-confirmed payment (the webhook path itself is covered by integration tests). */
export async function markOrderPaid(orderId: string) {
  const client = admin();
  const { data: order } = await client.from("orders").select("total_cents").eq("id", orderId).single();
  const { error } = await client.rpc("apply_checkout_event", {
    p_event_id: `evt_e2e_${crypto.randomUUID()}`,
    p_event_type: "checkout.session.completed",
    p_order_id: orderId,
    p_session_id: `cs_test_e2e${crypto.randomUUID().replace(/-/g, "")}`,
    p_payment_intent_id: "pi_e2e",
    p_amount_total: order!.total_cents,
    p_currency: "brl",
    p_outcome: "paid",
  });
  if (error) throw error;
}

export async function deleteProduct(slug: string) {
  await admin().from("products").delete().eq("slug", slug);
}

/**
 * Deletes a test user's orders, first returning any stock they still hold
 * (deleting order rows directly bypasses the restock-on-cancel trigger).
 */
export async function deleteUserOrders(userId: string) {
  const client = admin();
  const { data: orders } = await client
    .from("orders")
    .select("status, items:order_items(product_id, quantity)")
    .eq("user_id", userId);
  for (const order of orders ?? []) {
    if (order.status === "cancelled") continue;
    for (const item of order.items as { product_id: string | null; quantity: number }[]) {
      if (!item.product_id) continue;
      const { data: p } = await client.from("products").select("stock_quantity").eq("id", item.product_id).single();
      if (p) await client.from("products").update({ stock_quantity: p.stock_quantity + item.quantity }).eq("id", item.product_id);
    }
  }
  await client.from("orders").delete().eq("user_id", userId);
}

export async function deleteUser(user: TestUser | undefined) {
  if (!user) return;
  await deleteUserOrders(user.id);
  await admin().auth.admin.deleteUser(user.id);
}

/** Creates a pending order for a user the server way (service role + create_order). */
export async function createOrderFor(user: TestUser, productSlug: string): Promise<string> {
  const client = admin();
  const { data: product } = await client.from("products").select("id").eq("slug", productSlug).single();
  const { data, error } = await client.rpc("create_order", {
    p_user_id: user.id,
    p_customer_email: user.email,
    p_items: [{ product_id: product!.id, quantity: 1 }],
  });
  if (error) throw error;
  return data as string;
}

export async function signIn(page: Page, user: TestUser, next = "/account") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[?]/g, "\\?")));
}

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Polls the local Supabase inbox (Mailpit) for the latest auth link sent to `email`. */
export async function getAuthEmailLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
      const link = message.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/)?.[0];
      if (link) return link.replace(/&amp;/g, "&").replace(/[)\]>]+$/, "");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No auth email received for ${email}`);
}

export async function mailpitAvailable(): Promise<boolean> {
  try {
    return (await fetch(`${MAILPIT_URL}/api/v1/info`)).ok;
  } catch {
    return false;
  }
}

export const stripeConfigured =Boolean(process.env.STRIPE_SECRET_KEY);
