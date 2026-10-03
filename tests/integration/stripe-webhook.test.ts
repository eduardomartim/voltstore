/**
 * Integration test: Stripe webhook route + real local Supabase database.
 * Requires `npx supabase start` and .env.local (see README). Skipped otherwise.
 */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/types/database";

const sendEmail = vi.fn(async () => ({ status: "skipped" as const, reason: "test" }));
vi.mock("@/lib/email/send", () => ({ sendEmail }));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = "whsec_integration_test_only";
const enabled = Boolean(SUPABASE_URL && SERVICE_KEY);

describe.skipIf(!enabled)("POST /api/webhooks/stripe (integration)", () => {
  const admin = createClient<Database>(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  let POST: (req: Request) => Promise<Response>;
  let userId: string;
  let product: Database["public"]["Tables"]["products"]["Row"];

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    ({ POST } = await import("@/app/api/webhooks/stripe/route"));

    const { data, error } = await admin.auth.admin.createUser({
      email: `webhook-${Date.now()}@voltline.test`,
      password: `pw-${crypto.randomUUID()}`,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    const { data: p } = await admin.from("products").select("*").eq("slug", "nexus-8-in-1-usb-c-hub").single();
    product = p!;
  });

  afterAll(async () => {
    if (!userId) return;
    await admin.from("orders").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  beforeEach(() => sendEmail.mockClear());

  async function createOrder(quantity = 2) {
    const { data: orderId, error } = await admin.rpc("create_order", {
      p_user_id: userId,
      p_customer_email: "buyer@voltline.test",
      p_items: [{ product_id: product.id, quantity }],
    });
    if (error) throw error;
    const sessionId = `cs_test_${crypto.randomUUID().replace(/-/g, "")}`;
    await admin.from("orders").update({ stripe_checkout_session_id: sessionId }).eq("id", orderId!);
    return { orderId: orderId!, sessionId };
  }

  function signedRequest(event: object, secret = WEBHOOK_SECRET) {
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    return new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      body: payload,
    });
  }

  function sessionEvent(type: string, orderId: string, sessionId: string, amount: number, eventId = `evt_${crypto.randomUUID()}`) {
    return {
      id: eventId,
      object: "event",
      type,
      data: {
        object: {
          id: sessionId,
          object: "checkout.session",
          payment_status: type === "checkout.session.expired" ? "unpaid" : "paid",
          payment_intent: "pi_test_123",
          amount_total: amount,
          currency: "brl",
          client_reference_id: orderId,
          metadata: { order_id: orderId },
        },
      },
    };
  }

  const stockOf = async () =>
    (await admin.from("products").select("stock_quantity").eq("id", product.id).single()).data!.stock_quantity;

  it("rejects requests without a valid signature", async () => {
    const unsigned = new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" });
    expect((await POST(unsigned)).status).toBe(400);

    const forged = signedRequest({ id: "evt_forged", type: "checkout.session.completed" }, "whsec_attacker");
    expect((await POST(forged)).status).toBe(400);
  });

  it("creates orders with server-side prices and reserves stock", async () => {
    const before = await stockOf();
    const { orderId } = await createOrder(2);
    const { data: order } = await admin.from("orders").select("*, items:order_items(*)").eq("id", orderId).single();

    expect(order!.total_cents).toBe(product.price_cents * 2);
    expect(order!.items[0].unit_price_cents).toBe(product.price_cents);
    expect(order!.status).toBe("pending");
    expect(await stockOf()).toBe(before - 2);
  });

  it("marks the order paid once and sends one confirmation, even if Stripe redelivers", async () => {
    const { orderId, sessionId } = await createOrder(1);
    const event = sessionEvent("checkout.session.completed", orderId, sessionId, product.price_cents);

    const first = await POST(signedRequest(event));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ result: "processed" });

    const retry = await POST(signedRequest(event));
    expect(await retry.json()).toMatchObject({ result: "duplicate" });

    const otherEvent = sessionEvent("checkout.session.async_payment_succeeded", orderId, sessionId, product.price_cents);
    expect(await (await POST(signedRequest(otherEvent))).json()).toMatchObject({ result: "ignored" });

    const { data: order } = await admin.from("orders").select("*").eq("id", orderId).single();
    expect(order).toMatchObject({ status: "paid", payment_status: "paid", stripe_payment_intent_id: "pi_test_123" });
    expect(order!.confirmation_email_sent_at).not.toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not mark an order paid when the amount does not match", async () => {
    const { orderId, sessionId } = await createOrder(1);
    const res = await POST(signedRequest(sessionEvent("checkout.session.completed", orderId, sessionId, 100)));
    expect(await res.json()).toMatchObject({ result: "amount_mismatch" });
    const { data: order } = await admin.from("orders").select("payment_status").eq("id", orderId).single();
    expect(order!.payment_status).toBe("pending");
  });

  it("cancels expired checkouts and releases reserved stock", async () => {
    const before = await stockOf();
    const { orderId, sessionId } = await createOrder(3);
    expect(await stockOf()).toBe(before - 3);

    const res = await POST(signedRequest(sessionEvent("checkout.session.expired", orderId, sessionId, product.price_cents * 3)));
    expect(await res.json()).toMatchObject({ result: "processed" });

    const { data: order } = await admin.from("orders").select("status").eq("id", orderId).single();
    expect(order!.status).toBe("cancelled");
    expect(await stockOf()).toBe(before);
  });
});
