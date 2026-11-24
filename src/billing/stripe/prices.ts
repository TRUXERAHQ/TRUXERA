import type { BillingInterval, BillingPlanKey } from "../billing.ts";
import { CHECKOUT_PLANS } from "../checkout-request.ts";

/**
 * TRUXERA plan + billing interval → Stripe Price ID.
 *
 * Price IDs are provider identifiers resolved from environment
 * configuration — never accepted from the client. The TRUXERA catalog
 * remains the commercial source of truth; these IDs only point at the
 * matching Stripe Price objects (created once in Stripe test mode).
 *
 * TRIAL and ENTERPRISE have no public checkout price by design.
 */

const PRICE_ENV_VARS: Partial<
  Record<BillingPlanKey, Record<BillingInterval, string>>
> = {
  STARTER: {
    MONTHLY: "STRIPE_PRICE_STARTER_MONTHLY",
    ANNUAL: "STRIPE_PRICE_STARTER_ANNUAL",
  },
  PROFESSIONAL: {
    MONTHLY: "STRIPE_PRICE_PROFESSIONAL_MONTHLY",
    ANNUAL: "STRIPE_PRICE_PROFESSIONAL_ANNUAL",
  },
};

export { CHECKOUT_PLANS, isCheckoutPlan } from "../checkout-request.ts";

export type PriceEnv = Record<string, string | undefined>;

export function resolveStripePriceId(
  plan: BillingPlanKey,
  interval: BillingInterval,
  env: PriceEnv = process.env,
): string | null {
  const envName = PRICE_ENV_VARS[plan]?.[interval];
  if (!envName) return null;
  const value = env[envName]?.trim();
  return value && value.startsWith("price_") ? value : null;
}

/**
 * Reverse lookup: Stripe Price ID → TRUXERA plan + interval, used when
 * synchronizing subscriptions created outside checkout metadata.
 */
export function resolvePlanIntervalFromPriceId(
  priceId: string | null | undefined,
  env: PriceEnv = process.env,
): { plan: BillingPlanKey; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const plan of CHECKOUT_PLANS) {
    for (const interval of ["MONTHLY", "ANNUAL"] as const) {
      if (resolveStripePriceId(plan, interval, env) === priceId) {
        return { plan, interval };
      }
    }
  }
  return null;
}


