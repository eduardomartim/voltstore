import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/orders/status";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "Placed" },
  { status: "paid", label: "Paid" },
  { status: "processing", label: "Processing" },
  { status: "shipped", label: "Shipped" },
  { status: "delivered", label: "Delivered" },
];

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <p className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        This order was cancelled. Any reserved stock was released.
      </p>
    );
  }
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Order progress">
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step.status} className="flex flex-col items-center gap-2 text-center">
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full border text-xs font-semibold",
                done ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground",
              )}
              aria-hidden
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={cn("text-xs", done ? "font-medium" : "text-muted-foreground")}>
              {step.label}
              {done && <span className="sr-only"> (completed)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
