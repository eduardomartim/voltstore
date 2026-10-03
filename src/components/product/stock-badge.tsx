import { cn } from "@/lib/utils";

export const LOW_STOCK_THRESHOLD = 5;

export function StockBadge({ stock, className }: { stock: number; className?: string }) {
  const state = stock <= 0 ? "out" : stock <= LOW_STOCK_THRESHOLD ? "low" : "in";
  const label = state === "out" ? "Out of stock" : state === "low" ? `Only ${stock} left` : "In stock";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        state === "out" && "text-muted-foreground",
        state === "low" && "text-amber-700",
        state === "in" && "text-success",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          state === "out" && "bg-muted-foreground",
          state === "low" && "bg-warning",
          state === "in" && "bg-success",
        )}
      />
      {label}
    </span>
  );
}
