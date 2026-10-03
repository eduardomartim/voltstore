import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { getOrder } from "@/lib/orders/queries";
import { allowedNextStatuses, formatOrderNumber } from "@/lib/orders/status";
import { OrderItemsList } from "@/components/orders/order-items-list";
import { OrderStatusBadges } from "@/components/orders/order-status-badge";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { OrderStatusForm } from "@/components/admin/order-status-form";

export const metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  await requireAdminPage(`/admin/orders/${id}`);
  const order = await getOrder(id);
  if (!order) notFound();

  const nextStatuses = allowedNextStatuses(order.status, order.payment_status).filter((s) => s !== "paid");
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Order {formatOrderNumber(order.order_number)}</h2>
        <OrderStatusBadges status={order.status} paymentStatus={order.payment_status} />
      </div>
      <OrderTimeline status={order.status} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border bg-card p-6">
          <OrderItemsList order={order} />
        </div>
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <h3 className="mb-3 font-semibold">Update status</h3>
            {nextStatuses.length > 0 ? (
              <OrderStatusForm orderId={order.id} options={nextStatuses} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {order.status === "pending"
                  ? "Waiting for Stripe to confirm payment."
                  : "This order is in a final state."}
              </p>
            )}
          </section>
          <section className="rounded-2xl border bg-card p-6 text-sm">
            <h3 className="mb-3 font-semibold">Details</h3>
            <dl className="space-y-2">
              <div>
                <dt className="text-muted-foreground">Customer</dt>
                <dd className="break-all">{order.customer_email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{fmt(order.created_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Paid at</dt>
                <dd>{fmt(order.paid_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Stripe Checkout Session</dt>
                <dd className="font-mono text-xs break-all">{order.stripe_checkout_session_id ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Stripe PaymentIntent</dt>
                <dd className="font-mono text-xs break-all">{order.stripe_payment_intent_id ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
