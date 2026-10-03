"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  addLine,
  countItems,
  normalizeLines,
  removeLine,
  setLineQuantity,
  type CartLine,
} from "@/lib/cart/cart";

const STORAGE_KEY = "voltline.cart.v1";
const EMPTY: CartLine[] = [];

/*
 * A tiny external store over localStorage. Only product ids and quantities are
 * persisted; prices are always fetched from the server.
 */
let cache: CartLine[] | null = null;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  if (cache) return cache;
  try {
    cache = normalizeLines(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLine[]) {
  cache = lines;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage may be unavailable (private mode); keep the in-memory cart.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

type CartContextValue = {
  lines: CartLine[];
  count: number;
  ready: boolean;
  add: (productId: string, quantity: number, stockQuantity: number) => void;
  setQuantity: (productId: string, quantity: number, stockQuantity?: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const lines = useSyncExternalStore(subscribe, read, () => EMPTY);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const add = useCallback((productId: string, quantity: number, stockQuantity: number) => {
    write(addLine(read(), productId, quantity, stockQuantity));
  }, []);
  const setQuantity = useCallback((productId: string, quantity: number, stockQuantity?: number) => {
    write(setLineQuantity(read(), productId, quantity, stockQuantity));
  }, []);
  const remove = useCallback((productId: string) => write(removeLine(read(), productId)), []);
  const clear = useCallback(() => write([]), []);

  const value = useMemo(
    () => ({ lines, count: countItems(lines), ready, add, setQuantity, remove, clear }),
    [lines, ready, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
