"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  disabled,
  size = "lg",
  label = "Quantity",
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "lg";
  label?: string;
}) {
  const btn = cn(
    "grid place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
    size === "lg" ? "size-12" : "size-8",
  );
  return (
    <div
      className={cn("inline-flex items-center rounded-lg border bg-background", disabled && "opacity-50")}
      role="group"
      aria-label={label}
    >
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label="Decrease quantity">
        <Minus className="size-4" />
      </button>
      <span className={cn("text-center font-medium tabular-nums", size === "lg" ? "w-8" : "w-6 text-sm")} aria-live="polite" data-testid="quantity-value">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity">
        <Plus className="size-4" />
      </button>
    </div>
  );
}
