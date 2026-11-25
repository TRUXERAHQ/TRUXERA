import type { Paddle } from "@paddle/paddle-node-sdk";
import type { BillingInterval } from "../billing.ts";

/**
 * Reads the billing interval of an existing Paddle subscription.
 * TRUXERA does not persist interval locally; the Paddle subscription's
 * billing_cycle is the authoritative source. Returns null when the
 * interval cannot be determined — callers must treat null as "unknown"
 * and degrade gracefully, never guess.
 */
export async function getPaddleSubscriptionInterval(
  paddle: Paddle,
  subscriptionId: string,
): Promise<BillingInterval | null> {
  try {
    const subscription = await paddle.subscriptions.get(subscriptionId);
    const interval = subscription.billingCycle?.interval;
    if (interval === "month") return "MONTHLY";
    if (interval === "year") return "ANNUAL";
    return null;
  } catch {
    return null;
  }
}
