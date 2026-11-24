import { connectDatabase, db } from "../../prisma/db.ts";
import {
  isBillingPlanKey,
  type BillingPlanKey,
  type SubscriptionStatusKey,
} from "../billing.ts";
import { resolvePlanIntervalFromPaddlePriceId } from "./prices.ts";
import { PADDLE_PROVIDER_KEY } from "./client.ts";

/**
 * Paddle subscription lifecycle → TRUXERA SubscriptionStatus.
 * Provider-specific states never leak into the domain model; unknown
 * states return null so callers leave the stored status untouched.
 *
 * Paddle statuses: active, trialing, past_due, paused, canceled.
 * past_due means an unpaid/overdue transaction — mapped to PAUSED,
 * matching the Stripe adapter's treatment of payment problems.
 */
export function mapPaddleSubscriptionStatus(
  status: string,
): SubscriptionStatusKey | null {
  switch (status) {
    case "trialing":
      return "TRIAL";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "paused":
      return "PAUSED";
    case "canceled":
      return "CANCELED";
    default:
      return null;
  }
}

export type PaddleSubscriptionSyncInput = {
  id: string;
  customerId: string | null;
  status: string;
  customData?: Record<string, unknown> | null;
  items?: Array<{ price?: { id?: string | null } | null } | null> | null;
};

export type PaddleSyncResult =
  | { ok: true; organizationId: string | null; created: boolean }
  | { ok: false; error: string };

/**
 * Synchronizes a Paddle subscription into BillingSubscription.
 *
 * Commercial-term override columns (prices, vehicle/integration limits)
 * are NEVER touched — grandfathered terms survive provider sync.
 * Plan is taken from subscription custom_data first (set server-side at
 * checkout), then reverse-resolved from the Paddle Price ID; it is only
 * written when confidently known.
 */
export async function syncPaddleSubscription(
  subscription: PaddleSubscriptionSyncInput,
): Promise<PaddleSyncResult> {
  await connectDatabase();

  const customData = subscription.customData ?? null;
  const organizationId =
    typeof customData?.["organizationId"] === "string"
      ? (customData["organizationId"] as string)
      : null;
  const mappedStatus = mapPaddleSubscriptionStatus(subscription.status);
  const priceId = subscription.items?.[0]?.price?.id ?? null;
  const pricePlan = resolvePlanIntervalFromPaddlePriceId(priceId);

  const metadataPlan = customData?.["plan"];
  const plan: BillingPlanKey | null = isBillingPlanKey(metadataPlan)
    ? metadataPlan
    : pricePlan?.plan ?? null;

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
        error: "Paddle subscription has no resolvable organization or plan.",
      };
    }
    await db.orm.public.BillingSubscription.create({
      organizationId,
      plan,
      status: mappedStatus ?? "ACTIVE",
      providerKey: PADDLE_PROVIDER_KEY,
      providerCustomerId: subscription.customerId,
      providerSubscriptionId: subscription.id,
    });
    return { ok: true, organizationId, created: true };
  }

  const update: Record<string, unknown> = {
    providerKey: PADDLE_PROVIDER_KEY,
    providerSubscriptionId: subscription.id,
  };
  if (subscription.customerId) {
    update["providerCustomerId"] = subscription.customerId;
  }
  if (mappedStatus) update["status"] = mappedStatus;
  if (plan) update["plan"] = plan;

  await db.orm.public.BillingSubscription.where({ id: target.id }).update(
    update as never,
  );
  return { ok: true, organizationId: target.organizationId, created: false };
}

/**
 * Transaction payment lifecycle → billing state.
 * transaction.payment_failed pauses billing state; transaction.paid /
 * transaction.completed / transaction.billed recover PAUSED → ACTIVE.
 * Account status, entitlements data, and overrides are untouched.
 */
export async function syncPaddleTransactionPayment(input: {
  subscriptionId: string | null;
  customerId: string | null;
  outcome: "paid" | "failed";
}): Promise<PaddleSyncResult> {
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

  // Payment events are best-effort recovery signals — subscription
  // events are authoritative. A transaction can arrive before Paddle
  // creates the subscription row, so an unmatched payment event is a
  // no-op rather than a failure that would be retried forever.
  if (!row || row.providerKey !== PADDLE_PROVIDER_KEY) {
    return { ok: true, organizationId: null, created: false };
  }

  if (input.outcome === "paid") {
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
