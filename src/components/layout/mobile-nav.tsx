"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SearchForm } from "@/components/layout/search-form";
import { signOut } from "@/lib/auth/actions";

type NavItem = { href: string; label: string };

export function MobileNav({ nav, signedIn, admin }: { nav: NavItem[]; signedIn: boolean; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const linkClass = "rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="xl:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 max-w-[85vw]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <Suspense>
            <SearchForm onSubmitted={close} />
          </Suspense>
          <nav className="flex flex-col" aria-label="Mobile">
            <Link href="/products" onClick={close} className={linkClass}>
              All products
            </Link>
            {nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={close} className={linkClass}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col border-t pt-4">
            {signedIn ? (
              <>
                <Link href="/account" onClick={close} className={linkClass}>
                  Account
                </Link>
                <Link href="/account/orders" onClick={close} className={linkClass}>
                  Orders
                </Link>
                {admin && (
                  <Link href="/admin" onClick={close} className={linkClass}>
                    Admin
                  </Link>
                )}
                <form action={signOut}>
                  <button type="submit" className={`${linkClass} w-full text-left`}>
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/sign-in" onClick={close} className={linkClass}>
                  Sign in
                </Link>
                <Link href="/sign-up" onClick={close} className={linkClass}>
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
