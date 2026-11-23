/**
 * Billing provider boundary.
 *
 * Core TRUXERA code must never import a payment-provider SDK. A future
 * adapter (e.g. Stripe) implements BillingProvider behind this interface
 * and is selected by configuration — core logic only sees the resolved
 * provider key stored on BillingSubscription.providerKey.
 *
 * No provider is configured in this phase, so resolution returns null.
 */

export interface BillingProvider {
  /** Stable provider identifier stored on subscriptions (e.g. "stripe"). */
  readonly key: string;
}

export type BillingProviderEnv = {
  BILLING_PROVIDER?: string | undefined;
};

/**
 * Resolves the configured billing provider. Returns null when billing is
 * not configured — the expected state until a provider adapter ships.
 */
export function resolveBillingProvider(
  env: BillingProviderEnv = {
    BILLING_PROVIDER: process.env["BILLING_PROVIDER"],
  },
): BillingProvider | null {
  const key = env.BILLING_PROVIDER?.trim();
  if (!key) return null;
  // No provider adapters exist yet; an unknown key resolves to null rather
  // than fabricating a provider.
  return null;
}
