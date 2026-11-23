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
} from "../src/billing/billing.ts";
import { resolveBillingProvider } from "../src/billing/provider.ts";

test("plan catalog contains exactly TRIAL, PROFESSIONAL, ENTERPRISE", () => {
  assert.deepEqual(Object.keys(BILLING_PLANS).sort(), [
    "ENTERPRISE",
    "PROFESSIONAL",
    "TRIAL",
  ]);
  for (const plan of Object.values(BILLING_PLANS)) {
    assert.ok(plan.entitlements.length > 0);
  }
});

test("no plan defines a price", () => {
  for (const plan of Object.values(BILLING_PLANS)) {
    assert.equal("price" in plan, false);
    assert.equal("priceCents" in plan, false);
    assert.equal("monthlyPrice" in plan, false);
  }
});

test("unknown or missing plan resolves to safe TRIAL default", () => {
  assert.equal(resolveEffectivePlan(null), "TRIAL");
  assert.equal(resolveEffectivePlan(undefined), "TRIAL");
  assert.equal(resolveEffectivePlan("GOLD"), "TRIAL");
  assert.equal(resolveEffectivePlan("stripe_pro"), "TRIAL");
  assert.equal(resolveEffectivePlan("PROFESSIONAL"), "PROFESSIONAL");
  assert.equal(isBillingPlanKey("ENTERPRISE"), true);
  assert.equal(isBillingPlanKey("PAST_DUE"), false);
});

test("entitlement resolution is deterministic per plan", () => {
  assert.equal(hasEntitlement("TRIAL", "FLEET_OPERATIONS"), true);
  assert.equal(hasEntitlement("TRIAL", "RECOVERY_INTELLIGENCE"), true);
  assert.equal(hasEntitlement("TRIAL", "CONNECTED_INTEGRATIONS"), true);
  assert.equal(hasEntitlement("TRIAL", "EXECUTIVE_REPORTS"), true);
  assert.equal(hasEntitlement("TRIAL", "API_ACCESS"), false);
  assert.equal(hasEntitlement("PROFESSIONAL", "API_ACCESS"), true);
  assert.equal(hasEntitlement("ENTERPRISE", "API_ACCESS"), true);
  assert.equal(hasEntitlement(null, "FLEET_OPERATIONS"), true);
  assert.equal(hasEntitlement("NOPE", "API_ACCESS"), false);
});

test("all current plans have unlimited, unenforced limits", () => {
  for (const key of ["TRIAL", "PROFESSIONAL", "ENTERPRISE"]) {
    const limits = getPlanLimits(key);
    for (const value of Object.values(limits)) {
      assert.equal(value, "unlimited");
    }
  }
});

test("limit check distinguishes enforced, exceeded, and not-enforced", () => {
  assert.equal(checkUsageWithinLimit("unlimited", 9999), "NOT_ENFORCED");
  assert.equal(checkUsageWithinLimit(null, 5), "NOT_ENFORCED");
  assert.equal(checkUsageWithinLimit(10, 10), "OK");
  assert.equal(checkUsageWithinLimit(10, 11), "EXCEEDED");
});

test("subscription status validation", () => {
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
  assert.equal(state.subscriptionStatusLabel, null);
  assert.equal(state.trialStartAt, null);
  assert.equal(state.trialEndAt, null);
  assert.equal(state.providerKey, null);
  assert.ok(state.entitlements.includes("FLEET_OPERATIONS"));
});

test("resolveBillingState reflects a configured subscription", () => {
  const state = resolveBillingState({
    plan: "PROFESSIONAL",
    status: "ACTIVE",
    trialStartAt: null,
    trialEndAt: null,
    providerKey: "stripe",
  });
  assert.equal(state.plan, "PROFESSIONAL");
  assert.equal(state.configured, true);
  assert.equal(state.subscriptionStatus, "ACTIVE");
  assert.equal(state.subscriptionStatusLabel, "Active");
  assert.equal(state.providerKey, "stripe");
  assert.ok(state.entitlements.includes("API_ACCESS"));
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

test("no billing provider resolves without credentials", () => {
  assert.equal(resolveBillingProvider({}), null);
  assert.equal(resolveBillingProvider({ BILLING_PROVIDER: "" }), null);
  // Even a configured key resolves to null — no adapters exist yet.
  assert.equal(resolveBillingProvider({ BILLING_PROVIDER: "stripe" }), null);
});
