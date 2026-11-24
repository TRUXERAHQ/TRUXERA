import {
  isBillingPlanKey,
  type BillingInterval,
  type BillingPlanKey,
} from "./billing.ts";

/** Plans eligible for self-serve checkout — provider-neutral. */
export const CHECKOUT_PLANS: readonly BillingPlanKey[] = [
  "STARTER",
  "PROFESSIONAL",
];

export function isCheckoutPlan(plan: BillingPlanKey): boolean {
  return CHECKOUT_PLANS.includes(plan);
}

export type CheckoutRequestInput = {
  plan: unknown;
  interval: unknown;
};

/**
 * Validates a checkout request against the authoritative catalog. The
 * client may only name plan + interval — the provider Price ID is
 * always resolved server-side from environment configuration. Shared
 * by every billing provider adapter.
 */
export function parseCheckoutRequest(input: CheckoutRequestInput):
  | { ok: true; plan: BillingPlanKey; interval: BillingInterval }
  | { ok: false; error: string } {
  const plan = input.plan;
  const interval = input.interval;
  if (typeof plan !== "string" || !isBillingPlanKey(plan)) {
    return { ok: false, error: "Select a valid plan." };
  }
  if (interval !== "MONTHLY" && interval !== "ANNUAL") {
    return { ok: false, error: "Select a valid billing interval." };
  }
  if (!isCheckoutPlan(plan)) {
    return { ok: false, error: "This plan is not available for checkout." };
  }
  return { ok: true, plan, interval };
}
