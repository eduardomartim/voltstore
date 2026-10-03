import Link from "next/link";
import { ArrowRight, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { getCategories, getFeaturedProducts } from "@/lib/catalog";
import { ProductGrid } from "@/components/product/product-card";
import { ProductImage } from "@/components/product/product-image";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const [featured, categories] = await Promise.all([getFeaturedProducts(4), getCategories()]);
  const hero = featured[0];

  return (
    <>
      <section className="border-b bg-gradient-to-b from-muted/60 to-background">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-brand" /> New season setup essentials
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Gear that disappears into your flow.
            </h1>
            <p className="max-w-lg text-lg text-pretty text-muted-foreground">
              Keyboards, mice, audio and displays chosen for how they feel after eight hours — not how they look on a
              spec sheet.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-5">
                <Link href="/products">
                  Shop all products <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <Link href="/products?category=keyboards">Explore keyboards</Link>
              </Button>
            </div>
          </div>
          {hero && (
            <Link href={`/products/${hero.slug}`} className="group relative block">
              <ProductImage
                src={hero.image_url}
                alt={hero.name}
                sizes="(min-width: 1024px) 50vw, 100vw"
                priority
                className="aspect-[4/3] rounded-3xl shadow-xl shadow-black/5"
              />
              <div className="absolute right-4 bottom-4 left-4 flex items-center justify-between rounded-2xl bg-background/90 px-4 py-3 shadow-sm backdrop-blur">
                <span className="truncate text-sm font-medium">{hero.name}</span>
                <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">Shop by category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${c.slug}`}
              className="group rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/50"
            >
              <span className="flex items-center justify-between font-medium">
                {c.name}
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{c.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Featured</h2>
            <p className="text-sm text-muted-foreground">Staff picks from this month&apos;s catalog.</p>
          </div>
          <Link href="/products" className="text-sm font-medium underline-offset-4 hover:underline">
            View all
          </Link>
        </div>
        <ProductGrid products={featured} />
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
        <div className="grid gap-6 rounded-3xl border bg-muted/40 p-8 sm:grid-cols-3">
          {[
            { icon: Truck, title: "Free shipping", text: "On every order, delivered across Brazil." },
            { icon: RotateCcw, title: "30-day returns", text: "Changed your mind? Send it back, no questions." },
            { icon: ShieldCheck, title: "Secure checkout", text: "Payments processed by Stripe. We never see your card." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background shadow-sm">
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
