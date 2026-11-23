import Stripe from "stripe";

/**
 * Stripe adapter — server-side only. The secret key never leaves this
 * module: it is read from STRIPE_SECRET_KEY, never logged, never sent to
 * the client, and never stored.
 *
 * TEST MODE ONLY: this adapter refuses anything that is not an
 * sk_test_ key, so a live key in the environment fails closed instead
 * of processing real payments.
 */

let client: Stripe | null | undefined;

/** Only Stripe TEST MODE keys are accepted — live keys fail closed. */
export function isTestStripeKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.trim().startsWith("sk_test_");
}

export function getStripeClient(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env["STRIPE_SECRET_KEY"]?.trim();
  client = isTestStripeKey(key) ? new Stripe(key!.trim()) : null;
  return client;
}

export function getStripeWebhookSecret(): string | null {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
  return secret && secret.startsWith("whsec_") ? secret : null;
}

export const STRIPE_PROVIDER_KEY = "stripe";
