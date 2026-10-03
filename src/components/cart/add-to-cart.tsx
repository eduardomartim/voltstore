"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { useCart } from "@/components/cart/cart-provider";
import { maxAllowedQuantity } from "@/lib/cart/cart";

export function AddToCart({ productId, name, stock }: { productId: string; name: string; stock: number }) {
  const { lines, add } = useCart();
  const router = useRouter();
  const inCart = lines.find((l) => l.productId === productId)?.quantity ?? 0;
  const max = maxAllowedQuantity(stock);
  const remaining = Math.max(0, max - inCart);
  const [quantity, setQuantity] = useState(1);

  if (max === 0) {
    return (
      <Button size="lg" className="h-12 w-full text-base" disabled>
        Out of stock
      </Button>
    );
  }

  const handleAdd = () => {
    const qty = Math.min(quantity, remaining);
    if (qty <= 0) {
      toast.info("You already have the maximum available quantity in your cart.");
      return;
    }
    add(productId, qty, stock);
    setQuantity(1);
    toast.success(`${name} added to cart`, {
      action: { label: "View cart", onClick: () => router.push("/cart") },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <QuantityStepper value={Math.min(quantity, Math.max(1, remaining))} min={1} max={Math.max(1, remaining)} onChange={setQuantity} disabled={remaining === 0} />
        <Button size="lg" className="h-12 flex-1 text-base" onClick={handleAdd} disabled={remaining === 0}>
          <ShoppingBag className="size-5" />
          Add to cart
        </Button>
      </div>
      {inCart > 0 && (
        <p className="text-sm text-muted-foreground">
          {inCart} in your cart ·{" "}
          <Link href="/cart" className="font-medium text-foreground underline underline-offset-4">
            View cart
          </Link>
        </p>
      )}
    </div>
  );
}
