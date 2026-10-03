import Link from "next/link";
import type { OrderWithItems } from "@/lib/orders/queries";
import { formatPrice } from "@/lib/money";
import { ProductImage } from "@/components/product/product-image";

/** Renders an order from its immutable item snapshots (not current product data). */
export function OrderItemsList({ order }: { order: OrderWithItems }) {
  return (
    <div>
      <ul className="divide-y">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-4 py-4">
            <ProductImage src={item.product_image_url} alt={item.product_name} sizes="64px" className="size-16 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.product_name}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {item.quantity} × {formatPrice(item.unit_price_cents)}
              </p>
            </div>
            <p className="font-medium tabular-nums">{formatPrice(item.subtotal_cents)}</p>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{formatPrice(order.subtotal_cents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd>Free</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPrice(order.total_cents)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function OrderLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Link href={`/account/orders/${id}`} className="font-medium hover:underline">
      {children}
    </Link>
  );
}
