import Stripe from "stripe";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { processStripeEvent, type ApplyResult } from "@/lib/stripe/webhook";
import { sendOrderConfirmation, sendPaymentFailed } from "@/lib/email/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the single source of truth for payment confirmation.
 * 1. Reads the raw body (required for signature verification).
 * 2. Verifies the Stripe-Signature header; rejects anything invalid with 400.
 * 3. Applies the event in one DB transaction that also records the event id,
 *    so redeliveries are detected and never fulfil an order twice.
 */
export async function POST(request: Request) {
  const secret = serverEnv.stripeWebhookSecret;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const result = await processStripeEvent(event, {
      applyCheckoutEvent: async (cmd) => {
        const { data, error } = await admin.rpc("apply_checkout_event", {
          p_event_id: cmd.eventId,
          p_event_type: cmd.eventType,
          p_order_id: cmd.orderId,
          p_session_id: cmd.sessionId,
          p_payment_intent_id: cmd.paymentIntentId ?? "",
          p_amount_total: cmd.amountTotal ?? -1,
          p_currency: cmd.currency ?? "",
          p_outcome: cmd.outcome,
        });
        if (error) throw new Error(`apply_checkout_event failed: ${error.message}`);
        return data as ApplyResult;
      },
      onOrderPaid: sendOrderConfirmation,
      onPaymentFailed: sendPaymentFailed,
      log: (message, details) => console.warn(message, details),
    });

    return NextResponse.json({ received: true, result });
  } catch (error) {
    console.error("[stripe-webhook] processing failed", {
      eventId: event.id,
      type: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
    // 500 makes Stripe retry; the event was not recorded because the
    // transaction rolled back.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
