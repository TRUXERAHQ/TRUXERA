import type { Paddle } from "@paddle/paddle-node-sdk";
import type { BillingInterval, BillingPlanKey } from "../billing.ts";
import { resolvePaddlePriceId } from "./prices.ts";

export type PaddleCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Creates a Paddle transaction for a subscription checkout.
 *
 * The client may only name plan + interval (validated upstream by
 * parseCheckoutRequest); the Paddle Price ID is resolved server-side
 * from environment configuration. The transaction carries only
 * non-sensitive metadata (organization, plan, interval) so webhook
 * synchronization can resolve the tenant without trusting the browser
 * return flow. Quantity is fixed at 1 — TRUXERA billing is per
 * organization, never per user, delivery, or unit.
 *
 * Returns the Paddle-hosted checkout URL. The browser is redirected
 * there; subscription activation only happens via validated Paddle
 * notifications — the return URL is never authoritative.
 */
export async function createPaddleCheckout(input: {
  paddle: Paddle;
  organizationId: string;
  plan: BillingPlanKey;
  interval: BillingInterval;
}): Promise<PaddleCheckoutResult> {
  const priceId = resolvePaddlePriceId(input.plan, input.interval);
  if (!priceId) {
    return {
      ok: false,
      error: "This plan is not currently available for checkout.",
    };
  }

  const customData = {
    organizationId: input.organizationId,
    plan: input.plan,
    interval: input.interval,
  };

  try {
    const transaction = await input.paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customData,
    });
    const url = transaction.checkout?.url ?? null;
    if (!url) {
      return { ok: false, error: "Checkout could not be started." };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, error: "Checkout could not be started." };
  }
}
