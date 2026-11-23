import type Stripe from "stripe";
import { connectDatabase, db } from "../../prisma/db.ts";
import { redactSecrets } from "../../integrations/errors.ts";
import { getStripeClient, getStripeWebhookSecret, STRIPE_PROVIDER_KEY } from "./client.ts";
import { syncStripeInvoice, syncStripeSubscription } from "./sync.ts";

export type WebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message).slice(0, 300);
}

async function recordEvent(input: {
  providerEventId: string;
  type: string;
  organizationId: string | null;
  status: string;
  error?: string | null;
}) {
  await db.orm.public.BillingWebhookEvent.where({
    providerKey: STRIPE_PROVIDER_KEY,
    providerEventId: input.providerEventId,
  }).update({
    status: input.status,
    error: input.error ?? null,
  });
}

/**
 * Claims a webhook event for processing. Returns "duplicate" when the
 * event was already PROCESSED; "retry" when a previous attempt FAILED
 * and Stripe is retrying; "claimed" for fresh processing.
 */
async function claimEvent(input: {
  providerEventId: string;
  type: string;
  organizationId: string | null;
}): Promise<"claimed" | "duplicate" | "retry"> {
  const existing = await db.orm.public.BillingWebhookEvent.where({
    providerKey: STRIPE_PROVIDER_KEY,
    providerEventId: input.providerEventId,
  }).first();

  if (existing?.status === "PROCESSED") return "duplicate";
  if (existing) return "retry";

  try {
    await db.orm.public.BillingWebhookEvent.create({
      providerKey: STRIPE_PROVIDER_KEY,
      providerEventId: input.providerEventId,
      type: input.type,
      organizationId: input.organizationId,
      status: "RECEIVED",
    });
    return "claimed";
  } catch {
    // Unique-constraint race: another delivery claimed it first.
    const raced = await db.orm.public.BillingWebhookEvent.where({
      providerKey: STRIPE_PROVIDER_KEY,
      providerEventId: input.providerEventId,
    }).first();
    return raced?.status === "PROCESSED" ? "duplicate" : "retry";
  }
}

function eventOrganizationId(event: Stripe.Event): string | null {
  const obj = event.data.object as {
    metadata?: Record<string, string> | null;
    client_reference_id?: string | null;
    subscription_details?: { metadata?: Record<string, string> | null } | null;
  };
  return (
    obj.metadata?.["organizationId"] ??
    obj.client_reference_id ??
    obj.subscription_details?.metadata?.["organizationId"] ??
    null
  );
}

async function processEvent(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<{ organizationId: string | null }> {
  const object = event.data.object as unknown as Record<string, unknown>;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = object as {
        subscription?: unknown;
        customer?: unknown;
        metadata?: Record<string, string> | null;
      };
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription && typeof session.subscription === "object"
            ? (session.subscription as { id?: string }).id ?? null
            : null;
      if (!subscriptionId) return { organizationId: null };
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const result = await syncStripeSubscription(subscription);
      if (!result.ok) throw new Error(result.error);
      return { organizationId: result.organizationId };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const result = await syncStripeSubscription(
        object as Parameters<typeof syncStripeSubscription>[0],
      );
      if (!result.ok) throw new Error(result.error);
      return { organizationId: result.organizationId };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = object as {
        subscription?: unknown;
        customer?: unknown;
      };
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription && typeof invoice.subscription === "object"
            ? (invoice.subscription as { id?: string }).id ?? null
            : null;
      const result = await syncStripeInvoice({
        subscriptionId,
        customerId:
          typeof invoice.customer === "string" ? invoice.customer : null,
        paid: event.type === "invoice.paid",
      });
      if (!result.ok) throw new Error(result.error);
      return { organizationId: result.organizationId };
    }

    default:
      return { organizationId: null };
  }
}

/**
 * Verifies and processes a Stripe webhook delivery. Signature
 * verification is mandatory — unverified payloads are rejected before
 * any processing. Processing is idempotent via BillingWebhookEvent's
 * unique (providerKey, providerEventId).
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<WebhookResult> {
  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    return {
      status: 503,
      body: { error: "Billing webhooks are not configured." },
    };
  }
  if (!signature) {
    return { status: 400, body: { error: "Missing webhook signature." } };
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch {
    return { status: 400, body: { error: "Invalid webhook signature." } };
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return { status: 200, body: { received: true, ignored: true } };
  }

  await connectDatabase();

  const claim = await claimEvent({
    providerEventId: event.id,
    type: event.type,
    organizationId: eventOrganizationId(event),
  });
  if (claim === "duplicate") {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    const { organizationId } = await processEvent(stripe, event);
    await recordEvent({
      providerEventId: event.id,
      type: event.type,
      organizationId,
      status: "PROCESSED",
    });
    return { status: 200, body: { received: true } };
  } catch (error) {
    await recordEvent({
      providerEventId: event.id,
      type: event.type,
      organizationId: eventOrganizationId(event),
      status: "FAILED",
      error: safeError(error),
    });
    return { status: 500, body: { error: "Webhook processing failed." } };
  }
}
