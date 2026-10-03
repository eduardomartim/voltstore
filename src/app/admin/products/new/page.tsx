import { requireAdminPage } from "@/lib/auth/session";
import { getCategories } from "@/lib/catalog";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdminPage("/admin/products/new");
  const categories = await getCategories();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">New product</h2>
      <ProductForm categories={categories} />
    </div>
  );
}
