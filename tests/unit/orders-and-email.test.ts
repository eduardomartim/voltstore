import { describe, expect, it } from "vitest";
import { allowedNextStatuses, canTransition, formatOrderNumber } from "@/lib/orders/status";
import { escapeHtml, orderConfirmationEmail, type EmailOrder } from "@/lib/email/templates";
import { formatPrice } from "@/lib/money";

describe("order lifecycle", () => {
  it("cannot fulfil an unpaid order", () => {
    expect(canTransition("pending", "shipped", "pending")).toBe(false);
    expect(canTransition("pending", "processing", "pending")).toBe(false);
    expect(allowedNextStatuses("pending", "pending")).toEqual(["cancelled"]);
  });

  it("follows paid -> processing -> shipped -> delivered", () => {
    expect(canTransition("paid", "processing", "paid")).toBe(true);
    expect(canTransition("processing", "shipped", "paid")).toBe(true);
    expect(canTransition("shipped", "delivered", "paid")).toBe(true);
  });

  it("treats delivered and cancelled as final and forbids going backwards", () => {
    expect(allowedNextStatuses("delivered", "paid")).toEqual([]);
    expect(allowedNextStatuses("cancelled", "paid")).toEqual([]);
    expect(canTransition("shipped", "processing", "paid")).toBe(false);
    expect(canTransition("shipped", "cancelled", "paid")).toBe(false);
  });

  it("formats order numbers", () => {
    expect(formatOrderNumber(1001)).toBe("VL-1001");
  });
});

describe("money", () => {
  it("formats centavos as BRL", () => {
    expect(formatPrice(89900).replace(/\s/g, " ")).toBe("R$ 899,00");
    expect(formatPrice(129999).replace(/\s/g, " ")).toBe("R$ 1.299,99");
  });
});

describe("email templates", () => {
  const order: EmailOrder = {
    id: "6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b",
    orderNumber: 1042,
    status: "paid",
    paymentStatus: "paid",
    totalCents: 179800,
    items: [{ productName: '<img src=x onerror="alert(1)">', quantity: 2, unitPriceCents: 89900, subtotalCents: 179800 }],
  };

  it("escapes untrusted text", () => {
    expect(escapeHtml(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;&#39;");
  });

  it("includes order number, products, total and payment status without injecting HTML", () => {
    const email = orderConfirmationEmail(order, "https://shop.test");
    expect(email.subject).toContain("VL-1042");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(email.html).not.toContain("<img src=x");
    expect(email.text).toContain("Payment: Paid");
    expect(email.text).toContain(formatPrice(179800));
    expect(email.html).toContain(`https://shop.test/account/orders/${order.id}`);
  });
});
