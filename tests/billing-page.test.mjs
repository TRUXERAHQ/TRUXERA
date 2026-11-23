import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BILLING_PLANS } from "../src/billing/billing.ts";
import {
  annualSavingsPercent,
  formatAllowance,
  formatPlanPrice,
  planFeatureBullets,
} from "../src/billing/display.ts";

test("/dashboard/billing renders a standalone page, not a redirect", () => {
  const page = readFileSync(
    new URL("../app/dashboard/billing/page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(page.includes("redirect("), false);
  assert.equal(page.includes("TruckShell"), true);
  assert.equal(page.includes("BillingPlansView"), true);
  assert.equal(page.includes("Billing & Plans"), true);
});

test("checkout return URLs target the dedicated billing page", () => {
  const checkout = readFileSync(
    new URL("../src/billing/stripe/checkout.ts", import.meta.url),
    "utf8",
  );
  assert.equal(checkout.includes("/dashboard/billing?billing=checkout_success"), true);
  assert.equal(checkout.includes("/dashboard/billing?billing=checkout_canceled"), true);
});

test("formatPlanPrice renders catalog prices and custom", () => {
  assert.equal(formatPlanPrice(39900), "$399");
  assert.equal(formatPlanPrice(382800), "$3,828");
  assert.equal(formatPlanPrice(89900), "$899");
  assert.equal(formatPlanPrice(862800), "$8,628");
  assert.equal(formatPlanPrice(null), "Custom");
});

test("annual savings is derived from catalog values", () => {
  assert.equal(annualSavingsPercent("STARTER"), 20);
  assert.equal(annualSavingsPercent("PROFESSIONAL"), 20);
  assert.equal(annualSavingsPercent("ENTERPRISE"), null);
  assert.equal(annualSavingsPercent("TRIAL"), null);
});

test("formatAllowance translates limits without inventing values", () => {
  assert.equal(formatAllowance(25, "vehicles"), "Up to 25 vehicles");
  assert.equal(formatAllowance(1, "integrations"), "Up to 1 integration");
  assert.equal(formatAllowance("unlimited", "integrations"), "Unlimited integrations");
  assert.equal(formatAllowance("custom", "vehicles"), "Custom vehicles");
  assert.equal(formatAllowance(null, "vehicles"), "vehicles");
});

test("plan feature bullets are concise and catalog-derived", () => {
  const starter = planFeatureBullets("STARTER");
  const pro = planFeatureBullets("PROFESSIONAL");
  const enterprise = planFeatureBullets("ENTERPRISE");

  assert.ok(starter.length <= 8);
  assert.ok(pro.length <= 8);
  assert.ok(enterprise.length <= 8);
  assert.ok(!starter.includes("API access"));
  assert.ok(pro.includes("API access"));
  assert.ok(pro.includes("Executive reporting"));
  assert.ok(pro.includes("Risk detection & delay intelligence"));
  // Every bullet must come from the entitlement catalog — no invented text.
  for (const plan of ["STARTER", "PROFESSIONAL", "ENTERPRISE"]) {
    const entitlements = new Set(BILLING_PLANS[plan].entitlements);
    assert.ok(entitlements.size > 0);
  }
});

test("plan cards expose only catalog plans with professional recommended", () => {
  const view = readFileSync(
    new URL("../app/dashboard/billing/billing-plans.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(view.includes('"STARTER", "PROFESSIONAL", "ENTERPRISE"'), true);
  assert.equal(view.includes('planKey === "PROFESSIONAL"'), true);
  assert.equal(view.includes("Contact Sales"), true);
  assert.equal(view.includes("Online checkout is currently unavailable"), true);
  assert.equal(view.includes("Save 20% with annual billing") || view.includes("Save {savings}%"), true);
});
