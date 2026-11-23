/**
 * Billing & pricing domain — pure, vendor-neutral logic.
 *
 * Organization is the customer account. A BillingSubscription row holds
 * the commercial state; plans, prices, entitlements, and limits are a
 * single code catalog so core business logic never imports a payment
 * provider and pricing changes never require touching call sites.
 *
 * Money is always integer minor units (cents) — never floats.
 *
 * Effective terms resolution: a subscription may carry grandfathered
 * commercial terms (price/limit overrides). Effective value =
 * subscription override ?? catalog value. The catalog is the source of
 * truth for new customers; overrides preserve existing terms.
 */

export type BillingPlanKey = "TRIAL" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";

export type SubscriptionStatusKey =
  | "TRIAL"
  | "ACTIVE"
  | "PAUSED"
  | "CANCELED";

export type BillingInterval = "MONTHLY" | "ANNUAL";

/**
 * Plan-gated feature keys. Core operational features are included in
 * every plan; advanced keys are Professional/Enterprise entitlements.
 */
export type EntitlementKey =
  | "CORE_RISK_INTELLIGENCE"
  | "RECOVERY_RECOMMENDATIONS"
  | "LOAD_REASSIGNMENT"
  | "RECOVERY_IMPACT"
  | "OPERATIONAL_HISTORY"
  | "DAILY_SUMMARY"
  | "BASIC_REPORTING"
  | "ADVANCED_INTELLIGENCE"
  | "ADVANCED_RECOVERY"
  | "CAPACITY_BALANCING"
  | "EXECUTIVE_REPORTING"
  | "API_ACCESS"
  | "INTEGRATION_MONITORING"
  | "ADVANCED_OPERATIONAL_HISTORY"
  | "PRIORITY_SUPPORT";

export type UsageLimitKey =
  | "vehicles"
  | "drivers"
  | "loads"
  | "deliveries"
  | "members"
  | "integrations";

/**
 * A limit is:
 *  - a number: enforced maximum
 *  - "unlimited": no cap
 *  - "custom": contract-defined (Enterprise); unenforced unless the
 *    subscription carries an explicit numeric override
 *  - null: not configured / not enforced
 */
export type UsageLimit = number | "unlimited" | "custom" | null;

export type PlanPrices = {
  /** Integer cents per month; null = custom/no public price. */
  monthlyCents: number | null;
  /** Integer cents per year when billed annually; null = custom. */
  annualCents: number | null;
};

export type PlanDefinition = {
  key: BillingPlanKey;
  label: string;
  description: string;
  /** null = custom commercial terms (no public price). */
  prices: PlanPrices | null;
  limits: Record<UsageLimitKey, UsageLimit>;
  entitlements: readonly EntitlementKey[];
};

const CORE_FEATURES: readonly EntitlementKey[] = [
  "CORE_RISK_INTELLIGENCE",
  "RECOVERY_RECOMMENDATIONS",
  "LOAD_REASSIGNMENT",
  "RECOVERY_IMPACT",
  "OPERATIONAL_HISTORY",
  "DAILY_SUMMARY",
  "BASIC_REPORTING",
];

const PROFESSIONAL_FEATURES: readonly EntitlementKey[] = [
  ...CORE_FEATURES,
  "ADVANCED_INTELLIGENCE",
  "ADVANCED_RECOVERY",
  "CAPACITY_BALANCING",
  "EXECUTIVE_REPORTING",
  "API_ACCESS",
  "INTEGRATION_MONITORING",
  "ADVANCED_OPERATIONAL_HISTORY",
  "PRIORITY_SUPPORT",
];

const UNLIMITED_AUX_LIMITS = {
  drivers: "unlimited",
  loads: "unlimited",
  deliveries: "unlimited",
  members: "unlimited",
} as const;

/**
 * Authoritative plan catalog — the ONLY place commercial values live.
 * Price/limit changes for future customers happen here, never in
 * application code.
 */
export const BILLING_PLANS: Record<BillingPlanKey, PlanDefinition> = {
  TRIAL: {
    key: "TRIAL",
    label: "Trial",
    description: "Full-product evaluation for onboarding and trials.",
    prices: null,
    limits: {
      vehicles: "unlimited",
      integrations: "unlimited",
      ...UNLIMITED_AUX_LIMITS,
    },
    entitlements: PROFESSIONAL_FEATURES,
  },
  STARTER: {
    key: "STARTER",
    label: "Starter",
    description: "Core fleet-operations intelligence for small fleets.",
    prices: { monthlyCents: 39900, annualCents: 382800 },
    limits: {
      vehicles: 25,
      integrations: 1,
      ...UNLIMITED_AUX_LIMITS,
    },
    entitlements: CORE_FEATURES,
  },
  PROFESSIONAL: {
    key: "PROFESSIONAL",
    label: "Professional",
    description: "Advanced intelligence, integrations, and API access.",
    prices: { monthlyCents: 89900, annualCents: 862800 },
    limits: {
      vehicles: 75,
      integrations: "unlimited",
      ...UNLIMITED_AUX_LIMITS,
    },
    entitlements: PROFESSIONAL_FEATURES,
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    label: "Enterprise",
    description: "Custom commercial arrangement with contracted terms.",
    prices: null,
    limits: {
      vehicles: "custom",
      integrations: "custom",
      ...UNLIMITED_AUX_LIMITS,
    },
    entitlements: PROFESSIONAL_FEATURES,
  },
};

export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  CORE_RISK_INTELLIGENCE: "Risk Intelligence",
  RECOVERY_RECOMMENDATIONS: "Recovery Recommendations",
  LOAD_REASSIGNMENT: "Load Reassignment",
  RECOVERY_IMPACT: "Recovery Impact",
  OPERATIONAL_HISTORY: "Operational History",
  DAILY_SUMMARY: "Daily Operations Summary",
  BASIC_REPORTING: "Basic Reporting",
  ADVANCED_INTELLIGENCE: "Advanced Operational Intelligence",
  ADVANCED_RECOVERY: "Advanced Recovery Intelligence",
  CAPACITY_BALANCING: "Resource & Capacity Balancing",
  EXECUTIVE_REPORTING: "Executive Reporting",
  API_ACCESS: "API Access",
  INTEGRATION_MONITORING: "Integration Monitoring",
  ADVANCED_OPERATIONAL_HISTORY: "Advanced Operational History",
  PRIORITY_SUPPORT: "Priority Support",
};

export const USAGE_LIMIT_LABELS: Record<UsageLimitKey, string> = {
  vehicles: "Vehicles",
  drivers: "Drivers",
  loads: "Loads",
  deliveries: "Deliveries",
  members: "Members",
  integrations: "Integrations",
};

export function isBillingPlanKey(value: unknown): value is BillingPlanKey {
  return (
    value === "TRIAL" ||
    value === "STARTER" ||
    value === "PROFESSIONAL" ||
    value === "ENTERPRISE"
  );
}

export function isSubscriptionStatusKey(
  value: unknown,
): value is SubscriptionStatusKey {
  return (
    value === "TRIAL" ||
    value === "ACTIVE" ||
    value === "PAUSED" ||
    value === "CANCELED"
  );
}

/**
 * Effective plan for an organization. A missing subscription resolves to
 * the safe TRIAL default — never a paid plan, never fabricated dates.
 */
export function resolveEffectivePlan(
  plan: string | null | undefined,
): BillingPlanKey {
  return isBillingPlanKey(plan) ? plan : "TRIAL";
}

export function hasEntitlement(
  plan: string | null | undefined,
  entitlement: EntitlementKey,
): boolean {
  const key = resolveEffectivePlan(plan);
  return BILLING_PLANS[key].entitlements.includes(entitlement);
}

export function getPlanDefinition(
  plan: string | null | undefined,
): PlanDefinition {
  return BILLING_PLANS[resolveEffectivePlan(plan)];
}

export function getPlanLimits(
  plan: string | null | undefined,
): Record<UsageLimitKey, UsageLimit> {
  return BILLING_PLANS[resolveEffectivePlan(plan)].limits;
}

export type LimitCheck = "OK" | "EXCEEDED" | "NOT_ENFORCED";

/**
 * Evaluates usage against a limit. Only a concrete number is enforceable;
 * "unlimited", "custom" (without a contracted override), and null all
 * return NOT_ENFORCED so callers can distinguish policy from enforcement.
 */
export function checkUsageWithinLimit(
  limit: UsageLimit,
  currentUsage: number,
): LimitCheck {
  if (typeof limit !== "number" || limit < 0) return "NOT_ENFORCED";
  return currentUsage <= limit ? "OK" : "EXCEEDED";
}

/** Subscription row shape consumed by the resolver (DB-agnostic). */
export type BillingSubscriptionRecord = {
  plan: string;
  status: string;
  trialStartAt: Date | null;
  trialEndAt: Date | null;
  providerKey: string | null;
  monthlyPriceCents?: number | null;
  annualPriceCents?: number | null;
  vehicleLimit?: number | null;
  integrationLimit?: number | null;
};

export type EffectivePrices = {
  monthlyCents: number | null;
  annualCents: number | null;
  /** True when no public price applies (custom terms). */
  custom: boolean;
};

export type BillingState = {
  /** Effective plan — TRIAL when no subscription row exists. */
  plan: BillingPlanKey;
  planLabel: string;
  /** True when a BillingSubscription row exists for the organization. */
  configured: boolean;
  /** Null when no subscription row exists. */
  subscriptionStatus: SubscriptionStatusKey | null;
  subscriptionStatusLabel: string | null;
  trialStartAt: string | null;
  trialEndAt: string | null;
  /** Provider key, or null when no billing provider is configured. */
  providerKey: string | null;
  /** Effective prices (subscription overrides ?? catalog). */
  prices: EffectivePrices;
  /** True when effective prices come from subscription overrides. */
  grandfatheredPricing: boolean;
  entitlements: EntitlementKey[];
  /** Effective limits (subscription overrides ?? catalog). */
  limits: Record<UsageLimitKey, UsageLimit>;
};

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatusKey, string> = {
  TRIAL: "Trial",
  ACTIVE: "Active",
  PAUSED: "Paused",
  CANCELED: "Canceled",
};

function positiveIntOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Resolves the billing state for display, policy checks, and enforcement.
 * Pure — the caller supplies the org's subscription row (or null).
 *
 * Grandfathering: override columns on the subscription win over the
 * catalog, so catalog price/limit changes never silently reprice or
 * re-limit an existing customer.
 */
export function resolveBillingState(
  subscription: BillingSubscriptionRecord | null | undefined,
): BillingState {
  const configured = subscription != null;
  const plan = resolveEffectivePlan(subscription?.plan);
  const definition = BILLING_PLANS[plan];
  const status = isSubscriptionStatusKey(subscription?.status)
    ? subscription.status
    : null;

  const catalogPrices = definition.prices;
  const overrideMonthly = positiveIntOrNull(subscription?.monthlyPriceCents);
  const overrideAnnual = positiveIntOrNull(subscription?.annualPriceCents);
  const monthlyCents = overrideMonthly ?? catalogPrices?.monthlyCents ?? null;
  const annualCents = overrideAnnual ?? catalogPrices?.annualCents ?? null;

  const limits: Record<UsageLimitKey, UsageLimit> = {
    ...definition.limits,
  };
  const vehicleOverride = positiveIntOrNull(subscription?.vehicleLimit);
  const integrationOverride = positiveIntOrNull(
    subscription?.integrationLimit,
  );
  if (vehicleOverride !== null) limits.vehicles = vehicleOverride;
  if (integrationOverride !== null) limits.integrations = integrationOverride;

  return {
    plan,
    planLabel: definition.label,
    configured,
    subscriptionStatus: configured ? status : null,
    subscriptionStatusLabel: configured && status
      ? SUBSCRIPTION_STATUS_LABELS[status]
      : null,
    trialStartAt: subscription?.trialStartAt?.toISOString() ?? null,
    trialEndAt: subscription?.trialEndAt?.toISOString() ?? null,
    providerKey: subscription?.providerKey ?? null,
    prices: {
      monthlyCents,
      annualCents,
      custom: monthlyCents === null && annualCents === null,
    },
    grandfatheredPricing:
      configured &&
      (overrideMonthly !== null || overrideAnnual !== null),
    entitlements: [...definition.entitlements],
    limits,
  };
}

/** User-safe plan-limit error messages (no internals, no provider detail). */
export function vehicleLimitErrorMessage(
  planLabel: string,
  limit: number,
): string {
  return `Vehicle limit reached. Your ${planLabel} plan allows up to ${limit} active vehicles. Upgrade your plan to add more vehicles.`;
}

export function integrationLimitErrorMessage(
  planLabel: string,
  limit: number,
): string {
  return `Integration limit reached. Your ${planLabel} plan includes ${limit} active integration${limit === 1 ? "" : "s"}. Disconnect the existing integration or upgrade your plan.`;
}
