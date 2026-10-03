import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { getCategories } from "@/lib/catalog";
import { CartButton } from "@/components/cart/cart-button";
import { SearchForm } from "@/components/layout/search-form";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";

export async function SiteHeader() {
  const [user, categories] = await Promise.all([getCurrentUser(), getCategories().catch(() => [])]);
  const nav = categories.slice(0, 5).map((c) => ({ href: `/products?category=${c.slug}`, label: c.name }));

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <MobileNav nav={nav} signedIn={Boolean(user)} admin={isAdmin(user)} />
        <Logo />
        <nav aria-label="Categories" className="ml-4 hidden items-center gap-1 xl:flex">
          <Link href="/products" className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground">
            All products
          </Link>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-56 md:block">
            <Suspense>
              <SearchForm />
            </Suspense>
          </div>
          {user ? (
            <UserMenu name={user.profile.full_name ?? user.email} email={user.email} admin={isAdmin(user)} />
          ) : (
            <Button asChild variant="ghost" size="lg" className="hidden sm:inline-flex">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
          <CartButton />
        </div>
      </div>
    </header>
  );
}
