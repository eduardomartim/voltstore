import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

let stripe: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured (STRIPE_SECRET_KEY is missing).");
    this.name = "StripeNotConfiguredError";
  }
}

/** Server-only Stripe client. The secret key never leaves the server. */
export function getStripe(): Stripe {
  const key = serverEnv.stripeSecretKey;
  if (!key) throw new StripeNotConfiguredError();
  stripe ??= new Stripe(key, {
    appInfo: { name: "Voltline", version: "1.0.0" },
    maxNetworkRetries: 2,
  });
  return stripe;
}
