import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { listAllProducts } from "@/lib/admin/queries";
import { formatPrice } from "@/lib/money";
import { ActiveToggle, StockForm } from "@/components/admin/product-row-controls";
import { SavedToast } from "@/components/admin/saved-toast";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdminPage("/admin/products");
  const [{ saved }, products] = await Promise.all([searchParams, listAllProducts()]);

  return (
    <div className="space-y-4">
      {saved === "1" && <SavedToast message="Product saved." path="/admin/products" />}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{products.length} products</p>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus /> New product
          </Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Product</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id} data-testid="admin-product-row">
                <TableCell className="max-w-64 pl-4">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">/{p.slug}</p>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{p.category?.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(p.price_cents)}</TableCell>
                <TableCell>
                  <StockForm productId={p.id} stock={p.stock_quantity} />
                </TableCell>
                <TableCell>
                  <ActiveToggle productId={p.id} active={p.is_active} name={p.name} />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/products/${p.id}`}>Edit</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
