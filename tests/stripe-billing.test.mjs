import assert from "node:assert/strict";
import test from "node:test";

// Env must be set before the stripe modules are imported (client caches).
process.env["STRIPE_SECRET_KEY"] = "sk_test_unit_test_key";
process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_unit_test_secret";
process.env["STRIPE_PRICE_STARTER_MONTHLY"] = "price_starter_monthly_test";
process.env["STRIPE_PRICE_STARTER_ANNUAL"] = "price_starter_annual_test";
process.env["STRIPE_PRICE_PROFESSIONAL_MONTHLY"] = "price_pro_monthly_test";
process.env["STRIPE_PRICE_PROFESSIONAL_ANNUAL"] = "price_pro_annual_test";

const { resolveBillingProvider } = await import("../src/billing/provider.ts");
const { resolveStripePriceId, resolvePlanIntervalFromPriceId, isCheckoutPlan } =
  await import("../src/billing/stripe/prices.ts");
const { parseCheckoutRequest, createCheckoutSession } = await import(
  "../src/billing/stripe/checkout.ts"
);
const { mapStripeSubscriptionStatus } = await import(
  "../src/billing/stripe/sync.ts"
);
const { getStripeClient, isTestStripeKey } = await import(
  "../src/billing/stripe/client.ts"
);
const { handleStripeWebhook } = await import(
  "../src/billing/stripe/webhook.ts"
);
const Stripe = (await import("stripe")).default;

test("provider resolves stripe only when configured", () => {
  assert.deepEqual(resolveBillingProvider({}), null);
  assert.deepEqual(
    resolveBillingProvider({ STRIPE_SECRET_KEY: "sk_test_abc" }),
    { key: "stripe" },
  );
  assert.deepEqual(resolveBillingProvider({ BILLING_PROVIDER: "stripe" }), {
    key: "stripe",
  });
  assert.equal(
    resolveBillingProvider({ BILLING_PROVIDER: "paypal" }),
    null,
  );
});

test("stripe client refuses non-test keys", () => {
  assert.equal(isTestStripeKey("sk_test_abc"), true);
  assert.equal(isTestStripeKey("sk_live_abc"), false);
  assert.equal(isTestStripeKey("rk_test_abc"), false);
  assert.equal(isTestStripeKey(""), false);
  assert.equal(isTestStripeKey(null), false);
  assert.notEqual(getStripeClient(), null);
});

test("price IDs resolve per plan and interval from env", () => {
  assert.equal(
    resolveStripePriceId("STARTER", "MONTHLY"),
    "price_starter_monthly_test",
  );
  assert.equal(
    resolveStripePriceId("STARTER", "ANNUAL"),
    "price_starter_annual_test",
  );
  assert.equal(
    resolveStripePriceId("PROFESSIONAL", "MONTHLY"),
    "price_pro_monthly_test",
  );
  assert.equal(
    resolveStripePriceId("PROFESSIONAL", "ANNUAL"),
    "price_pro_annual_test",
  );
});

test("trial and enterprise have no checkout price", () => {
  assert.equal(resolveStripePriceId("TRIAL", "MONTHLY"), null);
  assert.equal(resolveStripePriceId("ENTERPRISE", "ANNUAL"), null);
  assert.equal(isCheckoutPlan("STARTER"), true);
  assert.equal(isCheckoutPlan("PROFESSIONAL"), true);
});

test("price ID reverse lookup resolves plan and interval", () => {
  assert.deepEqual(
    resolvePlanIntervalFromPriceId("price_starter_annual_test"),
    { plan: "STARTER", interval: "ANNUAL" },
  );
  assert.equal(resolvePlanIntervalFromPriceId("price_unknown"), null);
  assert.equal(resolvePlanIntervalFromPriceId(null), null);
});

test("checkout request rejects arbitrary plans, intervals, and price IDs", () => {
  assert.deepEqual(parseCheckoutRequest({ plan: "STARTER", interval: "MONTHLY" }).ok, true);
  assert.equal(parseCheckoutRequest({ plan: "ENTERPRISE", interval: "MONTHLY" }).ok, false);
  assert.equal(parseCheckoutRequest({ plan: "TRIAL", interval: "ANNUAL" }).ok, false);
  assert.equal(parseCheckoutRequest({ plan: "STARTER", interval: "WEEKLY" }).ok, false);
  // A client-supplied price ID is not an accepted field at all.
  assert.equal(
    parseCheckoutRequest({ plan: "STARTER", interval: "MONTHLY", priceId: "price_evil" }).ok,
    true, // extra fields ignored — server resolves the real price ID
  );
});

test("checkout session uses server-resolved price and org metadata", async () => {
  const calls = [];
  const fakeStripe = {
    checkout: {
      sessions: {
        create: async (params) => {
          calls.push(params);
          return { url: "https://checkout.stripe.com/test" };
        },
      },
    },
  };
  const result = await createCheckoutSession({
    stripe: fakeStripe,
    organizationId: "org-123",
    plan: "STARTER",
    interval: "ANNUAL",
    customerEmail: "ops@example.com",
    baseUrl: "https://staging.truxera.net/",
  });
  assert.equal(result.ok, true);
  assert.equal(result.url, "https://checkout.stripe.com/test");
  const params = calls[0];
  assert.equal(params.mode, "subscription");
  assert.equal(params.line_items[0].price, "price_starter_annual_test");
  assert.equal(params.metadata.organizationId, "org-123");
  assert.equal(params.metadata.plan, "STARTER");
  assert.equal(params.metadata.interval, "ANNUAL");
  assert.equal(params.subscription_data.metadata.organizationId, "org-123");
  assert.equal(params.success_url.includes("billing=checkout_success"), true);
  assert.equal(params.cancel_url.includes("billing=checkout_canceled"), true);
});

test("checkout fails closed when price is not configured", async () => {
  const fakeStripe = { checkout: { sessions: { create: async () => ({ url: "x" }) } } };
  const prev = process.env["STRIPE_PRICE_STARTER_MONTHLY"];
  delete process.env["STRIPE_PRICE_STARTER_MONTHLY"];
  const result = await createCheckoutSession({
    stripe: fakeStripe,
    organizationId: "org-1",
    plan: "STARTER",
    interval: "MONTHLY",
    baseUrl: "https://x.test",
  });
  process.env["STRIPE_PRICE_STARTER_MONTHLY"] = prev;
  assert.equal(result.ok, false);
});

test("stripe subscription status mapping is vendor-neutral", () => {
  assert.equal(mapStripeSubscriptionStatus("trialing"), "TRIAL");
  assert.equal(mapStripeSubscriptionStatus("active"), "ACTIVE");
  assert.equal(mapStripeSubscriptionStatus("active", true), "ACTIVE"); // cancel at period end stays active
  assert.equal(mapStripeSubscriptionStatus("past_due"), "PAUSED");
  assert.equal(mapStripeSubscriptionStatus("unpaid"), "PAUSED");
  assert.equal(mapStripeSubscriptionStatus("incomplete"), "PAUSED");
  assert.equal(mapStripeSubscriptionStatus("paused"), "PAUSED");
  assert.equal(mapStripeSubscriptionStatus("canceled"), "CANCELED");
  assert.equal(mapStripeSubscriptionStatus("incomplete_expired"), "CANCELED");
  assert.equal(mapStripeSubscriptionStatus("something_new"), null);
});

async function signedPayload(payload, secret) {
  const stripe = new Stripe("sk_test_unit_test_key");
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
}

test("webhook rejects missing and invalid signatures", async () => {
  const payload = JSON.stringify({ id: "evt_1", type: "ping" });
  const missing = await handleStripeWebhook(payload, null);
  assert.equal(missing.status, 400);
  const bad = await handleStripeWebhook(payload, "t=1,v1=bad");
  assert.equal(bad.status, 400);
});

test("webhook accepts a valid signature for unhandled events", async () => {
  const payload = JSON.stringify({
    id: "evt_unhandled_1",
    object: "event",
    type: "product.created",
    data: { object: {} },
  });
  const signature = await signedPayload(payload, "whsec_unit_test_secret");
  const result = await handleStripeWebhook(payload, signature);
  assert.equal(result.status, 200);
  assert.equal(result.body.ignored, true);
});

test("webhook error responses never leak secrets", async () => {
  const payload = JSON.stringify({ id: "evt_x", type: "ping" });
  const bad = await handleStripeWebhook(payload, "t=1,v1=bad");
  const serialized = JSON.stringify(bad.body);
  assert.equal(serialized.includes("whsec_"), false);
  assert.equal(serialized.includes("sk_test"), false);
});
