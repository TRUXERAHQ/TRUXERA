import { createHmac, timingSafeEqual } from "node:crypto";
import { connectDatabase, db } from "../../prisma/db.ts";
import { redactSecrets } from "../../integrations/errors.ts";
import { getPaddleWebhookSecret, PADDLE_PROVIDER_KEY } from "./client.ts";
import {
  syncPaddleSubscription,
  syncPaddleTransactionPayment,
} from "./sync.ts";

export type PaddleWebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Paddle notification events that mutate billing state. Subscription
 * events carry the complete subscription entity; transaction payment
 * events carry the transaction entity (with subscription_id when the
 * transaction belongs to a subscription).
 */
const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.resumed",
  "subscription.trialing",
  "subscription.paused",
  "subscription.past_due",
  "subscription.canceled",
  "subscription.imported",
]);

const PAID_TRANSACTION_EVENTS = new Set([
  "transaction.completed",
  "transaction.paid",
  "transaction.billed",
]);

const FAILED_TRANSACTION_EVENTS = new Set(["transaction.payment_failed"]);

const HANDLED_EVENTS = new Set([
  ...SUBSCRIPTION_EVENTS,
  ...PAID_TRANSACTION_EVENTS,
  ...FAILED_TRANSACTION_EVENTS,
]);

/** Reject signatures older than this — replay protection. */
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message).slice(0, 300);
}

/**
 * Verifies a Paddle-Signature header per the official Paddle Billing
 * scheme: `ts=<unix>;h1=<hmac-sha256-hex>` where the digest is
 * HMAC-SHA256 of `${ts}:${rawBody}` keyed with the notification
 * destination secret. Comparison is constant-time; stale timestamps
 * are rejected.
 */
export function verifyPaddleSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
  now?: number;
}): boolean {
  const header = input.signature;
  if (!header) return false;

  let ts: string | null = null;
  const h1Values: string[] = [];
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts") ts = value;
    if (key === "h1") h1Values.push(value);
  }
  if (!ts || h1Values.length === 0) return false;

  const tsSeconds = Number(ts);
  if (!Number.isFinite(tsSeconds)) return false;
  const age = Math.abs((input.now ?? Date.now()) - tsSeconds * 1000);
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_MS) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${ts}:${input.rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  return h1Values.some((candidate) => {
    const candidateBuf = Buffer.from(candidate, "utf8");
    return (
      candidateBuf.length === expectedBuf.length &&
      timingSafeEqual(candidateBuf, expectedBuf)
    );
  });
}

type PaddleNotification = {
  event_id?: unknown;
  event_type?: unknown;
  data?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function notificationOrganizationId(data: Record<string, unknown>): string | null {
  const customData = asRecord(data["custom_data"]);
  return asString(customData?.["organizationId"]);
}

async function recordEvent(input: {
  providerEventId: string;
  type: string;
  organizationId: string | null;
  status: string;
  error?: string | null;
}) {
  await db.orm.public.BillingWebhookEvent.where({
    providerKey: PADDLE_PROVIDER_KEY,
    providerEventId: input.providerEventId,
  }).update({
    status: input.status,
    error: input.error ?? null,
  });
}

/**
 * Claims a webhook event for processing. Returns "duplicate" when the
 * event was already PROCESSED; "retry" when a previous attempt FAILED
 * and Paddle is retrying; "claimed" for fresh processing.
 */
async function claimEvent(input: {
  providerEventId: string;
  type: string;
  organizationId: string | null;
}): Promise<"claimed" | "duplicate" | "retry"> {
  const existing = await db.orm.public.BillingWebhookEvent.where({
    providerKey: PADDLE_PROVIDER_KEY,
    providerEventId: input.providerEventId,
  }).first();

  if (existing?.status === "PROCESSED") return "duplicate";
  if (existing) return "retry";

  try {
    await db.orm.public.BillingWebhookEvent.create({
      providerKey: PADDLE_PROVIDER_KEY,
      providerEventId: input.providerEventId,
      type: input.type,
      organizationId: input.organizationId,
      status: "RECEIVED",
    });
    return "claimed";
  } catch {
    // Unique-constraint race: another delivery claimed it first.
    const raced = await db.orm.public.BillingWebhookEvent.where({
      providerKey: PADDLE_PROVIDER_KEY,
      providerEventId: input.providerEventId,
    }).first();
    return raced?.status === "PROCESSED" ? "duplicate" : "retry";
  }
}

function normalizeSubscription(data: Record<string, unknown>) {
  const items = Array.isArray(data["items"]) ? data["items"] : [];
  const billingPeriod = asRecord(data["current_billing_period"]);
  return {
    id: asString(data["id"]) ?? "",
    customerId: asString(data["customer_id"]),
    status: asString(data["status"]) ?? "",
    customData: asRecord(data["custom_data"]),
    items: items.map((item) => {
      const record = asRecord(item);
      const price = asRecord(record?.["price"]);
      return { price: { id: asString(price?.["id"]) } };
    }),
    nextBilledAt: asString(data["next_billed_at"]),
    currentBillingPeriod: billingPeriod
      ? {
          startsAt: asString(billingPeriod["starts_at"]),
          endsAt: asString(billingPeriod["ends_at"]),
        }
      : null,
  };
}

async function processNotification(
  notification: PaddleNotification,
): Promise<{ organizationId: string | null }> {
  const type = asString(notification.event_type) ?? "";
  const data = asRecord(notification.data);
  if (!data) return { organizationId: null };

  if (SUBSCRIPTION_EVENTS.has(type)) {
    const subscription = normalizeSubscription(data);
    if (!subscription.id) return { organizationId: null };
    const result = await syncPaddleSubscription(subscription);
    if (!result.ok) throw new Error(result.error);
    return { organizationId: result.organizationId };
  }

  if (
    PAID_TRANSACTION_EVENTS.has(type) ||
    FAILED_TRANSACTION_EVENTS.has(type)
  ) {
    const outcome = FAILED_TRANSACTION_EVENTS.has(type) ? "failed" : "paid";
    const result = await syncPaddleTransactionPayment({
      subscriptionId: asString(data["subscription_id"]),
      customerId: asString(data["customer_id"]),
      outcome,
    });
    if (!result.ok) throw new Error(result.error);
    return { organizationId: result.organizationId };
  }

  return { organizationId: null };
}

/**
 * Verifies and processes a Paddle webhook delivery. Signature
 * verification is mandatory — unverified payloads are rejected before
 * any processing. Processing is idempotent via BillingWebhookEvent's
 * unique (providerKey, providerEventId).
 */
export async function handlePaddleWebhook(
  rawBody: string,
  signature: string | null,
): Promise<PaddleWebhookResult> {
  const webhookSecret = getPaddleWebhookSecret();
  if (!webhookSecret) {
    console.error("[billing:paddle] webhook rejected: secret not configured");
    return {
      status: 503,
      body: { error: "Billing webhooks are not configured." },
    };
  }
  if (!signature) {
    console.warn("[billing:paddle] webhook rejected: missing signature");
    return { status: 400, body: { error: "Missing webhook signature." } };
  }
  if (!verifyPaddleSignature({ rawBody, signature, secret: webhookSecret })) {
    console.warn("[billing:paddle] webhook rejected: invalid signature");
    return { status: 400, body: { error: "Invalid webhook signature." } };
  }

  let notification: PaddleNotification;
  try {
    notification = JSON.parse(rawBody) as PaddleNotification;
  } catch {
    return { status: 400, body: { error: "Malformed webhook payload." } };
  }
  if (!notification || typeof notification !== "object") {
    return { status: 400, body: { error: "Malformed webhook payload." } };
  }

  const eventType = asString(notification.event_type) ?? "";
  const eventId = asString(notification.event_id);
  if (!eventId) {
    return { status: 400, body: { error: "Malformed webhook payload." } };
  }

  if (!HANDLED_EVENTS.has(eventType)) {
    console.log(
      `[billing:paddle] webhook ignored: unhandled type=${eventType || "unknown"} id=${eventId}`,
    );
    return { status: 200, body: { received: true, ignored: true } };
  }

  await connectDatabase();

  const data = asRecord(notification.data);
  const claim = await claimEvent({
    providerEventId: eventId,
    type: eventType,
    organizationId: data ? notificationOrganizationId(data) : null,
  });
  if (claim === "duplicate") {
    console.log(
      `[billing:paddle] webhook duplicate: type=${eventType} id=${eventId}`,
    );
    return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    const { organizationId } = await processNotification(notification);
    await recordEvent({
      providerEventId: eventId,
      type: eventType,
      organizationId,
      status: "PROCESSED",
    });
    console.log(
      `[billing:paddle] webhook processed: type=${eventType} id=${eventId} org=${organizationId ?? "none"}`,
    );
    return { status: 200, body: { received: true } };
  } catch (error) {
    console.error(
      `[billing:paddle] webhook processing failed: type=${eventType} id=${eventId}`,
      safeError(error),
    );
    await recordEvent({
      providerEventId: eventId,
      type: eventType,
      organizationId: data ? notificationOrganizationId(data) : null,
      status: "FAILED",
      error: safeError(error),
    });
    return { status: 500, body: { error: "Webhook processing failed." } };
  }
}
