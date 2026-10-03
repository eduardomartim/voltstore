import type { Database } from "@/lib/types/database";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

/** Mirrors the transitions enforced by the guard_order_status_change() trigger. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["cancelled"],
  paid: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function allowedNextStatuses(status: OrderStatus, paymentStatus: PaymentStatus): OrderStatus[] {
  return TRANSITIONS[status].filter((next) => next === "cancelled" || paymentStatus === "paid");
}

export function canTransition(from: OrderStatus, to: OrderStatus, paymentStatus: PaymentStatus): boolean {
  return allowedNextStatuses(from, paymentStatus).includes(to);
}

export function formatOrderNumber(orderNumber: number): string {
  return `VL-${orderNumber}`;
}
