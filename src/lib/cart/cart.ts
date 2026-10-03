/**
 * Pure cart logic shared by the client cart and the server. The client cart
 * only ever stores product ids and quantities — prices always come from the
 * database.
 */

export const MAX_QUANTITY_PER_ITEM = 10;
export const MAX_CART_LINES = 20;

export type CartLine = { productId: string; quantity: number };

export type CartProduct = {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  imageUrl: string | null;
  stockQuantity: number;
  isActive: boolean;
};

export type CartIssue = "unavailable" | "out_of_stock" | "insufficient_stock";

export type PricedCartLine = {
  product: CartProduct | null;
  productId: string;
  quantity: number;
  lineTotalCents: number;
  issue: CartIssue | null;
};

export type CartSummary = {
  lines: PricedCartLine[];
  itemCount: number;
  subtotalCents: number;
  totalCents: number;
  canCheckout: boolean;
};

export function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY_PER_ITEM;
}

/** Largest quantity a customer may hold for a product with the given stock. */
export function maxAllowedQuantity(stockQuantity: number): number {
  return Math.max(0, Math.min(MAX_QUANTITY_PER_ITEM, Math.floor(stockQuantity)));
}

export function clampQuantity(quantity: number, stockQuantity = MAX_QUANTITY_PER_ITEM): number {
  const max = maxAllowedQuantity(stockQuantity);
  if (!Number.isFinite(quantity) || max === 0) return 0;
  return Math.min(max, Math.max(1, Math.floor(quantity)));
}

/** Adds `quantity` of a product, never exceeding stock or the per-item limit. */
export function addLine(
  lines: CartLine[],
  productId: string,
  quantity: number,
  stockQuantity = MAX_QUANTITY_PER_ITEM,
): CartLine[] {
  const existing = lines.find((l) => l.productId === productId);
  if (!existing && lines.length >= MAX_CART_LINES) return lines;
  const next = clampQuantity((existing?.quantity ?? 0) + quantity, stockQuantity);
  if (next === 0) return lines;
  if (existing) return lines.map((l) => (l.productId === productId ? { ...l, quantity: next } : l));
  return [...lines, { productId, quantity: next }];
}

export function setLineQuantity(
  lines: CartLine[],
  productId: string,
  quantity: number,
  stockQuantity = MAX_QUANTITY_PER_ITEM,
): CartLine[] {
  if (quantity <= 0) return removeLine(lines, productId);
  const next = clampQuantity(quantity, stockQuantity);
  if (next === 0) return removeLine(lines, productId);
  return lines.map((l) => (l.productId === productId ? { ...l, quantity: next } : l));
}

export function removeLine(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((l) => l.productId !== productId);
}

/** Merges duplicate product ids and drops invalid entries (e.g. tampered storage). */
export function normalizeLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, number>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const { productId, quantity } = raw as Record<string, unknown>;
    if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) continue;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) continue;
    merged.set(productId, Math.min(MAX_QUANTITY_PER_ITEM, (merged.get(productId) ?? 0) + quantity));
  }
  return [...merged.entries()]
    .slice(0, MAX_CART_LINES)
    .map(([productId, quantity]) => ({ productId, quantity }));
}

export function countItems(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

/**
 * Prices a cart against authoritative product data and flags lines that cannot
 * be purchased. Unknown/inactive products contribute nothing to the total.
 */
export function summarizeCart(lines: CartLine[], products: CartProduct[]): CartSummary {
  const byId = new Map(products.map((p) => [p.id, p]));

  const priced = lines.map<PricedCartLine>((line) => {
    const product = byId.get(line.productId) ?? null;
    let issue: CartIssue | null = null;
    if (!product || !product.isActive) issue = "unavailable";
    else if (product.stockQuantity <= 0) issue = "out_of_stock";
    else if (product.stockQuantity < line.quantity) issue = "insufficient_stock";

    const lineTotalCents = product && issue === null ? product.priceCents * line.quantity : 0;
    return { product, productId: line.productId, quantity: line.quantity, lineTotalCents, issue };
  });

  const subtotalCents = priced.reduce((sum, l) => sum + l.lineTotalCents, 0);

  return {
    lines: priced,
    itemCount: countItems(lines),
    subtotalCents,
    totalCents: subtotalCents, // Free shipping: total equals subtotal.
    canCheckout: priced.length > 0 && priced.every((l) => l.issue === null),
  };
}
