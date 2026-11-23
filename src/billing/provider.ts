/**
 * Billing provider boundary.
 *
 * Core TRUXERA code must never import a payment-provider SDK. A future
 * adapter (e.g. Stripe) implements BillingProvider behind this interface
 * and is selected by configuration — core logic only sees the resolved
 * provider key stored on BillingSubscription.providerKey.
 *
 * Stripe resolves when STRIPE_SECRET_KEY is configured. The adapter
 * itself refuses non-test keys, so a misconfigured live key can never
 * reach the Stripe API from this codebase.
 */

export interface BillingProvider {
  /** Stable provider identifier stored on subscriptions (e.g. "stripe"). */
  readonly key: string;
}

export type BillingProviderEnv = {
  BILLING_PROVIDER?: string | undefined;
  STRIPE_SECRET_KEY?: string | undefined;
};

/**
 * Resolves the configured billing provider. Returns null when billing is
 * not configured — the expected state until a provider adapter ships.
 * BILLING_PROVIDER, when set, must name a supported provider; an unknown
 * value resolves to null rather than fabricating a provider.
 */
export function resolveBillingProvider(
  env: BillingProviderEnv = {
    BILLING_PROVIDER: process.env["BILLING_PROVIDER"],
    STRIPE_SECRET_KEY: process.env["STRIPE_SECRET_KEY"],
  },
): BillingProvider | null {
  const explicit = env.BILLING_PROVIDER?.trim();
  if (explicit) {
    return explicit === "stripe" ? { key: "stripe" } : null;
  }
  if (env.STRIPE_SECRET_KEY?.trim()) {
    return { key: "stripe" };
  }
  return null;
}
