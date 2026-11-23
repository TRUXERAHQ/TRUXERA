import assert from "node:assert/strict";
import test from "node:test";
import {
  BILLING_PLANS,
  checkUsageWithinLimit,
  getPlanDefinition,
  getPlanLimits,
  hasEntitlement,
  isBillingPlanKey,
  isSubscriptionStatusKey,
  resolveBillingState,
  resolveEffectivePlan,
  vehicleLimitErrorMessage,
  integrationLimitErrorMessage,
} from "../src/billing/billing.ts";
import { resolveBillingProvider } from "../src/billing/provider.ts";

test("plan catalog contains exactly the commercial plans", () => {
  assert.deepEqual(Object.keys(BILLING_PLANS).sort(), [
    "ENTERPRISE",
    "PROFESSIONAL",
    "STARTER",
    "TRIAL",
  ]);
});

test("catalog prices are integer cents matching the approved pricing", () => {
  assert.deepEqual(BILLING_PLANS.STARTER.prices, {
    monthlyCents: 39900,
    annualCents: 382800,
  });
  assert.deepEqual(BILLING_PLANS.PROFESSIONAL.prices, {
    monthlyCents: 89900,
    annualCents: 862800,
  });
  assert.equal(BILLING_PLANS.ENTERPRISE.prices, null);
  assert.equal(BILLING_PLANS.TRIAL.prices, null);
  for (const plan of Object.values(BILLING_PLANS)) {
    if (!plan.prices) continue;
    for (const v of [plan.prices.monthlyCents, plan.prices.annualCents]) {
      assert.equal(Number.isInteger(v), true);
    }
  }
});

test("catalog vehicle and integration limits match approved pricing", () => {
  assert.equal(BILLING_PLANS.STARTER.limits.vehicles, 25);
  assert.equal(BILLING_PLANS.STARTER.limits.integrations, 1);
  assert.equal(BILLING_PLANS.PROFESSIONAL.limits.vehicles, 75);
  assert.equal(BILLING_PLANS.PROFESSIONAL.limits.integrations, "unlimited");
  assert.equal(BILLING_PLANS.ENTERPRISE.limits.vehicles, "custom");
  assert.equal(BILLING_PLANS.ENTERPRISE.limits.integrations, "custom");
});

test("unknown or missing plan resolves to safe TRIAL default", () => {
  assert.equal(resolveEffectivePlan(null), "TRIAL");
  assert.equal(resolveEffectivePlan(undefined), "TRIAL");
  assert.equal(resolveEffectivePlan("GOLD"), "TRIAL");
  assert.equal(resolveEffectivePlan("stripe_pro"), "TRIAL");
  assert.equal(resolveEffectivePlan("STARTER"), "STARTER");
  assert.equal(isBillingPlanKey("ENTERPRISE"), true);
  assert.equal(isBillingPlanKey("PAST_DUE"), false);
});

test("Starter entitles core features only", () => {
  for (const key of [
    "CORE_RISK_INTELLIGENCE",
    "RECOVERY_RECOMMENDATIONS",
    "LOAD_REASSIGNMENT",
    "RECOVERY_IMPACT",
    "OPERATIONAL_HISTORY",
    "DAILY_SUMMARY",
    "BASIC_REPORTING",
  ]) {
    assert.equal(hasEntitlement("STARTER", key), true, key);
  }
  for (const key of [
    "ADVANCED_INTELLIGENCE",
    "EXECUTIVE_REPORTING",
    "API_ACCESS",
    "PRIORITY_SUPPORT",
  ]) {
    assert.equal(hasEntitlement("STARTER", key), false, key);
  }
});

test("Professional and Enterprise entitle advanced features", () => {
  for (const plan of ["PROFESSIONAL", "ENTERPRISE", "TRIAL"]) {
    assert.equal(hasEntitlement(plan, "API_ACCESS"), true, plan);
    assert.equal(hasEntitlement(plan, "EXECUTIVE_REPORTING"), true, plan);
    assert.equal(hasEntitlement(plan, "ADVANCED_RECOVERY"), true, plan);
    assert.equal(hasEntitlement(plan, "PRIORITY_SUPPORT"), true, plan);
  }
});

test("limit check distinguishes enforced, exceeded, and not-enforced", () => {
  assert.equal(checkUsageWithinLimit(25, 25), "OK");
  assert.equal(checkUsageWithinLimit(25, 26), "EXCEEDED");
  assert.equal(checkUsageWithinLimit("unlimited", 9999), "NOT_ENFORCED");
  assert.equal(checkUsageWithinLimit("custom", 9999), "NOT_ENFORCED");
  assert.equal(checkUsageWithinLimit(null, 5), "NOT_ENFORCED");
});

test("subscription status validation rejects provider-specific states", () => {
  for (const s of ["TRIAL", "ACTIVE", "PAUSED", "CANCELED"]) {
    assert.equal(isSubscriptionStatusKey(s), true);
  }
  for (const s of ["stripe_past_due", "PAST_DUE", "CHURNED", ""]) {
    assert.equal(isSubscriptionStatusKey(s), false);
  }
});

test("resolveBillingState defaults missing subscription safely", () => {
  const state = resolveBillingState(null);
  assert.equal(state.plan, "TRIAL");
  assert.equal(state.configured, false);
  assert.equal(state.subscriptionStatus, null);
  assert.equal(state.trialStartAt, null);
  assert.equal(state.prices.custom, true);
  assert.equal(state.limits.vehicles, "unlimited");
});

test("starter subscription resolves catalog prices and limits", () => {
  const state = resolveBillingState({
    plan: "STARTER",
    status: "ACTIVE",
    trialStartAt: null,
    trialEndAt: null,
    providerKey: null,
  });
  assert.equal(state.plan, "STARTER");
  assert.equal(state.prices.monthlyCents, 39900);
  assert.equal(state.prices.annualCents, 382800);
  assert.equal(state.prices.custom, false);
  assert.equal(state.limits.vehicles, 25);
  assert.equal(state.limits.integrations, 1);
});

test("grandfathered overrides beat catalog without mutating it", () => {
  const state = resolveBillingState({
    plan: "STARTER",
    status: "ACTIVE",
    trialStartAt: null,
    trialEndAt: null,
    providerKey: null,
    monthlyPriceCents: 29900,
    vehicleLimit: 40,
    integrationLimit: 2,
  });
  assert.equal(state.prices.monthlyCents, 29900);
  assert.equal(state.prices.annualCents, 382800); // untouched catalog annual
  assert.equal(state.limits.vehicles, 40);
  assert.equal(state.limits.integrations, 2);
  assert.equal(state.grandfatheredPricing, true);
  // Catalog itself is unchanged — future customers still get 399/25/1.
  assert.equal(BILLING_PLANS.STARTER.prices?.monthlyCents, 39900);
  assert.equal(BILLING_PLANS.STARTER.limits.vehicles, 25);
});

test("enterprise custom terms stay custom unless overridden", () => {
  const state = resolveBillingState({
    plan: "ENTERPRISE",
    status: "ACTIVE",
    trialStartAt: null,
    trialEndAt: null,
    providerKey: null,
    vehicleLimit: 500,
  });
  assert.equal(state.prices.custom, true);
  assert.equal(state.limits.vehicles, 500);
  assert.equal(state.limits.integrations, "custom");
});

test("trial dates pass through as ISO strings only when present", () => {
  const start = new Date("2026-02-01T00:00:00Z");
  const end = new Date("2026-02-15T00:00:00Z");
  const state = resolveBillingState({
    plan: "TRIAL",
    status: "TRIAL",
    trialStartAt: start,
    trialEndAt: end,
    providerKey: null,
  });
  assert.equal(state.trialStartAt, start.toISOString());
  assert.equal(state.trialEndAt, end.toISOString());
});

test("plan definition lookup handles unknown plans safely", () => {
  const def = getPlanDefinition("NOT_A_PLAN");
  assert.equal(def.key, "TRIAL");
});

test("limit error messages are user-safe and plan-aware", () => {
  const v = vehicleLimitErrorMessage("Starter", 25);
  assert.match(v, /Vehicle limit reached/);
  assert.match(v, /25 active vehicles/);
  assert.doesNotMatch(v, /stack|SELECT|provider/i);
  const i = integrationLimitErrorMessage("Starter", 1);
  assert.match(i, /Integration limit reached/);
  assert.match(i, /1 active integration\b/);
  assert.doesNotMatch(i, /stack|SELECT|provider/i);
});

test("no billing provider resolves without credentials", () => {
  assert.equal(resolveBillingProvider({}), null);
  assert.equal(resolveBillingProvider({ BILLING_PROVIDER: "" }), null);
  assert.equal(resolveBillingProvider({ BILLING_PROVIDER: "stripe" }), null);
});
