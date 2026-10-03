import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CartProduct } from "@/lib/cart/cart";
import type { Database } from "@/lib/types/database";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type ProductWithCategory = Product & { category: Pick<Category, "name" | "slug"> | null };

export type CatalogQuery = {
  q?: string;
  category?: string;
  sort?: "newest" | "price-asc" | "price-desc" | "name";
};

const PRODUCT_SELECT = "*, category:categories(name, slug)";

/** Keeps letters, digits, spaces and dashes so the term is safe inside a PostgREST filter. */
export function sanitizeSearchTerm(q: string): string {
  return q
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  return data;
}

/** Active products only (RLS also hides inactive ones from non-admins). */
export async function listProducts(query: CatalogQuery = {}): Promise<ProductWithCategory[]> {
  const supabase = await createClient();
  let request = supabase.from("products").select(PRODUCT_SELECT).eq("is_active", true);

  if (query.category) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", query.category)
      .maybeSingle();
    if (!category) return [];
    request = request.eq("category_id", category.id);
  }

  const term = query.q ? sanitizeSearchTerm(query.q) : "";
  if (term) request = request.or(`name.ilike.%${term}%,description.ilike.%${term}%`);

  switch (query.sort) {
    case "price-asc":
      request = request.order("price_cents", { ascending: true });
      break;
    case "price-desc":
      request = request.order("price_cents", { ascending: false });
      break;
    case "name":
      request = request.order("name");
      break;
    default:
      request = request.order("created_at", { ascending: false }).order("name");
  }

  const { data, error } = await request.limit(60);
  if (error) throw new Error(`Failed to load products: ${error.message}`);
  return data as ProductWithCategory[];
}

export async function getFeaturedProducts(limit = 4): Promise<ProductWithCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load featured products: ${error.message}`);
  return data as ProductWithCategory[];
}

export async function getProductBySlug(slug: string): Promise<ProductWithCategory | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Failed to load product: ${error.message}`);
  return data as ProductWithCategory | null;
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<ProductWithCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("category_id", product.category_id)
    .neq("id", product.id)
    .limit(limit);
  return (data ?? []) as ProductWithCategory[];
}

export function toCartProduct(p: Product): CartProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    priceCents: p.price_cents,
    imageUrl: p.image_url,
    stockQuantity: p.stock_quantity,
    isActive: p.is_active,
  };
}

/** Authoritative product data for the given ids (inactive products are omitted). */
export async function getCartProducts(ids: string[]): Promise<CartProduct[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .in("id", ids)
    .eq("is_active", true);
  if (error) throw new Error(`Failed to load cart products: ${error.message}`);
  return data.map(toCartProduct);
}
