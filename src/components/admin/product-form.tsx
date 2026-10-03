"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { saveProduct } from "@/lib/admin/actions";
import type { FormState } from "@/lib/action-result";

type ProductValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  priceCents: number;
  stockQuantity: number;
  imageUrl: string;
  isActive: boolean;
  isFeatured: boolean;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function ProductForm({
  product,
  categories,
}: {
  product?: ProductValues;
  categories: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveProduct.bind(null, product?.id ?? null), {} as FormState);
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_320px]" noValidate>
      <div className="space-y-5 rounded-2xl border bg-card p-6">
        <Field
          name="name"
          label="Name"
          defaultValue={product?.name}
          required
          error={errors.name}
          onChange={(e) => !slugTouched && setSlug(slugify(e.target.value))}
        />
        <Field
          name="slug"
          label="Slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          required
          error={errors.slug}
          hint="Used in the product URL, e.g. /products/arc75-keyboard"
        />
        <div className="space-y-2">
          <Label htmlFor="field-description">Description</Label>
          <Textarea id="field-description" name="description" rows={6} defaultValue={product?.description} maxLength={4000} />
          {errors.description && <p className="text-sm text-destructive">{errors.description[0]}</p>}
        </div>
        <Field
          name="imageUrl"
          label="Image URL"
          type="url"
          defaultValue={product?.imageUrl}
          placeholder="https://images.unsplash.com/photo-…"
          error={errors.imageUrl}
          hint="Optional. Must be an images.unsplash.com URL."
        />
      </div>

      <div className="space-y-5">
        <div className="space-y-5 rounded-2xl border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="field-categoryId">Category</Label>
            <select
              id="field-categoryId"
              name="categoryId"
              defaultValue={product?.categoryId ?? ""}
              required
              aria-invalid={errors.categoryId ? true : undefined}
              className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
            >
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId[0]}</p>}
          </div>
          <Field
            name="price"
            label="Price (R$)"
            inputMode="decimal"
            defaultValue={product ? (product.priceCents / 100).toFixed(2).replace(".", ",") : ""}
            placeholder="899,90"
            required
            error={errors.price}
          />
          <Field
            name="stockQuantity"
            label="Stock quantity"
            type="number"
            min={0}
            step={1}
            defaultValue={product?.stockQuantity ?? 0}
            required
            error={errors.stockQuantity}
          />
        </div>

        <div className="space-y-4 rounded-2xl border bg-card p-6">
          <label className="flex items-center justify-between gap-4 text-sm font-medium">
            Active (visible in store)
            <Switch name="isActive" defaultChecked={product?.isActive ?? true} />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm font-medium">
            Featured on homepage
            <Switch name="isFeatured" defaultChecked={product?.isFeatured ?? false} />
          </label>
        </div>

        <FormMessage state={state} />
        <div className="flex gap-3">
          <SubmitButton className="flex-1" pendingText="Saving…">
            {product ? "Save changes" : "Create product"}
          </SubmitButton>
          <Button asChild variant="outline" size="lg" className="h-11">
            <Link href="/admin/products">Cancel</Link>
          </Button>
        </div>
      </div>
    </form>
  );
}
