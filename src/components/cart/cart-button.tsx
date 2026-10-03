"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-provider";

export function CartButton() {
  const { count, ready } = useCart();
  const label = ready && count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart";
  return (
    <Button asChild variant="ghost" size="icon-lg" className="relative rounded-full">
      <Link href="/cart" aria-label={label} data-testid="cart-button">
        <ShoppingBag className="size-5" />
        {ready && count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] leading-5 font-semibold text-brand-foreground tabular-nums"
            data-testid="cart-count"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
