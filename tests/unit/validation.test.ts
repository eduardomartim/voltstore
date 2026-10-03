import { describe, expect, it } from "vitest";
import {
  checkoutSchema,
  orderStatusSchema,
  parsePriceToCents,
  productFormSchema,
  signUpSchema,
} from "@/lib/validation/schemas";
import { safeNextPath } from "@/lib/security/redirect";
import { sanitizeSearchTerm } from "@/lib/catalog";

const uuid = "6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
const uuid2 = "7a2d3c9f-4b5e-4f60-9bac-1d2e3f4a5b6c";

describe("checkoutSchema", () => {
  it("accepts product ids and quantities only", () => {
    const parsed = checkoutSchema.parse({ items: [{ productId: uuid, quantity: 2, priceCents: 1 }] });
    // Unknown keys such as a client-supplied price are stripped.
    expect(parsed.items[0]).toEqual({ productId: uuid, quantity: 2 });
  });

  it.each<[unknown, string]>([
    [{ items: [] }, "empty cart"],
    [{ items: [{ productId: uuid, quantity: 0 }] }, "zero quantity"],
    [{ items: [{ productId: uuid, quantity: -3 }] }, "negative quantity"],
    [{ items: [{ productId: uuid, quantity: 1.5 }] }, "fractional quantity"],
    [{ items: [{ productId: uuid, quantity: 11 }] }, "above per-item limit"],
    [{ items: [{ productId: "not-a-uuid", quantity: 1 }] }, "invalid id"],
    [{ items: [{ productId: uuid, quantity: "2" }] }, "string quantity"],
    [{ items: [{ productId: uuid, quantity: 1 }, { productId: uuid, quantity: 1 }] }, "duplicate products"],
  ])("rejects %j (%s)", (input) => {
    expect(checkoutSchema.safeParse(input).success).toBe(false);
  });

  it("accepts multiple distinct products", () => {
    expect(
      checkoutSchema.safeParse({
        items: [
          { productId: uuid, quantity: 1 },
          { productId: uuid2, quantity: 10 },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("parsePriceToCents", () => {
  it.each([
    ["899,90", 89990],
    ["899.9", 89990],
    ["1.299,00", 129900],
    ["R$ 49,99", 4999],
    ["10", 1000],
  ])("parses %s", (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-10", "1,999", "12.345", "1e5"])("rejects %s", (input) => {
    expect(parsePriceToCents(input)).toBeNull();
  });
});

describe("productFormSchema", () => {
  const valid = {
    name: "Arc75",
    slug: "arc75",
    description: "",
    categoryId: uuid,
    priceCents: 89900,
    stockQuantity: 3,
    imageUrl: "https://images.unsplash.com/photo-1",
    isActive: true,
    isFeatured: false,
  };

  it("accepts a valid product", () => {
    expect(productFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects images from non-allowlisted hosts and non-https URLs", () => {
    expect(productFormSchema.safeParse({ ...valid, imageUrl: "https://evil.example/x.png" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, imageUrl: "http://images.unsplash.com/x" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, imageUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejects negative stock, zero price and malformed slugs", () => {
    expect(productFormSchema.safeParse({ ...valid, stockQuantity: -1 }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, priceCents: 0 }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, slug: "Bad Slug!" }).success).toBe(false);
  });
});

describe("other schemas", () => {
  it("only allows admins to set fulfilment statuses (never paid/pending)", () => {
    expect(orderStatusSchema.safeParse({ orderId: uuid, status: "shipped" }).success).toBe(true);
    expect(orderStatusSchema.safeParse({ orderId: uuid, status: "paid" }).success).toBe(false);
    expect(orderStatusSchema.safeParse({ orderId: uuid, status: "pending" }).success).toBe(false);
  });

  it("validates sign-up input", () => {
    expect(signUpSchema.safeParse({ fullName: "Ana", email: "ANA@Example.com ", password: "longenough" }).data?.email).toBe(
      "ana@example.com",
    );
    expect(signUpSchema.safeParse({ fullName: "Ana", email: "nope", password: "longenough" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "Ana", email: "a@b.co", password: "short" }).success).toBe(false);
  });
});

describe("safeNextPath (open-redirect protection)", () => {
  it.each(["/account", "/products?q=mouse", "/account/orders/123"])("allows %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, 42, "account"])(
    "rejects %s",
    (value) => {
      expect(safeNextPath(value, "/fallback")).toBe("/fallback");
    },
  );
});

describe("sanitizeSearchTerm (PostgREST filter safety)", () => {
  it("removes filter syntax characters", () => {
    expect(sanitizeSearchTerm("mouse),id.eq.1,(name.ilike.*")).toBe("mouse id eq 1 name ilike");
    expect(sanitizeSearchTerm("  usb-c   hub  ")).toBe("usb-c hub");
    expect(sanitizeSearchTerm("fone sem fio ção")).toBe("fone sem fio ção");
  });
});
