"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Loader2, Lock, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { ProductImage } from "@/components/product/product-image";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadCartProducts, startCheckout } from "@/lib/checkout/actions";
import { maxAllowedQuantity, summarizeCart, type CartIssue, type CartProduct } from "@/lib/cart/cart";
import { formatPrice } from "@/lib/money";

const ISSUE_TEXT: Record<CartIssue, string> = {
  unavailable: "This product is no longer available.",
  out_of_stock: "Out of stock — remove it to continue.",
  insufficient_stock: "Not enough stock for this quantity.",
};

export function CartView({ signedIn }: { signedIn: boolean }) {
  const { lines, ready, setQuantity, remove, clear } = useCart();
  const params = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<CartProduct[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckingOut, startTransition] = useTransition();

  const idsKey = useMemo(() => lines.map((l) => l.productId).sort().join(","), [lines]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];
    loadCartProducts(ids)
      .then((data) => {
        if (!cancelled) {
          setProducts(data);
          setLoadError(false);
        }
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [idsKey, ready]);

  useEffect(() => {
    if (params.get("checkout") === "cancelled") toast.info("Checkout cancelled. Your cart is still here.");
  }, [params]);

  if (!ready || (lines.length > 0 && products === null && !loadError)) return <CartSkeleton />;

  if (lines.length === 0) {
    return (
      <EmptyState icon={ShoppingBag} title="Your cart is empty" description="Browse the catalog and add something you love.">
        <Button asChild size="lg">
          <Link href="/products">Start shopping</Link>
        </Button>
      </EmptyState>
    );
  }

  if (loadError || !products) {
    return (
      <EmptyState icon={AlertCircle} title="We couldn't load your cart" description="Please check your connection and try again.">
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </EmptyState>
    );
  }

  const summary = summarizeCart(lines, products);

  const checkout = () => {
    setCheckoutError(null);
    startTransition(async () => {
      try {
        const result = await startCheckout({ items: lines });
        if (result.ok) {
          window.location.assign(result.url);
          return;
        }
        if (result.code === "UNAUTHENTICATED") {
          router.push("/sign-in?next=/cart");
          return;
        }
        setCheckoutError(result.error);
        if (result.code === "STOCK") setProducts(await loadCartProducts(lines.map((l) => l.productId)));
      } catch {
        setCheckoutError("We couldn't start the payment. Please try again.");
      }
    });
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <section aria-label="Cart items">
        <ul className="divide-y border-y">
          {summary.lines.map((line) => {
            const p = line.product;
            const max = p ? Math.max(1, maxAllowedQuantity(p.stockQuantity)) : 1;
            return (
              <li key={line.productId} className="flex gap-4 py-6" data-testid="cart-line">
                <Link href={p ? `/products/${p.slug}` : "#"} className="w-24 shrink-0 sm:w-32">
                  <ProductImage src={p?.imageUrl ?? null} alt={p?.name ?? "Unavailable product"} sizes="128px" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="font-medium">
                        {p ? <Link href={`/products/${p.slug}`} className="hover:underline">{p.name}</Link> : "Unavailable product"}
                      </h2>
                      {p && <p className="text-sm text-muted-foreground tabular-nums">{formatPrice(p.priceCents)} each</p>}
                    </div>
                    <p className="font-semibold tabular-nums">{formatPrice(line.lineTotalCents)}</p>
                  </div>
                  {line.issue && (
                    <p className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="size-4" /> {ISSUE_TEXT[line.issue]}
                      {line.issue === "insufficient_stock" && p && ` Only ${p.stockQuantity} available.`}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-4">
                    {p && p.isActive && p.stockQuantity > 0 ? (
                      <QuantityStepper
                        size="sm"
                        value={line.quantity}
                        max={max}
                        onChange={(q) => setQuantity(line.productId, q, p.stockQuantity)}
                        label={`Quantity for ${p.name}`}
                      />
                    ) : (
                      <span />
                    )}
                    <Button variant="ghost" size="sm" onClick={() => remove(line.productId)} className="text-muted-foreground">
                      <Trash2 /> Remove
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Button variant="link" className="mt-4 px-0 text-muted-foreground" onClick={clear}>
          Clear cart
        </Button>
      </section>

      <aside className="h-fit rounded-2xl border bg-card p-6 lg:sticky lg:top-24" aria-label="Order summary">
        <h2 className="mb-4 text-lg font-semibold">Order summary</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Items ({summary.itemCount})</dt>
            <dd className="tabular-nums">{formatPrice(summary.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>Free</dd>
          </div>
          <div className="flex justify-between border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums" data-testid="cart-total">{formatPrice(summary.totalCents)}</dd>
          </div>
        </dl>

        {checkoutError && (
          <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {checkoutError}
          </p>
        )}

        {signedIn ? (
          <Button size="lg" className="mt-6 h-12 w-full text-base" onClick={checkout} disabled={!summary.canCheckout || isCheckingOut}>
            {isCheckingOut ? <Loader2 className="animate-spin" /> : <Lock />}
            {isCheckingOut ? "Redirecting to Stripe…" : "Checkout"}
          </Button>
        ) : (
          <Button asChild size="lg" className="mt-6 h-12 w-full text-base">
            <Link href="/sign-in?next=/cart">Sign in to check out</Link>
          </Button>
        )}
        {!summary.canCheckout && (
          <p className="mt-3 text-center text-xs text-muted-foreground">Resolve the issues in your cart to continue.</p>
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Final prices and stock are confirmed on the server before payment.
        </p>
      </aside>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]" aria-busy="true" aria-label="Loading cart">
      <div className="space-y-6">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="size-24 rounded-xl sm:size-32" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
