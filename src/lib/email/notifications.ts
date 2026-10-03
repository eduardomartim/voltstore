import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";
import { sendEmail } from "@/lib/email/send";
import {
  orderConfirmationEmail,
  orderStatusEmail,
  paymentFailedEmail,
  welcomeEmail,
  type EmailOrder,
} from "@/lib/email/templates";

async function loadOrder(orderId: string): Promise<(EmailOrder & { email: string }) | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("*, items:order_items(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    email: data.customer_email,
    orderNumber: data.order_number,
    status: data.status,
    paymentStatus: data.payment_status,
    totalCents: data.total_cents,
    items: data.items.map((i) => ({
      productName: i.product_name,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      subtotalCents: i.subtotal_cents,
    })),
  };
}

/**
 * Sends the order confirmation exactly once. The order row is "claimed" by
 * setting confirmation_email_sent_at with a conditional update before sending;
 * a concurrent or repeated call finds nothing to claim. If sending fails the
 * claim is released so an operator can retry.
 */
export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("orders")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("confirmation_email_sent_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return;

  const order = await loadOrder(orderId);
  if (!order) return;

  const result = await sendEmail(order.email, orderConfirmationEmail(order, siteUrl()));
  if (result.status === "failed") {
    await admin.from("orders").update({ confirmation_email_sent_at: null }).eq("id", orderId);
    throw new Error(`Order confirmation email failed: ${result.error}`);
  }
}

export async function sendPaymentFailed(orderId: string): Promise<void> {
  const order = await loadOrder(orderId);
  if (!order) return;
  const result = await sendEmail(order.email, paymentFailedEmail(order, siteUrl()));
  if (result.status === "failed") throw new Error(`Payment failed email failed: ${result.error}`);
}

export async function sendOrderStatusUpdate(orderId: string): Promise<void> {
  const order = await loadOrder(orderId);
  if (!order) return;
  const result = await sendEmail(order.email, orderStatusEmail(order, siteUrl()));
  if (result.status === "failed") throw new Error(`Order status email failed: ${result.error}`);
}

/** Sends the welcome email once per user, after their email is confirmed. */
export async function sendWelcomeOnce(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", userId)
    .is("welcome_email_sent_at", null)
    .select("email, full_name");
  const profile = claimed?.[0];
  if (!profile) return;

  const result = await sendEmail(profile.email, welcomeEmail({ name: profile.full_name, baseUrl: siteUrl() }));
  if (result.status === "failed") {
    await admin.from("profiles").update({ welcome_email_sent_at: null }).eq("id", userId);
  }
}
