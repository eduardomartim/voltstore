import { describe, expect, it } from "vitest";
import {
  addLine,
  clampQuantity,
  isValidQuantity,
  MAX_CART_LINES,
  MAX_QUANTITY_PER_ITEM,
  normalizeLines,
  removeLine,
  setLineQuantity,
  summarizeCart,
  type CartProduct,
} from "@/lib/cart/cart";

const product = (overrides: Partial<CartProduct> = {}): CartProduct => ({
  id: "p1",
  name: "Keyboard",
  slug: "keyboard",
  priceCents: 89900,
  imageUrl: null,
  stockQuantity: 5,
  isActive: true,
  ...overrides,
});

describe("quantity validation", () => {
  it("accepts integers between 1 and the per-item limit", () => {
    expect(isValidQuantity(1)).toBe(true);
    expect(isValidQuantity(MAX_QUANTITY_PER_ITEM)).toBe(true);
  });

  it.each([0, -1, 1.5, MAX_QUANTITY_PER_ITEM + 1, Number.NaN, Number.POSITIVE_INFINITY])("rejects %s", (q) => {
    expect(isValidQuantity(q)).toBe(false);
  });

  it("clamps to available stock and the per-item limit", () => {
    expect(clampQuantity(7, 3)).toBe(3);
    expect(clampQuantity(50, 100)).toBe(MAX_QUANTITY_PER_ITEM);
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(2, 0)).toBe(0);
  });
});

describe("cart mutations", () => {
  it("adds a new line and merges repeated adds", () => {
    let lines = addLine([], "p1", 2, 10);
    lines = addLine(lines, "p1", 3, 10);
    expect(lines).toEqual([{ productId: "p1", quantity: 5 }]);
  });

  it("never exceeds stock when adding", () => {
    const lines = addLine([{ productId: "p1", quantity: 2 }], "p1", 5, 3);
    expect(lines).toEqual([{ productId: "p1", quantity: 3 }]);
  });

  it("does not add out-of-stock products", () => {
    expect(addLine([], "p1", 1, 0)).toEqual([]);
  });

  it("caps the number of distinct lines", () => {
    const full = Array.from({ length: MAX_CART_LINES }, (_, i) => ({ productId: `p${i}`, quantity: 1 }));
    expect(addLine(full, "new", 1)).toHaveLength(MAX_CART_LINES);
  });

  it("changes quantity and removes the line at zero", () => {
    const lines = [{ productId: "p1", quantity: 2 }];
    expect(setLineQuantity(lines, "p1", 4, 10)).toEqual([{ productId: "p1", quantity: 4 }]);
    expect(setLineQuantity(lines, "p1", 0)).toEqual([]);
    expect(removeLine(lines, "p1")).toEqual([]);
  });
});

describe("normalizeLines (untrusted localStorage input)", () => {
  it("drops malformed entries and merges duplicates", () => {
    const input = [
      { productId: "a", quantity: 2 },
      { productId: "a", quantity: 3 },
      { productId: "b", quantity: -4 },
      { productId: "c", quantity: 1.5 },
      { productId: 42, quantity: 1 },
      "garbage",
      null,
      { productId: "d", quantity: 99, priceCents: 1 },
    ];
    expect(normalizeLines(input)).toEqual([
      { productId: "a", quantity: 5 },
      { productId: "d", quantity: MAX_QUANTITY_PER_ITEM },
    ]);
  });

  it("returns an empty cart for non-arrays", () => {
    expect(normalizeLines({ productId: "a" })).toEqual([]);
    expect(normalizeLines(null)).toEqual([]);
  });
});

describe("summarizeCart", () => {
  it("calculates totals from authoritative prices", () => {
    const summary = summarizeCart(
      [
        { productId: "p1", quantity: 2 },
        { productId: "p2", quantity: 1 },
      ],
      [product(), product({ id: "p2", priceCents: 19900 })],
    );
    expect(summary.subtotalCents).toBe(2 * 89900 + 19900);
    expect(summary.totalCents).toBe(summary.subtotalCents);
    expect(summary.itemCount).toBe(3);
    expect(summary.canCheckout).toBe(true);
  });

  it("flags unavailable, out-of-stock and insufficient-stock lines and blocks checkout", () => {
    const summary = summarizeCart(
      [
        { productId: "missing", quantity: 1 },
        { productId: "sold-out", quantity: 1 },
        { productId: "low", quantity: 4 },
      ],
      [product({ id: "sold-out", stockQuantity: 0 }), product({ id: "low", stockQuantity: 2 })],
    );
    expect(summary.lines.map((l) => l.issue)).toEqual(["unavailable", "out_of_stock", "insufficient_stock"]);
    expect(summary.subtotalCents).toBe(0);
    expect(summary.canCheckout).toBe(false);
  });

  it("treats inactive products as unavailable", () => {
    const summary = summarizeCart([{ productId: "p1", quantity: 1 }], [product({ isActive: false })]);
    expect(summary.lines[0].issue).toBe("unavailable");
    expect(summary.canCheckout).toBe(false);
  });

  it("cannot check out an empty cart", () => {
    expect(summarizeCart([], []).canCheckout).toBe(false);
  });
});
