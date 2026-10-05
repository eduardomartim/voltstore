"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getCartProducts } from "@/lib/catalog";
import type { CartProduct } from "@/lib/cart/cart";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, StripeNotConfiguredError } from "@/lib/stripe/client";
import { buildCheckoutSessionParams } from "@/lib/stripe/checkout";
import { checkoutSchema, productIdsSchema } from "@/lib/validation/schemas";
import { siteUrl } from "@/lib/site";
import { GENERIC_ERROR } from "@/lib/action-result";

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code?: "UNAUTHENTICATED" | "STOCK" | "INVALID" | "UNAVAILABLE" };

/** Returns authoritative product data for the ids in the visitor's cart. */
export async function loadCartProducts(ids: unknown): Promise<CartProduct[]> {
  const parsed = productIdsSchema.safeParse(ids);
  if (!parsed.success) return [];
  return getCartProducts(parsed.data);
}

/** Maps errors raised by public.create_order() to safe customer-facing messages. */
function mapCreateOrderError(message: string): CheckoutResult {
  if (message.includes("INSUFFICIENT_STOCK")) {
    return {
      ok: false,
      code: "STOCK",
      error: "Some items are no longer available in the quantity you selected. Please review your cart.",
    };
  }
  if (message.includes("PRODUCT_UNAVAILABLE")) {
    return { ok: false, code: "STOCK", error: "A product in your cart is no longer available. Please review your cart." };
  }
  if (message.includes("TOO_MANY_PENDING_ORDERS")) {
    return {
      ok: false,
      error: "You have several unfinished checkouts. Complete one or wait a few minutes before trying again.",
    };
  }
  if (message.includes("INVALID_QUANTITY") || message.includes("INVALID_ITEMS")) {
    return { ok: false, code: "INVALID", error: "Your cart contains an invalid quantity." };
  }
  return { ok: false, error: GENERIC_ERROR };
}

/**
 * Creates a pending order and a Stripe Checkout Session.
 *
 * The client sends only product ids and quantities. Prices, names and totals
 * are read from the database inside create_order(), which also reserves stock
 * atomically. The order is marked as paid exclusively by the Stripe webhook.
 */
export async function startCheckout(input: unknown): Promise<CheckoutResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", error: "Please sign in to check out." };

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "INVALID", error: parsed.error.issues[0]?.message ?? "Invalid cart." };
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      console.error("[checkout] STRIPE_SECRET_KEY is not configured");
      return { ok: false, code: "UNAVAILABLE", error: "Payments are temporarily unavailable. Please try again later." };
    }
    throw error;
  }

  const admin = createAdminClient();
  const { data: orderId, error: createError } = await admin.rpc("create_order", {
    p_user_id: user.id,
    p_customer_email: user.email,
    p_items: parsed.data.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
  });
  if (createError || !orderId) {
    if (createError && !createError.message.match(/INSUFFICIENT_STOCK|PRODUCT_UNAVAILABLE|INVALID_|TOO_MANY_PENDING/)) {
      console.error("[checkout] create_order failed", { code: createError.code, message: createError.message });
    }
    return mapCreateOrderError(createError?.message ?? "");
  }

  let createdSessionId: string | null = null;
  try {
    const { data: order, error: loadError } = await admin
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("id", orderId)
      .single();
    if (loadError || !order) throw new Error(`Failed to load new order: ${loadError?.message}`);

    const params = buildCheckoutSessionParams(
      {
        id: order.id,
        orderNumber: order.order_number,
        customerEmail: order.customer_email,
        currency: order.currency,
        totalCents: order.total_cents,
        items: order.items.map((i) => ({
          productName: i.product_name,
          productImageUrl: i.product_image_url,
          unitPriceCents: i.unit_price_cents,
          quantity: i.quantity,
        })),
      },
      siteUrl(),
    );

    const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout-order-${order.id}` });
    createdSessionId = session.id;
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");

    const { error: updateError } = await admin
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);
    if (updateError) throw new Error(`Failed to store checkout session: ${updateError.message}`);

    return { ok: true, url: session.url };
  } catch (error) {
    // If Stripe already created a session, expire it so the customer cannot pay
    // for an order we are about to cancel.
    if (createdSessionId) {
      await stripe.checkout.sessions.expire(createdSessionId).catch((expireError: unknown) =>
        console.error("[checkout] failed to expire orphaned Checkout Session", {
          orderId,
          error: expireError instanceof Error ? expireError.message : String(expireError),
        }),
      );
    }
    // Release the stock reserved for this order so it does not stay locked.
    await admin.rpc("release_pending_order", { p_order_id: orderId });
    console.error("[checkout] failed to create Stripe Checkout Session", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "We couldn't start the payment. Please try again in a moment." };
  }
}
