import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { buildCheckoutSessionParams, CHECKOUT_SESSION_TTL_SECONDS, type CheckoutOrder } from "@/lib/stripe/checkout";
import { processStripeEvent, toCheckoutCommand, type ApplyResult, type CheckoutEventCommand } from "@/lib/stripe/webhook";

const ORDER_ID = "6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";

const order: CheckoutOrder = {
  id: ORDER_ID,
  orderNumber: 1001,
  customerEmail: "ana@example.com",
  currency: "brl",
  totalCents: 2 * 89900 + 19900,
  items: [
    { productName: "Arc75", productImageUrl: "https://images.unsplash.com/photo-1", unitPriceCents: 89900, quantity: 2 },
    { productName: "Glide", productImageUrl: null, unitPriceCents: 19900, quantity: 1 },
  ],
};

describe("buildCheckoutSessionParams", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const params = buildCheckoutSessionParams(order, "https://shop.test", now);

  it("uses server-side price snapshots in BRL", () => {
    expect(params.line_items).toEqual([
      {
        quantity: 2,
        price_data: {
          currency: "brl",
          unit_amount: 89900,
          product_data: { name: "Arc75", images: ["https://images.unsplash.com/photo-1"] },
        },
      },
      { quantity: 1, price_data: { currency: "brl", unit_amount: 19900, product_data: { name: "Glide" } } },
    ]);
  });

  it("links the session to the order through metadata", () => {
    expect(params.mode).toBe("payment");
    expect(params.client_reference_id).toBe(ORDER_ID);
    expect(params.metadata).toEqual({ order_id: ORDER_ID, order_number: "1001" });
    expect(params.customer_email).toBe("ana@example.com");
  });

  it("uses fixed redirect URLs and a 30 minute expiry", () => {
    expect(params.success_url).toBe("https://shop.test/checkout/success?session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://shop.test/cart?checkout=cancelled");
    expect(params.expires_at).toBe(Math.floor(now.getTime() / 1000) + CHECKOUT_SESSION_TTL_SECONDS);
  });

  it("refuses to build a session whose total does not match its items", () => {
    expect(() => buildCheckoutSessionParams({ ...order, totalCents: 1 }, "https://shop.test")).toThrow();
    expect(() => buildCheckoutSessionParams({ ...order, items: [], totalCents: 0 }, "https://shop.test")).toThrow();
  });
});

function checkoutEvent(
  type: string,
  session: Partial<Stripe.Checkout.Session> = {},
  id = "evt_123",
): Stripe.Event {
  return {
    id,
    object: "event",
    type,
    data: {
      object: {
        id: "cs_test_abc",
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: "pi_123",
        amount_total: order.totalCents,
        currency: "brl",
        metadata: { order_id: ORDER_ID },
        client_reference_id: ORDER_ID,
        ...session,
      },
    },
  } as unknown as Stripe.Event;
}

describe("toCheckoutCommand", () => {
  it("maps a paid checkout.session.completed to a paid command", () => {
    expect(toCheckoutCommand(checkoutEvent("checkout.session.completed"))).toEqual({
      eventId: "evt_123",
      eventType: "checkout.session.completed",
      orderId: ORDER_ID,
      sessionId: "cs_test_abc",
      paymentIntentId: "pi_123",
      amountTotal: order.totalCents,
      currency: "brl",
      outcome: "paid",
    });
  });

  it("waits for async payments instead of marking unpaid sessions as paid", () => {
    expect(toCheckoutCommand(checkoutEvent("checkout.session.completed", { payment_status: "unpaid" }))).toBeNull();
    expect(toCheckoutCommand(checkoutEvent("checkout.session.async_payment_succeeded"))?.outcome).toBe("paid");
    expect(toCheckoutCommand(checkoutEvent("checkout.session.async_payment_failed"))?.outcome).toBe("failed");
    expect(toCheckoutCommand(checkoutEvent("checkout.session.expired"))?.outcome).toBe("expired");
  });

  it("ignores unrelated events and sessions without a valid order reference", () => {
    expect(toCheckoutCommand(checkoutEvent("customer.created"))).toBeNull();
    expect(
      toCheckoutCommand(checkoutEvent("checkout.session.completed", { metadata: {}, client_reference_id: "1 OR 1=1" })),
    ).toBeNull();
  });
});

describe("processStripeEvent idempotency", () => {
  /** In-memory stand-in for apply_checkout_event(): event ledger + state guard. */
  function fakeDatabase() {
    const ledger = new Set<string>();
    let paymentStatus: "pending" | "paid" = "pending";
    return {
      apply: vi.fn(async (cmd: CheckoutEventCommand): Promise<ApplyResult> => {
        if (ledger.has(cmd.eventId)) return "duplicate";
        ledger.add(cmd.eventId);
        if (cmd.outcome !== "paid" || paymentStatus === "paid") return "ignored";
        paymentStatus = "paid";
        return "processed";
      }),
    };
  }

  it("fulfils an order exactly once across redeliveries and duplicate events", async () => {
    const db = fakeDatabase();
    const onOrderPaid = vi.fn(async () => {});
    const deps = { applyCheckoutEvent: db.apply, onOrderPaid, onPaymentFailed: vi.fn(async () => {}) };

    const completed = checkoutEvent("checkout.session.completed", {}, "evt_1");
    expect(await processStripeEvent(completed, deps)).toBe("processed");
    expect(await processStripeEvent(completed, deps)).toBe("duplicate"); // Stripe retry
    // A different event for the same, already-paid session.
    expect(await processStripeEvent(checkoutEvent("checkout.session.async_payment_succeeded", {}, "evt_2"), deps)).toBe("ignored");

    expect(onOrderPaid).toHaveBeenCalledTimes(1);
    expect(onOrderPaid).toHaveBeenCalledWith(ORDER_ID);
  });

  it("does not touch the database for unhandled events", async () => {
    const db = fakeDatabase();
    const result = await processStripeEvent(checkoutEvent("invoice.paid"), {
      applyCheckoutEvent: db.apply,
      onOrderPaid: vi.fn(),
      onPaymentFailed: vi.fn(),
    });
    expect(result).toBe("unhandled");
    expect(db.apply).not.toHaveBeenCalled();
  });

  it("propagates database failures so Stripe retries", async () => {
    await expect(
      processStripeEvent(checkoutEvent("checkout.session.completed"), {
        applyCheckoutEvent: async () => {
          throw new Error("db down");
        },
        onOrderPaid: vi.fn(),
        onPaymentFailed: vi.fn(),
      }),
    ).rejects.toThrow("db down");
  });

  it("does not fail the webhook when the confirmation email fails", async () => {
    const log = vi.fn();
    const result = await processStripeEvent(checkoutEvent("checkout.session.completed"), {
      applyCheckoutEvent: async () => "processed",
      onOrderPaid: async () => {
        throw new Error("smtp down");
      },
      onPaymentFailed: vi.fn(),
      log,
    });
    expect(result).toBe("processed");
    expect(log).toHaveBeenCalled();
  });
});

describe("Stripe signature verification", () => {
  const secret = "whsec_unit_test_secret";
  const payload = JSON.stringify(checkoutEvent("checkout.session.completed"));

  it("accepts a correctly signed payload", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(Stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_123");
  });

  it("rejects a tampered payload or wrong secret", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const tampered = payload.replace(String(order.totalCents), "1");
    expect(() => Stripe.webhooks.constructEvent(tampered, header, secret)).toThrow();
    expect(() => Stripe.webhooks.constructEvent(payload, header, "whsec_other")).toThrow();
  });
});
