"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adjustStock, setProductActive } from "@/lib/admin/actions";
import { useActionToast } from "@/components/forms";
import type { FormState } from "@/lib/action-result";

export function ActiveToggle({ productId, active, name }: { productId: string; active: boolean; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label={`${active ? "Deactivate" : "Activate"} ${name}`}
      onCheckedChange={(checked) =>
        startTransition(async () => {
          const result = await setProductActive(productId, checked);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        })
      }
    />
  );
}

export function StockForm({ productId, stock }: { productId: string; stock: number }) {
  const [state, action, pending] = useActionState(adjustStock, {} as FormState);
  useActionToast(state);
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="productId" value={productId} />
      <Input
        name="stockQuantity"
        type="number"
        min={0}
        max={100000}
        step={1}
        defaultValue={stock}
        key={stock}
        aria-label="Stock quantity"
        className="h-8 w-20 tabular-nums"
      />
      <Button type="submit" size="icon-sm" variant="outline" disabled={pending} aria-label="Save stock">
        {pending ? <Loader2 className="animate-spin" /> : <Check />}
      </Button>
    </form>
  );
}
