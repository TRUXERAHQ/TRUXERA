/**
 * Billing & pricing foundation — pure, vendor-neutral domain logic.
 *
 * Organization is the customer account. A BillingSubscription row holds
 * the commercial state; plans, entitlements, and limits are a code
 * catalog so core business logic never imports a payment provider.
 *
 * This phase is informational only: nothing here blocks operations,
 * charges money, or contacts a provider.
 */

export type BillingPlanKey = "TRIAL" | "PROFESSIONAL" | "ENTERPRISE";

export type SubscriptionStatusKey =
  | "TRIAL"
  | "ACTIVE"
  | "PAUSED"
  | "CANCELED";

export type EntitlementKey =
  | "FLEET_OPERATIONS"
  | "RECOVERY_INTELLIGENCE"
  | "CONNECTED_INTEGRATIONS"
  | "ADVANCED_REPORTS"
  | "EXECUTIVE_REPORTS"
  | "API_ACCESS";

export type UsageLimitKey =
  | "vehicles"
  | "drivers"
  | "loads"
  | "deliveries"
  | "members"
  | "integrations";

/** A limit is a number, "unlimited", or null (not configured). */
export type UsageLimit = number | "unlimited" | null;

export type PlanDefinition = {
  key: BillingPlanKey;
  label: string;
  description: string;
  entitlements: readonly EntitlementKey[];
  limits: Record<UsageLimitKey, UsageLimit>;
};

const CORE_ENTITLEMENTS: readonly EntitlementKey[] = [
  "FLEET_OPERATIONS",
  "RECOVERY_INTELLIGENCE",
  "CONNECTED_INTEGRATIONS",
  "ADVANCED_REPORTS",
  "EXECUTIVE_REPORTS",
];

const UNLIMITED_LIMITS: Record<UsageLimitKey, UsageLimit> = {
  vehicles: "unlimited",
  drivers: "unlimited",
  loads: "unlimited",
  deliveries: "unlimited",
  members: "unlimited",
  integrations: "unlimited",
};

/**
 * Plan catalog. No prices are defined — commercial pricing is not yet
 * approved, so none are displayed or stored.
 */
export const BILLING_PLANS: Record<BillingPlanKey, PlanDefinition> = {
  TRIAL: {
    key: "TRIAL",
    label: "Trial",
    description: "Evaluation plan for onboarding and trials.",
    entitlements: CORE_ENTITLEMENTS,
    limits: UNLIMITED_LIMITS,
  },
  PROFESSIONAL: {
    key: "PROFESSIONAL",
    label: "Professional",
    description: "Primary commercial plan.",
    entitlements: [...CORE_ENTITLEMENTS, "API_ACCESS"],
    limits: UNLIMITED_LIMITS,
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    label: "Enterprise",
    description: "Custom commercial arrangement.",
    entitlements: [...CORE_ENTITLEMENTS, "API_ACCESS"],
    limits: UNLIMITED_LIMITS,
  },
};

export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  FLEET_OPERATIONS: "Fleet Operations",
  RECOVERY_INTELLIGENCE: "Recovery Intelligence",
  CONNECTED_INTEGRATIONS: "Connected Integrations",
  ADVANCED_REPORTS: "Advanced Reports",
  EXECUTIVE_REPORTS: "Executive Reports",
  API_ACCESS: "API Access",
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
  return value === "TRIAL" || value === "PROFESSIONAL" || value === "ENTERPRISE";
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
 * Evaluates usage against a plan limit. Limits are NOT enforced in this
 * phase — unconfigured ("unlimited"/null) limits always return
 * NOT_ENFORCED so callers can distinguish policy from enforcement.
 */
export function checkUsageWithinLimit(
  limit: UsageLimit,
  currentUsage: number,
): LimitCheck {
  if (limit === "unlimited" || limit === null) return "NOT_ENFORCED";
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
  entitlements: EntitlementKey[];
  limits: Record<UsageLimitKey, UsageLimit>;
};

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatusKey, string> = {
  TRIAL: "Trial",
  ACTIVE: "Active",
  PAUSED: "Paused",
  CANCELED: "Canceled",
};

/**
 * Resolves the billing state for display and policy checks. Pure — the
 * caller supplies the org's subscription row (or null).
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
    entitlements: [...definition.entitlements],
    limits: { ...definition.limits },
  };
}
