import Link from "next/link";
import { getDashboardStats } from "@/lib/admin/queries";
import { requireAdminPage } from "@/lib/auth/session";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber } from "@/lib/orders/status";
import { OrderStatusBadges } from "@/components/orders/order-status-badge";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  await requireAdminPage();
  const stats = await getDashboardStats();
  const cards = [
    { label: "Revenue (paid orders)", value: formatPrice(stats.revenueCents) },
    { label: "Paid orders", value: String(stats.paidOrders) },
    { label: "To fulfil", value: String(stats.toFulfil), href: "/admin/orders?status=paid" },
    { label: "Awaiting payment", value: String(stats.pendingOrders), href: "/admin/orders?status=pending" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</p>
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/20">
              {body}
            </Link>
          ) : (
            <div key={c.label} className="rounded-2xl border bg-card p-5">
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Recent orders</h2>
            <Link href="/admin/orders" className="text-sm font-medium hover:underline">View all</Link>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="divide-y">
              {stats.recentOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">{formatOrderNumber(o.order_number)}</Link>
                    <p className="text-xs text-muted-foreground">{o.customer_email}</p>
                  </div>
                  <OrderStatusBadges status={o.status} paymentStatus={o.payment_status} />
                  <span className="tabular-nums">{formatPrice(o.total_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-6">
          <h2 className="mb-4 font-semibold">Low stock</h2>
          {stats.lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">All active products are well stocked.</p>
          ) : (
            <ul className="space-y-3">
              {stats.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/admin/products/${p.id}`} className="truncate hover:underline">{p.name}</Link>
                  <span className={p.stock_quantity === 0 ? "font-medium text-destructive" : "font-medium text-amber-700"}>
                    {p.stock_quantity === 0 ? "Out" : p.stock_quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
