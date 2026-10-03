import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { Suspense } from "react";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">Your cart</h1>
      <Suspense>
        <CartView signedIn={Boolean(user)} />
      </Suspense>
    </div>
  );
}
