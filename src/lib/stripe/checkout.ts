import type Stripe from "stripe";

export type CheckoutOrder = {
  id: string;
  orderNumber: number;
  customerEmail: string;
  currency: string;
  totalCents: number;
  items: { productName: string; productImageUrl: string | null; unitPriceCents: number; quantity: number }[];
};

/** Stripe requires Checkout Sessions to live at least 30 minutes. */
export const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60;

/**
 * Builds Checkout Session parameters from a persisted order. Line items are
 * derived from the order's server-side price snapshots — nothing here comes
 * from the client.
 */
export function buildCheckoutSessionParams(
  order: CheckoutOrder,
  baseUrl: string,
  now: Date = new Date(),
): Stripe.Checkout.SessionCreateParams {
  const lineTotal = order.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  if (order.items.length === 0 || lineTotal !== order.totalCents) {
    throw new Error("Order total does not match its line items.");
  }

  return {
    mode: "payment",
    customer_email: order.customerEmail,
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_number: String(order.orderNumber) },
    payment_intent_data: {
      metadata: { order_id: order.id, order_number: String(order.orderNumber) },
    },
    line_items: order.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: order.currency,
        unit_amount: item.unitPriceCents,
        product_data: {
          name: item.productName,
          ...(item.productImageUrl ? { images: [item.productImageUrl] } : {}),
        },
      },
    })),
    success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/cart?checkout=cancelled`,
    expires_at: Math.floor(now.getTime() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
    locale: "pt-BR",
  };
}
