import type Stripe from "stripe";
import { connectDatabase, db } from "../../prisma/db.ts";
import {
  isBillingPlanKey,
  isSubscriptionStatusKey,
  type BillingInterval,
  type BillingPlanKey,
  type SubscriptionStatusKey,
} from "../billing.ts";
import { resolvePlanIntervalFromPriceId } from "./prices.ts";
import { STRIPE_PROVIDER_KEY } from "./client.ts";

/**
 * Stripe subscription lifecycle → TRUXERA SubscriptionStatus.
 * Provider-specific states never leak into the domain model; unknown
 * states return null so callers leave the stored status untouched.
 *
 * cancel_at_period_end does NOT cancel immediately — an active
 * subscription pending period-end cancellation remains ACTIVE, which is
 * the truthful state until Stripe reports it canceled.
 */
export function mapStripeSubscriptionStatus(
  status: string,
  cancelAtPeriodEnd = false,
): SubscriptionStatusKey | null {
  switch (status) {
    case "trialing":
      return "TRIAL";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "PAUSED";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return null;
  }
}

function unixToDate(value: number | null | undefined): Date | null {
  return typeof value === "number" && value > 0 ? new Date(value * 1000) : null;
}

function asStringId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export type StripeSubscriptionSyncInput = {
  id: string;
  customer: unknown;
  status: string;
  metadata?: Record<string, string> | null;
  trial_start?: number | null;
  trial_end?: number | null;
  cancel_at_period_end?: boolean | null;
  items?: { data?: Array<{ price?: { id?: string } }> } | null;
};

export type SyncResult =
  | { ok: true; organizationId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Synchronizes a Stripe subscription into BillingSubscription.
 *
 * Commercial-term override columns (prices, vehicle/integration limits)
 * are NEVER touched — grandfathered terms survive provider sync.
 * Plan is taken from subscription metadata first, then reverse-resolved
 * from the Stripe Price ID; it is only written when confidently known.
 */
export async function syncStripeSubscription(
  subscription: StripeSubscriptionSyncInput,
): Promise<SyncResult> {
  await connectDatabase();

  const organizationId = subscription.metadata?.["organizationId"] ?? null;
  const mappedStatus = mapStripeSubscriptionStatus(
    subscription.status,
    subscription.cancel_at_period_end ?? false,
  );
  const customerId = asStringId(subscription.customer);
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const pricePlan = resolvePlanIntervalFromPriceId(priceId);

  const metadataPlan = subscription.metadata?.["plan"];
  const plan: BillingPlanKey | null = isBillingPlanKey(metadataPlan)
    ? metadataPlan
    : pricePlan?.plan ?? null;

  const trialStart = unixToDate(subscription.trial_start);
  const trialEnd = unixToDate(subscription.trial_end);

  const existing = await db.orm.public.BillingSubscription.where({
    providerSubscriptionId: subscription.id,
  }).first();

  const target =
    existing ??
    (organizationId
      ? await db.orm.public.BillingSubscription.where({ organizationId })
          .first()
      : null);

  if (!target) {
    if (!organizationId || !plan) {
      return {
        ok: false,
        error: "Stripe subscription has no resolvable organization or plan.",
      };
    }
    const created = await db.orm.public.BillingSubscription.create({
      organizationId,
      plan,
      status: mappedStatus ?? "ACTIVE",
      providerKey: STRIPE_PROVIDER_KEY,
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      trialStartAt: trialStart,
      trialEndAt: trialEnd,
    });
    void created;
    return { ok: true, organizationId, created: true };
  }

  const update: Record<string, unknown> = {
    providerKey: STRIPE_PROVIDER_KEY,
    providerSubscriptionId: subscription.id,
  };
  if (customerId) update["providerCustomerId"] = customerId;
  if (mappedStatus) update["status"] = mappedStatus;
  if (plan) update["plan"] = plan;
  if (trialStart) update["trialStartAt"] = trialStart;
  if (trialEnd) update["trialEndAt"] = trialEnd;

  await db.orm.public.BillingSubscription.where({ id: target.id }).update(
    update as never,
  );
  return { ok: true, organizationId: target.organizationId, created: false };
}

/**
 * Invoice lifecycle → billing state. invoice.paid recovers a PAUSED
 * subscription to ACTIVE; invoice.payment_failed pauses billing state.
 * Account status, entitlements data, and overrides are untouched.
 */
export async function syncStripeInvoice(input: {
  subscriptionId: string | null;
  customerId: string | null;
  paid: boolean;
}): Promise<SyncResult> {
  await connectDatabase();

  const row = input.subscriptionId
    ? await db.orm.public.BillingSubscription.where({
        providerSubscriptionId: input.subscriptionId,
      }).first()
    : input.customerId
      ? await db.orm.public.BillingSubscription.where({
          providerCustomerId: input.customerId,
        }).first()
      : null;

  if (!row || row.providerKey !== STRIPE_PROVIDER_KEY) {
    return { ok: false, error: "No Stripe billing subscription matched." };
  }

  if (input.paid) {
    if (row.status === "PAUSED") {
      await db.orm.public.BillingSubscription.where({ id: row.id }).update({
        status: "ACTIVE",
      });
    }
  } else {
    if (row.status !== "CANCELED") {
      await db.orm.public.BillingSubscription.where({ id: row.id }).update({
        status: "PAUSED",
      });
    }
  }
  return { ok: true, organizationId: row.organizationId, created: false };
}

export type { Stripe };
