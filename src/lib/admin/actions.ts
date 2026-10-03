"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin, ForbiddenError } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { sendOrderStatusUpdate } from "@/lib/email/notifications";
import { GENERIC_ERROR, type FormState } from "@/lib/action-result";
import {
  fieldErrors,
  orderStatusSchema,
  parsePriceToCents,
  productFormSchema,
  stockAdjustSchema,
} from "@/lib/validation/schemas";

/*
 * Every admin mutation is authorized twice:
 *   1. assertAdmin() here, on the server, before touching the database;
 *   2. RLS policies (is_admin()) on the tables, because these queries run with
 *      the admin's own session — never with the service-role key.
 */

const FORBIDDEN: FormState = { error: "You do not have permission to do that." };

async function guard(): Promise<FormState | null> {
  try {
    await assertAdmin();
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) return FORBIDDEN;
    throw error;
  }
}

function toInt(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return Number.NaN;
  return Number(value.trim());
}

export async function saveProduct(productId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const priceCents = parsePriceToCents(String(formData.get("price") ?? ""));
  const parsed = productFormSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId"),
    priceCents: priceCents ?? Number.NaN,
    stockQuantity: toInt(formData.get("stockQuantity")),
    imageUrl: formData.get("imageUrl") ?? "",
    isActive: formData.get("isActive") === "on",
    isFeatured: formData.get("isFeatured") === "on",
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    if (errors.priceCents) errors.price = errors.priceCents;
    return { error: "Please fix the highlighted fields.", fieldErrors: errors };
  }

  const v = parsed.data;
  const row = {
    name: v.name,
    slug: v.slug,
    description: v.description,
    category_id: v.categoryId,
    price_cents: v.priceCents,
    stock_quantity: v.stockQuantity,
    image_url: v.imageUrl,
    is_active: v.isActive,
    is_featured: v.isFeatured,
  };

  const supabase = await createClient();
  const { error } = productId
    ? await supabase.from("products").update(row).eq("id", productId)
    : await supabase.from("products").insert(row);

  if (error) {
    if (error.code === "23505") return { fieldErrors: { slug: ["This slug is already in use."] } };
    if (error.code === "42501") return FORBIDDEN;
    console.error("[admin] save product failed", { code: error.code, message: error.message });
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/", "layout");
  redirect("/admin/products?saved=1");
}

export async function setProductActive(productId: string, isActive: boolean): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { error: "Invalid product." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId)
    .select("id");
  if (error || !data?.length) return { error: error ? GENERIC_ERROR : "Product not found." };

  revalidatePath("/", "layout");
  return { ok: true, message: isActive ? "Product activated." : "Product deactivated." };
}

export async function adjustStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = stockAdjustSchema.safeParse({
    productId: formData.get("productId"),
    stockQuantity: toInt(formData.get("stockQuantity")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid stock quantity." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ stock_quantity: parsed.data.stockQuantity })
    .eq("id", parsed.data.productId)
    .select("id");
  if (error || !data?.length) return { error: error ? GENERIC_ERROR : "Product not found." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Stock updated." };
}

export async function updateOrderStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = orderStatusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Choose a valid status." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.orderId)
    .select("id");

  if (error) {
    if (error.message.includes("ORDER_NOT_PAID")) {
      return { error: "This order has not been paid yet, so it cannot be fulfilled." };
    }
    if (error.message.includes("INVALID_STATUS_TRANSITION")) {
      return { error: "That status change is not allowed for this order." };
    }
    console.error("[admin] update order status failed", { code: error.code, message: error.message });
    return { error: GENERIC_ERROR };
  }
  if (!data?.length) return { error: "Order not found." };

  try {
    await sendOrderStatusUpdate(parsed.data.orderId);
  } catch (emailError) {
    console.error("[admin] status email failed", emailError instanceof Error ? emailError.message : emailError);
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/account", "layout");
  return { ok: true, message: "Order status updated." };
}
