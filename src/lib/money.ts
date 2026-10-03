const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formats an integer amount of centavos as BRL, e.g. 89900 -> "R$ 899,00". */
export function formatPrice(cents: number): string {
  return brl.format(cents / 100);
}
