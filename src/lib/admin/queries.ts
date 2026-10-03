import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/orders/status";

/*
 * Admin reads use the admin's own session. RLS (is_admin()) is what grants
 * access to every row — a customer calling these would only see their own data.
 */

export async function getDashboardStats() {
  const supabase = await createClient();
  const [paid, pending, toFulfil, lowStock, recent] = await Promise.all([
    supabase.from("orders").select("total_cents").eq("payment_status", "paid").neq("status", "cancelled"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["paid", "processing"]),
    supabase
      .from("products")
      .select("id, name, slug, stock_quantity, is_active")
      .lte("stock_quantity", 5)
      .eq("is_active", true)
      .order("stock_quantity"),
    supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(6),
  ]);

  for (const r of [paid, pending, toFulfil, lowStock, recent]) {
    if (r.error) throw new Error(`Failed to load dashboard: ${r.error.message}`);
  }

  return {
    revenueCents: (paid.data ?? []).reduce((sum, o) => sum + o.total_cents, 0),
    paidOrders: paid.data?.length ?? 0,
    pendingOrders: pending.count ?? 0,
    toFulfil: toFulfil.count ?? 0,
    lowStock: lowStock.data ?? [],
    recentOrders: recent.data ?? [],
  };
}

export async function listAllProducts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, category:categories(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load products: ${error.message}`);
  return data;
}

export async function getProductForEdit(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function listAllOrders(status?: OrderStatus) {
  const supabase = await createClient();
  let query = supabase.from("orders").select("*, items:order_items(quantity)").order("created_at", { ascending: false }).limit(100);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return data;
}
