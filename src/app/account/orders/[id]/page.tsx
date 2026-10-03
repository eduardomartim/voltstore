import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getOrder } from "@/lib/orders/queries";
import { formatOrderNumber } from "@/lib/orders/status";
import { OrderItemsList } from "@/components/orders/order-items-list";
import { OrderStatusBadges } from "@/components/orders/order-status-badge";
import { OrderTimeline } from "@/components/orders/order-timeline";

export const metadata: Metadata = { title: "Order details" };

export default async function OrderDetailPage({ params }: PageProps<"/account/orders/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/account/orders/${id}`);
  const order = await getOrder(id);
  // RLS already hides other customers' orders; the explicit ownership check
  // also keeps admins on the admin view for orders that are not theirs.
  if (!order || order.user_id !== user.id) notFound();

  return (
    <div className="space-y-6">
      <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Order {formatOrderNumber(order.order_number)}</h2>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.created_at).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}
          </p>
        </div>
        <OrderStatusBadges status={order.status} paymentStatus={order.payment_status} />
      </div>
      <OrderTimeline status={order.status} />
      <div className="rounded-2xl border bg-card p-6">
        <OrderItemsList order={order} />
      </div>
    </div>
  );
}
