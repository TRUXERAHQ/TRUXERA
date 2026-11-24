import type { BillingInterval, BillingPlanKey } from "../billing.ts";
import { CHECKOUT_PLANS } from "../checkout-request.ts";

/**
 * TRUXERA plan + billing interval → Paddle Price ID.
 *
 * Price IDs are provider identifiers resolved from environment
 * configuration — never accepted from the client. The TRUXERA catalog
 * remains the commercial source of truth; these IDs only point at the
 * matching Paddle Price objects (created once in Paddle Sandbox).
 *
 * TRIAL and ENTERPRISE have no public checkout price by design.
 */

const PRICE_ENV_VARS: Partial<
  Record<BillingPlanKey, Record<BillingInterval, string>>
> = {
  STARTER: {
    MONTHLY: "PADDLE_PRICE_STARTER_MONTHLY",
    ANNUAL: "PADDLE_PRICE_STARTER_ANNUAL",
  },
  PROFESSIONAL: {
    MONTHLY: "PADDLE_PRICE_PROFESSIONAL_MONTHLY",
    ANNUAL: "PADDLE_PRICE_PROFESSIONAL_ANNUAL",
  },
};

export type PriceEnv = Record<string, string | undefined>;

export function resolvePaddlePriceId(
  plan: BillingPlanKey,
  interval: BillingInterval,
  env: PriceEnv = process.env,
): string | null {
  const envName = PRICE_ENV_VARS[plan]?.[interval];
  if (!envName) return null;
  const value = env[envName]?.trim();
  return value && value.startsWith("pri_") ? value : null;
}

/**
 * Reverse lookup: Paddle Price ID → TRUXERA plan + interval, used when
 * synchronizing subscriptions created outside checkout metadata.
 */
export function resolvePlanIntervalFromPaddlePriceId(
  priceId: string | null | undefined,
  env: PriceEnv = process.env,
): { plan: BillingPlanKey; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const plan of CHECKOUT_PLANS) {
    for (const interval of ["MONTHLY", "ANNUAL"] as const) {
      if (resolvePaddlePriceId(plan, interval, env) === priceId) {
        return { plan, interval };
      }
    }
  }
  return null;
}

export function isPaddleCheckoutPlan(plan: BillingPlanKey): boolean {
  return CHECKOUT_PLANS.includes(plan);
}
