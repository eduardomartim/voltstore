import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/session";
import { listAllOrders } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/orders/order-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Orders" };

const FILTERS = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdminPage("/admin/orders");
  const { status: rawStatus } = await searchParams;
  const status = FILTERS.find((s) => s === rawStatus);
  const orders = await listAllOrders(status);

  return (
    <div className="space-y-4">
      <nav aria-label="Filter orders" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {[undefined, ...FILTERS].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/orders?status=${s}` : "/admin/orders"}
            aria-current={s === status ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm font-medium",
              s === status ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
            )}
          >
            {s ? ORDER_STATUS_LABEL[s] : "All"}
          </Link>
        ))}
      </nav>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Order</TableHead>
              <TableHead className="hidden md:table-cell">Customer</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Payment</TableHead>
              <TableHead className="pr-4 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-4">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                      {formatOrderNumber(o.order_number)}
                    </Link>
                    <p className="text-xs text-muted-foreground">{o.items.reduce((n, i) => n + i.quantity, 0)} item(s)</p>
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate md:table-cell">{o.customer_email}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {new Date(o.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <PaymentStatusBadge status={o.payment_status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{formatPrice(o.total_cents)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
