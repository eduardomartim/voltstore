import { z } from "zod";
import { MAX_CART_LINES, MAX_QUANTITY_PER_ITEM } from "@/lib/cart/cart";

export const ADMIN_SETTABLE_STATUSES = ["processing", "shipped", "delivered", "cancelled"] as const;

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const password = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(72),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
});

export const cartItemSchema = z.object({
  productId: z.string().uuid("Invalid product."),
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(MAX_QUANTITY_PER_ITEM, `You can buy at most ${MAX_QUANTITY_PER_ITEM} of each item.`),
});

export const checkoutSchema = z.object({
  items: z
    .array(cartItemSchema)
    .min(1, "Your cart is empty.")
    .max(MAX_CART_LINES, "Too many items in cart.")
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
      message: "Duplicate products in cart.",
    }),
});

export const productIdsSchema = z.array(z.string().uuid()).max(MAX_CART_LINES);

/** Only allow images from hosts configured in next.config.ts. */
export const ALLOWED_IMAGE_HOSTS = ["images.unsplash.com"];

/** Parses a BRL amount such as "899,90", "1.299,00" or "899.9" into integer centavos. */
export function parsePriceToCents(value: string): number | null {
  let v = value.trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

export const productFormSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Slug is too short.")
    .max(120)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes."),
  description: z.string().trim().max(4000),
  categoryId: z.string().uuid("Choose a category."),
  priceCents: z
    .number({ message: "Enter a valid price, e.g. 899,90." })
    .int()
    .min(1, "Price must be greater than zero.")
    .max(10_000_000, "Price is too high."),
  stockQuantity: z
    .number({ message: "Enter a valid stock quantity." })
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative.")
    .max(100_000),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => {
      if (v === "") return true;
      try {
        const url = new URL(v);
        return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(url.hostname);
      } catch {
        return false;
      }
    }, `Image must be an https URL from: ${ALLOWED_IMAGE_HOSTS.join(", ")}.`)
    .transform((v) => (v === "" ? null : v)),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
});

export const stockAdjustSchema = z.object({
  productId: z.string().uuid(),
  stockQuantity: z
    .number({ message: "Enter a valid stock quantity." })
    .int()
    .min(0, "Stock cannot be negative.")
    .max(100_000),
});

export const orderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(ADMIN_SETTABLE_STATUSES),
});

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional()
    .catch(undefined),
  sort: z.enum(["newest", "price-asc", "price-desc", "name"]).optional().catch(undefined),
});

/** Flattens a ZodError into a { field: messages[] } map for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
