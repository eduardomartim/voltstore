import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getOrderByCheckoutSession } from "@/lib/orders/queries";
import { formatOrderNumber } from "@/lib/orders/status";
import { OrderItemsList } from "@/components/orders/order-items-list";
import { OrderStatusBadges } from "@/components/orders/order-status-badge";
import { PaymentStatusPoller } from "@/components/orders/payment-status-poller";
import { ClearCartOnMount } from "@/components/cart/clear-cart-on-mount";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Order status" };

/**
 * Stripe redirects here after checkout. The redirect itself proves nothing:
 * the page only reports the order state written by the verified webhook.
 */
export default async function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const { session_id } = await searchParams;
  const sessionId = typeof session_id === "string" ? session_id : "";
  await requireUser(`/checkout/success?session_id=${encodeURIComponent(sessionId)}`);

  // RLS: only the owner (or an admin) can read this order.
  const order = sessionId ? await getOrderByCheckoutSession(sessionId) : null;

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState icon={XCircle} title="Order not found" description="We couldn't find an order for this checkout session in your account.">
          <Button asChild variant="outline">
            <Link href="/account/orders">View my orders</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const paid = order.payment_status === "paid";
  const failed = order.payment_status === "failed" || order.status === "cancelled";
  const pending = !paid && !failed;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {(paid || pending) && <ClearCartOnMount />}
      {pending && <PaymentStatusPoller />}

      <div className="mb-8 flex flex-col items-center text-center">
        {paid ? (
          <CheckCircle2 className="mb-4 size-14 text-success" aria-hidden />
        ) : failed ? (
          <XCircle className="mb-4 size-14 text-destructive" aria-hidden />
        ) : (
          <Clock className="mb-4 size-14 animate-pulse text-warning" aria-hidden />
        )}
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="order-status-heading">
          {paid ? "Thank you! Your order is confirmed." : failed ? "Payment not completed" : "Confirming your payment…"}
        </h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          {paid
            ? "We've received your payment and emailed your confirmation."
            : failed
              ? "This order was cancelled and you were not charged. Your items are back in stock."
              : "Stripe is confirming your payment. This page updates automatically — it usually takes a few seconds."}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Order</p>
            <p className="font-semibold">{formatOrderNumber(order.order_number)}</p>
          </div>
          <OrderStatusBadges status={order.status} paymentStatus={order.payment_status} />
        </div>
        <OrderItemsList order={order} />
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={`/account/orders/${order.id}`}>View order details</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
