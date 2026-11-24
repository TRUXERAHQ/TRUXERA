/**
 * Billing provider boundary.
 *
 * Core TRUXERA code must never import a payment-provider SDK. Provider
 * adapters (Paddle, Stripe) implement BillingProvider behind this
 * interface and are selected by configuration — core logic only sees
 * the resolved provider key stored on BillingSubscription.providerKey.
 *
 * Paddle resolves when a Sandbox API key is configured; the adapter
 * itself refuses non-sandbox keys, so a live key fails closed. Stripe
 * resolves when STRIPE_SECRET_KEY is configured and likewise refuses
 * non-test keys. BILLING_PROVIDER, when set, must name a supported
 * provider; an unknown value resolves to null rather than fabricating
 * a provider.
 */

export interface BillingProvider {
  /** Stable provider identifier stored on subscriptions. */
  readonly key: string;
}

export type BillingProviderEnv = {
  BILLING_PROVIDER?: string | undefined;
  PADDLE_API_KEY?: string | undefined;
  STRIPE_SECRET_KEY?: string | undefined;
};

/** Only Paddle Sandbox API keys are accepted — live keys fail closed. */
export function isSandboxPaddleApiKey(
  key: string | null | undefined,
): boolean {
  return typeof key === "string" && key.trim().startsWith("pdl_sdbx_apikey_");
}

/**
 * Resolves the configured billing provider. Returns null when billing is
 * not configured — the application remains fully functional and the
 * billing UI shows an honest unavailable state.
 *
 * Precedence: explicit BILLING_PROVIDER > Paddle Sandbox key > Stripe
 * test key. Paddle is the current provider; Stripe remains a valid
 * preserved implementation selectable via BILLING_PROVIDER=stripe.
 */
export function resolveBillingProvider(
  env: BillingProviderEnv = {
    BILLING_PROVIDER: process.env["BILLING_PROVIDER"],
    PADDLE_API_KEY: process.env["PADDLE_API_KEY"],
    STRIPE_SECRET_KEY: process.env["STRIPE_SECRET_KEY"],
  },
): BillingProvider | null {
  const explicit = env.BILLING_PROVIDER?.trim();
  if (explicit) {
    // Explicit selection names the provider; adapter usability (valid
    // test/sandbox credentials) is verified separately by each client.
    if (explicit === "paddle" || explicit === "stripe") {
      return { key: explicit };
    }
    return null;
  }
  if (isSandboxPaddleApiKey(env.PADDLE_API_KEY)) {
    return { key: "paddle" };
  }
  if (env.STRIPE_SECRET_KEY?.trim()) {
    return { key: "stripe" };
  }
  return null;
}
