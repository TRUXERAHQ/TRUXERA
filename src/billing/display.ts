import {
  BILLING_PLANS,
  ENTITLEMENT_LABELS,
  type BillingPlanKey,
  type EntitlementKey,
  type UsageLimit,
} from "./billing.ts";

/** Customer-facing price formatting from integer cents. */
export function formatPlanPrice(cents: number | null): string {
  if (cents === null) return "Custom";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Annual-vs-monthly savings percentage derived from catalog values. */
export function annualSavingsPercent(plan: BillingPlanKey): number | null {
  const prices = BILLING_PLANS[plan].prices;
  if (!prices?.monthlyCents || !prices.annualCents) return null;
  const monthlyYearly = prices.monthlyCents * 12;
  if (monthlyYearly <= prices.annualCents) return null;
  return Math.round(((monthlyYearly - prices.annualCents) / monthlyYearly) * 100);
}

/** "Up to 25 vehicles" / "Unlimited integrations" / "Custom fleet size". */
export function formatAllowance(limit: UsageLimit, noun: string): string {
  if (typeof limit === "number") {
    const singular = noun.endsWith("s") ? noun.slice(0, -1) : noun;
    return `Up to ${limit} ${limit === 1 ? singular : noun}`;
  }
  if (limit === "custom") return `Custom ${noun}`;
  if (limit === "unlimited") return `Unlimited ${noun}`;
  return noun;
}

const ENTITLEMENT_DISPLAY: Partial<Record<EntitlementKey, string>> = {
  CORE_RISK_INTELLIGENCE: "Risk detection & delay intelligence",
  RECOVERY_RECOMMENDATIONS: "Recovery recommendations",
  LOAD_REASSIGNMENT: "Load reassignment",
  RECOVERY_IMPACT: "Recovery impact measurement",
  OPERATIONAL_HISTORY: "Operational history",
  DAILY_SUMMARY: "Daily operations summary",
  BASIC_REPORTING: "Reporting",
  ADVANCED_INTELLIGENCE: "Advanced operational intelligence",
  ADVANCED_RECOVERY: "Advanced recovery intelligence",
  CAPACITY_BALANCING: "Resource & capacity balancing",
  EXECUTIVE_REPORTING: "Executive reporting",
  API_ACCESS: "API access",
  INTEGRATION_MONITORING: "Integration monitoring",
  ADVANCED_OPERATIONAL_HISTORY: "Advanced operational history",
  PRIORITY_SUPPORT: "Priority support",
};

/** Display priority — differentiating capabilities surface first. */
const FEATURE_PRIORITY: readonly EntitlementKey[] = [
  "CORE_RISK_INTELLIGENCE",
  "ADVANCED_INTELLIGENCE",
  "ADVANCED_RECOVERY",
  "CAPACITY_BALANCING",
  "EXECUTIVE_REPORTING",
  "API_ACCESS",
  "INTEGRATION_MONITORING",
  "ADVANCED_OPERATIONAL_HISTORY",
  "PRIORITY_SUPPORT",
  "RECOVERY_RECOMMENDATIONS",
  "LOAD_REASSIGNMENT",
  "RECOVERY_IMPACT",
  "OPERATIONAL_HISTORY",
  "DAILY_SUMMARY",
  "BASIC_REPORTING",
];

/**
 * Concise customer-facing capability bullets for a plan — derived from
 * the entitlement catalog so plan changes stay centralized.
 */
export function planFeatureBullets(plan: BillingPlanKey): string[] {
  const entitlements = new Set(BILLING_PLANS[plan].entitlements);
  const ordered = FEATURE_PRIORITY.filter((key) => entitlements.has(key));
  for (const key of BILLING_PLANS[plan].entitlements) {
    if (!ordered.includes(key)) ordered.push(key);
  }
  return ordered
    .map((key) => ENTITLEMENT_DISPLAY[key] ?? ENTITLEMENT_LABELS[key])
    .slice(0, 8);
}
