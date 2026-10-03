import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/session";
import { getCategories } from "@/lib/catalog";
import { getProductForEdit } from "@/lib/admin/queries";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  await requireAdminPage(`/admin/products/${id}`);
  const [product, categories] = await Promise.all([getProductForEdit(id), getCategories()]);
  if (!product) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Edit {product.name}</h2>
        {product.is_active && (
          <Link href={`/products/${product.slug}`} className="text-sm font-medium hover:underline">
            View in store
          </Link>
        )}
      </div>
      <ProductForm
        categories={categories}
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          categoryId: product.category_id,
          priceCents: product.price_cents,
          stockQuantity: product.stock_quantity,
          imageUrl: product.image_url ?? "",
          isActive: product.is_active,
          isFeatured: product.is_featured,
        }}
      />
    </div>
  );
}
