import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { resolveBillingProvider } from "../src/billing/provider.ts";
import {
  resolvePaddlePriceId,
  resolvePlanIntervalFromPaddlePriceId,
} from "../src/billing/paddle/prices.ts";
import { mapPaddleSubscriptionStatus } from "../src/billing/paddle/sync.ts";
import { verifyPaddleSignature } from "../src/billing/paddle/webhook.ts";
import { parseCheckoutRequest } from "../src/billing/checkout-request.ts";

const PADDLE_ENV = {
  PADDLE_API_KEY: "pdl_sdbx_apikey_01testkey",
  PADDLE_PRICE_STARTER_MONTHLY: "pri_01startermonthly",
  PADDLE_PRICE_STARTER_ANNUAL: "pri_01starterannual",
  PADDLE_PRICE_PROFESSIONAL_MONTHLY: "pri_01promonthly",
  PADDLE_PRICE_PROFESSIONAL_ANNUAL: "pri_01proannual",
};

test("paddle provider resolves only with a sandbox API key", () => {
  assert.deepEqual(
    resolveBillingProvider({ PADDLE_API_KEY: "pdl_sdbx_apikey_01abc" }),
    { key: "paddle" },
  );
  // Live keys fail closed.
  assert.equal(
    resolveBillingProvider({ PADDLE_API_KEY: "pdl_live_apikey_01abc" }),
    null,
  );
  assert.equal(resolveBillingProvider({ PADDLE_API_KEY: "sk_test_x" }), null);
  assert.equal(resolveBillingProvider({}), null);
});

test("explicit BILLING_PROVIDER selects paddle or stripe", () => {
  assert.deepEqual(
    resolveBillingProvider({
      BILLING_PROVIDER: "paddle",
      PADDLE_API_KEY: "pdl_sdbx_apikey_01abc",
    }),
    { key: "paddle" },
  );
  // Explicit selection names the provider; credential validity is
  // enforced by the adapter client, not resolution.
  assert.deepEqual(resolveBillingProvider({ BILLING_PROVIDER: "paddle" }), {
    key: "paddle",
  });
  assert.deepEqual(
    resolveBillingProvider({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_x",
      PADDLE_API_KEY: "pdl_sdbx_apikey_01abc",
    }),
    { key: "stripe" },
  );
  assert.equal(resolveBillingProvider({ BILLING_PROVIDER: "paypal" }), null);
});

test("paddle wins over stripe when both are configured and no explicit provider", () => {
  assert.deepEqual(
    resolveBillingProvider({
      PADDLE_API_KEY: "pdl_sdbx_apikey_01abc",
      STRIPE_SECRET_KEY: "sk_test_x",
    }),
    { key: "paddle" },
  );
});

test("paddle price mapping resolves all four catalog prices", () => {
  assert.equal(
    resolvePaddlePriceId("STARTER", "MONTHLY", PADDLE_ENV),
    "pri_01startermonthly",
  );
  assert.equal(
    resolvePaddlePriceId("STARTER", "ANNUAL", PADDLE_ENV),
    "pri_01starterannual",
  );
  assert.equal(
    resolvePaddlePriceId("PROFESSIONAL", "MONTHLY", PADDLE_ENV),
    "pri_01promonthly",
  );
  assert.equal(
    resolvePaddlePriceId("PROFESSIONAL", "ANNUAL", PADDLE_ENV),
    "pri_01proannual",
  );
});

test("paddle price mapping rejects non-price values and non-checkout plans", () => {
  assert.equal(
    resolvePaddlePriceId("STARTER", "MONTHLY", {
      PADDLE_PRICE_STARTER_MONTHLY: "not-a-price",
    }),
    null,
  );
  assert.equal(resolvePaddlePriceId("ENTERPRISE", "MONTHLY", PADDLE_ENV), null);
  assert.equal(resolvePaddlePriceId("TRIAL", "ANNUAL", PADDLE_ENV), null);
});

test("paddle price reverse lookup resolves plan and interval", () => {
  assert.deepEqual(
    resolvePlanIntervalFromPaddlePriceId("pri_01proannual", PADDLE_ENV),
    { plan: "PROFESSIONAL", interval: "ANNUAL" },
  );
  assert.equal(
    resolvePlanIntervalFromPaddlePriceId("pri_unknown", PADDLE_ENV),
    null,
  );
});

test("checkout request validation is provider-neutral", () => {
  assert.equal(
    parseCheckoutRequest({ plan: "STARTER", interval: "MONTHLY" }).ok,
    true,
  );
  assert.equal(
    parseCheckoutRequest({ plan: "ENTERPRISE", interval: "MONTHLY" }).ok,
    false,
  );
  assert.equal(
    parseCheckoutRequest({ plan: "STARTER", interval: "WEEKLY" }).ok,
    false,
  );
  // Client cannot inject a provider price identifier.
  assert.equal(
    parseCheckoutRequest({
      plan: "STARTER",
      interval: "MONTHLY",
      priceId: "pri_evil",
    }).ok,
    true, // extra fields ignored — server resolves the real price ID
  );
});

test("paddle subscription status mapping is safe and total", () => {
  assert.equal(mapPaddleSubscriptionStatus("active"), "ACTIVE");
  assert.equal(mapPaddleSubscriptionStatus("trialing"), "TRIAL");
  assert.equal(mapPaddleSubscriptionStatus("past_due"), "PAUSED");
  assert.equal(mapPaddleSubscriptionStatus("paused"), "PAUSED");
  assert.equal(mapPaddleSubscriptionStatus("canceled"), "CANCELED");
  // Unknown provider states never become ACTIVE.
  assert.equal(mapPaddleSubscriptionStatus("something_new"), null);
  assert.equal(mapPaddleSubscriptionStatus(""), null);
});

function signPaddle(body, secret, ts) {
  const timestamp = ts ?? Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", secret)
    .update(`${timestamp}:${body}`)
    .digest("hex");
  return { header: `ts=${timestamp};h1=${h1}`, timestamp };
}

test("paddle signature verification accepts valid signatures", () => {
  const secret = "pdl_ntfset_01testsecret";
  const body = JSON.stringify({ event_id: "evt_1", event_type: "subscription.updated", data: {} });
  const { header } = signPaddle(body, secret);
  assert.equal(
    verifyPaddleSignature({ rawBody: body, signature: header, secret }),
    true,
  );
});

test("paddle signature verification rejects tampering and forgeries", () => {
  const secret = "pdl_ntfset_01testsecret";
  const body = JSON.stringify({ event_id: "evt_1", event_type: "subscription.updated", data: {} });
  const { header } = signPaddle(body, secret);

  // Wrong secret.
  assert.equal(
    verifyPaddleSignature({
      rawBody: body,
      signature: header,
      secret: "pdl_ntfset_wrong",
    }),
    false,
  );
  // Tampered body.
  assert.equal(
    verifyPaddleSignature({
      rawBody: body.replace("evt_1", "evt_2"),
      signature: header,
      secret,
    }),
    false,
  );
  // Missing signature.
  assert.equal(
    verifyPaddleSignature({ rawBody: body, signature: null, secret }),
    false,
  );
  // Stale timestamp.
  const stale = signPaddle(body, secret, Math.floor(Date.now() / 1000) - 3600);
  assert.equal(
    verifyPaddleSignature({ rawBody: body, signature: stale.header, secret }),
    false,
  );
  // Malformed header.
  assert.equal(
    verifyPaddleSignature({ rawBody: body, signature: "garbage", secret }),
    false,
  );
});

test("paddle trial dates map next_billed_at and billing period correctly", async () => {
  const { paddleTrialDates } = await import("../src/billing/paddle/sync.ts");
  const dates = paddleTrialDates({
    id: "sub_01",
    customerId: "ctm_01",
    status: "trialing",
    nextBilledAt: "2026-12-05T10:00:00.000Z",
    currentBillingPeriod: {
      startsAt: "2026-11-28T10:00:00.000Z",
      endsAt: "2026-12-05T10:00:00.000Z",
    },
  });
  assert.equal(dates.trialStartAt?.toISOString(), "2026-11-28T10:00:00.000Z");
  assert.equal(dates.trialEndAt?.toISOString(), "2026-12-05T10:00:00.000Z");
});

test("paddle trial end falls back to billing period end", async () => {
  const { paddleTrialDates } = await import("../src/billing/paddle/sync.ts");
  const dates = paddleTrialDates({
    id: "sub_01",
    customerId: null,
    status: "trialing",
    nextBilledAt: null,
    currentBillingPeriod: {
      startsAt: "2026-11-28T10:00:00.000Z",
      endsAt: "2026-12-05T10:00:00.000Z",
    },
  });
  assert.equal(dates.trialEndAt?.toISOString(), "2026-12-05T10:00:00.000Z");
});

test("paddle trial dates are null when payload lacks timing fields", async () => {
  const { paddleTrialDates } = await import("../src/billing/paddle/sync.ts");
  const dates = paddleTrialDates({
    id: "sub_01",
    customerId: null,
    status: "trialing",
    nextBilledAt: "not-a-date",
    currentBillingPeriod: null,
  });
  assert.equal(dates.trialStartAt, null);
  assert.equal(dates.trialEndAt, null);
});
