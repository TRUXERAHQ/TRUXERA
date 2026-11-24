import type Stripe from "stripe";
import type { BillingInterval, BillingPlanKey } from "../billing.ts";
import { getStripeClient } from "./client.ts";
import { resolveStripePriceId } from "./prices.ts";
import { parseCheckoutRequest } from "../checkout-request.ts";

export type CheckoutRequest = {
  plan: unknown;
  interval: unknown;
};

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export { parseCheckoutRequest };

/**
 * Creates a Stripe Checkout Session for a subscription. Metadata carries
 * only non-sensitive identifiers (organization, plan, interval) so
 * webhook synchronization can resolve the tenant without trusting the
 * browser return flow.
 */
export async function createCheckoutSession(input: {
  stripe: Stripe;
  organizationId: string;
  plan: BillingPlanKey;
  interval: BillingInterval;
  customerId?: string | null;
  customerEmail?: string | null;
  baseUrl: string;
}): Promise<CheckoutResult> {
  const priceId = resolveStripePriceId(input.plan, input.interval);
  if (!priceId) {
    return {
      ok: false,
      error: "This plan is not currently available for checkout.",
    };
  }

  const base = input.baseUrl.replace(/\/+$/, "");
  const metadata = {
    organizationId: input.organizationId,
    plan: input.plan,
    interval: input.interval,
  };

  try {
    const session = await input.stripe.checkout.sessions.create({
      mode: "subscription",
      ...(input.customerId
        ? { customer: input.customerId }
        : input.customerEmail
          ? { customer_email: input.customerEmail }
          : {}),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/dashboard/billing?billing=checkout_success`,
      cancel_url: `${base}/dashboard/billing?billing=checkout_canceled`,
      client_reference_id: input.organizationId,
      metadata,
      subscription_data: { metadata },
      allow_promotion_codes: false,
    });
    if (!session.url) {
      return { ok: false, error: "Checkout could not be started." };
    }
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: "Checkout could not be started." };
  }
}

export { getStripeClient };
