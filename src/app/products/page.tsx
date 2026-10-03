import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { getCategories, listProducts } from "@/lib/catalog";
import { catalogQuerySchema } from "@/lib/validation/schemas";
import { ProductGrid } from "@/components/product/product-card";
import { SortSelect } from "@/components/product/sort-select";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const raw = await searchParams;
  const query = catalogQuerySchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    category: typeof raw.category === "string" ? raw.category : undefined,
    sort: typeof raw.sort === "string" ? raw.sort : undefined,
  });

  const [categories, products] = await Promise.all([getCategories(), listProducts(query)]);
  const activeCategory = categories.find((c) => c.slug === query.category);

  const hrefFor = (category?: string) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (category) params.set("category", category);
    if (query.sort) params.set("sort", query.sort);
    const s = params.toString();
    return s ? `/products?${s}` : "/products";
  };

  const title = query.q ? `Results for “${query.q}”` : (activeCategory?.name ?? "All products");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {activeCategory && !query.q ? activeCategory.description : `${products.length} product${products.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter by category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ slug: undefined, name: "All" }, ...categories].map((c) => {
            const active = c.slug === query.category;
            return (
              <Link
                key={c.slug ?? "all"}
                href={hrefFor(c.slug)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
        <SortSelect value={query.sort ?? "newest"} />
      </div>

      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <EmptyState
          icon={SearchX}
          title="No products found"
          description={query.q ? "Try a different search term or browse all products." : "There are no products in this category yet."}
        >
          <Button asChild variant="outline">
            <Link href="/products">Clear filters</Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
