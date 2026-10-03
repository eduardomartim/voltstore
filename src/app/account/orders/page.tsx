import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listMyOrders } from "@/lib/orders/queries";
import { formatOrderNumber } from "@/lib/orders/status";
import { formatPrice } from "@/lib/money";
import { OrderStatusBadges } from "@/components/orders/order-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  const user = await requireUser("/account/orders");
  const orders = await listMyOrders(user.id);

  if (orders.length === 0) {
    return (
      <EmptyState icon={Package} title="No orders yet" description="When you place an order it will show up here.">
        <Button asChild>
          <Link href="/products">Start shopping</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-4" data-testid="orders-list">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={`/account/orders/${o.id}`}
            className="block rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/20"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{formatOrderNumber(o.order_number)}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString("pt-BR")} ·{" "}
                  {o.items.reduce((n, i) => n + i.quantity, 0)} item(s)
                </p>
              </div>
              <OrderStatusBadges status={o.status} paymentStatus={o.payment_status} />
              <p className="font-semibold tabular-nums">{formatPrice(o.total_cents)}</p>
            </div>
            <p className="mt-3 truncate text-sm text-muted-foreground">{o.items.map((i) => i.product_name).join(", ")}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
