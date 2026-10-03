import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orders/status";

const ORDER_TONE: Record<OrderStatus, string> = {
  pending: "bg-warning/15 text-amber-800 border-warning/30",
  paid: "bg-brand/10 text-brand border-brand/20",
  processing: "bg-brand/10 text-brand border-brand/20",
  shipped: "bg-brand/10 text-brand border-brand/20",
  delivered: "bg-success/15 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground",
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  paid: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  refunded: "bg-muted text-muted-foreground",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", ORDER_TONE[status])} data-testid="order-status">
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", PAYMENT_TONE[status])} data-testid="payment-status">
      Payment: {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function OrderStatusBadges({ status, paymentStatus }: { status: OrderStatus; paymentStatus: PaymentStatus }) {
  return (
    <div className="flex flex-wrap gap-2">
      <OrderStatusBadge status={status} />
      <PaymentStatusBadge status={paymentStatus} />
    </div>
  );
}
