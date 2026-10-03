import Link from "next/link";
import type { ProductWithCategory } from "@/lib/catalog";
import { formatPrice } from "@/lib/money";
import { ProductImage } from "@/components/product/product-image";
import { StockBadge } from "@/components/product/stock-badge";

export function ProductCard({ product, priority }: { product: ProductWithCategory; priority?: boolean }) {
  const soldOut = product.stock_quantity <= 0;
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col gap-3 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      data-testid="product-card"
    >
      <div className="relative">
        <ProductImage
          src={product.image_url}
          alt={product.name}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          priority={priority}
          className={soldOut ? "opacity-60" : undefined}
        />
        {soldOut && (
          <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm">
            Sold out
          </span>
        )}
      </div>
      <div className="space-y-1 px-0.5">
        {product.category && (
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{product.category.name}</p>
        )}
        <h3 className="line-clamp-2 leading-snug font-medium group-hover:underline group-hover:underline-offset-4">
          {product.name}
        </h3>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="font-semibold tabular-nums">{formatPrice(product.price_cents)}</span>
          <StockBadge stock={product.stock_quantity} />
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductWithCategory[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < 4} />
      ))}
    </div>
  );
}
