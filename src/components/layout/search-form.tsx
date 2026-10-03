"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        router.push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
        onSubmitted?.();
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        name="q"
        type="search"
        placeholder="Search products"
        aria-label="Search products"
        defaultValue={params.get("q") ?? ""}
        maxLength={80}
        className="h-9 rounded-full bg-muted/60 pl-9"
      />
    </form>
  );
}
