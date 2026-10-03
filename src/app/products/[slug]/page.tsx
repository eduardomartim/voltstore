import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { formatPrice } from "@/lib/money";
import { ProductImage } from "@/components/product/product-image";
import { StockBadge } from "@/components/product/stock-badge";
import { ProductGrid } from "@/components/product/product-card";
import { AddToCart } from "@/components/cart/add-to-cart";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return product ? { title: product.name, description: product.description.slice(0, 160) } : { title: "Product not found" };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground">Products</Link>
        {product.category && (
          <>
            <ChevronRight className="size-4" />
            <Link href={`/products?category=${product.category.slug}`} className="hover:text-foreground">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <ProductImage src={product.image_url} alt={product.name} sizes="(min-width: 1024px) 50vw, 100vw" priority className="rounded-3xl" />

        <div className="flex flex-col gap-6 lg:py-4">
          <div className="space-y-3">
            {product.category && (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{product.category.name}</p>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{product.name}</h1>
            <div className="flex items-center gap-4">
              <p className="text-2xl font-semibold tabular-nums" data-testid="product-price">
                {formatPrice(product.price_cents)}
              </p>
              <StockBadge stock={product.stock_quantity} className="text-sm" />
            </div>

          </div>

          <p className="leading-relaxed text-pretty text-muted-foreground">{product.description}</p>

          <AddToCart productId={product.id} name={product.name} stock={product.stock_quantity} />

          <ul className="grid gap-3 rounded-2xl border p-5 text-sm">
            <li className="flex items-center gap-3"><Truck className="size-4 text-muted-foreground" /> Free shipping across Brazil</li>
            <li className="flex items-center gap-3"><RotateCcw className="size-4 text-muted-foreground" /> 30-day hassle-free returns</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-muted-foreground" /> Secure payment with Stripe</li>
          </ul>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">You may also like</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
