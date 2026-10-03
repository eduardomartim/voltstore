"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, useActionToast } from "@/components/forms";
import { updateOrderStatus } from "@/lib/admin/actions";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import type { FormState } from "@/lib/action-result";

export function OrderStatusForm({ orderId, options }: { orderId: string; options: OrderStatus[] }) {
  const [state, action] = useActionState(updateOrderStatus, {} as FormState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="order-status" className="sr-only">
        New status
      </label>
      <select
        id="order-status"
        name="status"
        defaultValue={options[0]}
        className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {ORDER_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {state.error && <FormMessage state={state} />}
      <SubmitButton className="w-full" pendingText="Updating…">
        Update status
      </SubmitButton>
      <p className="text-xs text-muted-foreground">The customer is notified by email.</p>
    </form>
  );
}
