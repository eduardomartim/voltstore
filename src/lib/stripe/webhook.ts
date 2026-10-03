import type Stripe from "stripe";

export type CheckoutOutcome = "paid" | "failed" | "expired";

export type CheckoutEventCommand = {
  eventId: string;
  eventType: string;
  orderId: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  outcome: CheckoutOutcome;
};

export type ApplyResult =
  | "processed"
  | "duplicate"
  | "ignored"
  | "amount_mismatch"
  | "order_not_found"
  | "paid_after_cancel";

export type WebhookDeps = {
  /** Atomically records the event id and applies the state transition. */
  applyCheckoutEvent: (command: CheckoutEventCommand) => Promise<ApplyResult>;
  onOrderPaid: (orderId: string) => Promise<void>;
  onPaymentFailed: (orderId: string) => Promise<void>;
  log?: (message: string, details?: Record<string, unknown>) => void;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const;

/**
 * Translates a verified Stripe event into an order command, or null when the
 * event is irrelevant (unknown type, unpaid completion awaiting an async
 * payment, missing/invalid order reference).
 */
export function toCheckoutCommand(event: Stripe.Event): CheckoutEventCommand | null {
  if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(event.type)) return null;

  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.order_id ?? session.client_reference_id ?? "";
  if (!UUID_RE.test(orderId)) return null;

  let outcome: CheckoutOutcome;
  switch (event.type) {
    case "checkout.session.completed":
      // Delayed payment methods complete checkout before funds arrive.
      if (session.payment_status !== "paid") return null;
      outcome = "paid";
      break;
    case "checkout.session.async_payment_succeeded":
      outcome = "paid";
      break;
    case "checkout.session.async_payment_failed":
      outcome = "failed";
      break;
    default:
      outcome = "expired";
  }

  const paymentIntent = session.payment_intent;
  return {
    eventId: event.id,
    eventType: event.type,
    orderId,
    sessionId: session.id,
    paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : (paymentIntent?.id ?? null),
    amountTotal: session.amount_total,
    currency: session.currency,
    outcome,
  };
}

/**
 * Processes a signature-verified event. Side effects (emails) only run when the
 * database reports a fresh transition, so redelivered or duplicate events never
 * fulfil an order twice. Throws if the database write fails so Stripe retries.
 */
export async function processStripeEvent(
  event: Stripe.Event,
  deps: WebhookDeps,
): Promise<ApplyResult | "unhandled"> {
  const command = toCheckoutCommand(event);
  if (!command) return "unhandled";

  const result = await deps.applyCheckoutEvent(command);

  if (result === "amount_mismatch" || result === "order_not_found" || result === "paid_after_cancel") {
    deps.log?.(`[stripe-webhook] ${result} — needs manual review`, {
      eventId: command.eventId,
      orderId: command.orderId,
    });
  }

  if (result === "processed") {
    try {
      if (command.outcome === "paid") await deps.onOrderPaid(command.orderId);
      else if (command.outcome === "failed") await deps.onPaymentFailed(command.orderId);
    } catch (error) {
      // Payment state is already committed; a notification failure must not
      // make Stripe retry (the event is recorded and would be skipped anyway).
      deps.log?.("[stripe-webhook] post-processing failed", {
        eventId: command.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
