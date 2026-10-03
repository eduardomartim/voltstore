import { formatPrice } from "@/lib/money";
import { STORE_NAME } from "@/lib/site";
import {
  formatOrderNumber,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orders/status";

export type EmailContent = { subject: string; html: string; text: string };

export type EmailOrder = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  items: { productName: string; quantity: number; unitPriceCents: number; subtotalCents: number }[];
};

/** Escapes untrusted text (product names, customer names) before HTML interpolation. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
          <tr><td style="padding:24px 28px;border-bottom:1px solid #e4e4e7;font-weight:700;font-size:18px;letter-spacing:-0.01em;">${STORE_NAME}</td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(title)}</h1>
            ${body}
          </td></tr>
          <tr><td style="padding:20px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
            ${STORE_NAME} is a portfolio demo store. No real products are sold or shipped.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function itemsTable(order: EmailOrder): string {
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;">${escapeHtml(i.productName)} × ${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;text-align:right;">${formatPrice(i.subtotalCents)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0;">
    ${rows}
    <tr><td style="padding:12px 0 0;font-weight:700;">Total</td><td style="padding:12px 0 0;text-align:right;font-weight:700;">${formatPrice(order.totalCents)}</td></tr>
  </table>`;
}

function itemsText(order: EmailOrder): string {
  return [
    ...order.items.map((i) => `- ${i.productName} x${i.quantity}: ${formatPrice(i.subtotalCents)}`),
    `Total: ${formatPrice(order.totalCents)}`,
  ].join("\n");
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

function statusLine(order: EmailOrder): string {
  return `Order ${formatOrderNumber(order.orderNumber)} · Order status: ${ORDER_STATUS_LABEL[order.status]} · Payment: ${PAYMENT_STATUS_LABEL[order.paymentStatus]}`;
}

export function welcomeEmail(params: { name: string | null; baseUrl: string }): EmailContent {
  const greeting = params.name ? `Hi ${params.name},` : "Hi,";
  return {
    subject: `Welcome to ${STORE_NAME}`,
    html: layout(
      `Welcome to ${STORE_NAME}`,
      `<p style="font-size:14px;line-height:1.6;">${escapeHtml(greeting)}</p>
       <p style="font-size:14px;line-height:1.6;">Your email is confirmed and your account is ready. You can now check out, track your orders and manage your profile.</p>
       ${button(`${params.baseUrl}/products`, "Start shopping")}`,
    ),
    text: `${greeting}\n\nYour email is confirmed and your ${STORE_NAME} account is ready.\nStart shopping: ${params.baseUrl}/products`,
  };
}

/** Sent once, when the Stripe webhook confirms payment. */
export function orderConfirmationEmail(order: EmailOrder, baseUrl: string): EmailContent {
  const number = formatOrderNumber(order.orderNumber);
  const url = `${baseUrl}/account/orders/${order.id}`;
  return {
    subject: `Order ${number} confirmed — payment received`,
    html: layout(
      `Thanks for your order!`,
      `<p style="font-size:14px;line-height:1.6;">We received your payment and your order is confirmed. We'll email you again when it ships.</p>
       <p style="font-size:13px;color:#52525b;">${escapeHtml(statusLine(order))}</p>
       ${itemsTable(order)}
       ${button(url, "View order")}`,
    ),
    text: `Thanks for your order!\n\n${statusLine(order)}\n\n${itemsText(order)}\n\nWe'll email you again when it ships.\nView order: ${url}`,
  };
}

export function paymentFailedEmail(order: EmailOrder, baseUrl: string): EmailContent {
  const number = formatOrderNumber(order.orderNumber);
  return {
    subject: `Payment for order ${number} was not completed`,
    html: layout(
      `We couldn't confirm your payment`,
      `<p style="font-size:14px;line-height:1.6;">Your payment for order ${number} did not go through, so the order was cancelled and no money was taken. Your items are back in stock — you can try again any time.</p>
       <p style="font-size:13px;color:#52525b;">${escapeHtml(statusLine(order))}</p>
       ${itemsTable(order)}
       ${button(`${baseUrl}/cart`, "Return to store")}`,
    ),
    text: `Your payment for order ${number} did not go through, so the order was cancelled.\n\n${statusLine(order)}\n\n${itemsText(order)}\n\nReturn to store: ${baseUrl}/cart`,
  };
}

const STATUS_COPY: Partial<Record<OrderStatus, string>> = {
  processing: "We're preparing your items for shipment.",
  shipped: "Your order is on its way.",
  delivered: "Your order was delivered. Enjoy your new gear!",
  cancelled: "Your order was cancelled. If you were charged, a refund will be issued to your original payment method.",
};

export function orderStatusEmail(order: EmailOrder, baseUrl: string): EmailContent {
  const number = formatOrderNumber(order.orderNumber);
  const copy = STATUS_COPY[order.status] ?? "Your order status was updated.";
  const url = `${baseUrl}/account/orders/${order.id}`;
  return {
    subject: `Order ${number}: ${ORDER_STATUS_LABEL[order.status]}`,
    html: layout(
      `Order ${number} update`,
      `<p style="font-size:14px;line-height:1.6;">${escapeHtml(copy)}</p>
       <p style="font-size:13px;color:#52525b;">${escapeHtml(statusLine(order))}</p>
       ${itemsTable(order)}
       ${button(url, "View order")}`,
    ),
    text: `${copy}\n\n${statusLine(order)}\n\n${itemsText(order)}\n\nView order: ${url}`,
  };
}
