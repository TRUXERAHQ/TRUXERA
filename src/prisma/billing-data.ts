import { connectDatabase, db } from "./db";
import { getMembershipForUserInOrganization } from "./organization-data";
import { canReadIntegrations } from "@/src/integrations/policy";
import { isUuid } from "../trucks/truck-policy";
import {
  resolveBillingState,
  type BillingState,
  type UsageLimitKey,
} from "../billing/billing";
import { resolveBillingProvider } from "../billing/provider";
import { getStripeClient } from "../billing/stripe/client";
import { getPaddleClient } from "../billing/paddle/client";
import { getPaddleSubscriptionManagement } from "../billing/paddle/subscription";
import type { PaddleSubscriptionManagementUrls } from "../billing/paddle/subscription";

export type BillingUsage = Record<UsageLimitKey, number>;

export type BillingOverview = BillingState & {
  usage: BillingUsage;
  /** Whether a billing provider adapter is configured. */
  providerConnected: boolean;
  /** Resolved provider key when connected ("paddle" | "stripe"), else null. */
  billingProvider: string | null;
  /** Provider subscription ID, when the org has a provider subscription. */
  providerSubscriptionId: string | null;
  /** Paddle-hosted management URLs (update payment method / cancel). */
  managementUrls: PaddleSubscriptionManagementUrls | null;
};

/**
 * Organization-scoped billing overview for the Settings surface.
 * Read-only; gated by the existing member read authorization. Usage
 * counts are organization-scoped aggregates — never global.
 * Returns null when the user cannot read the organization.
 */
export async function getBillingOverviewForUser(
  userId: string,
  organizationId: string,
): Promise<BillingOverview | null> {
  if (!isUuid(organizationId)) return null;
  await connectDatabase();

  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  if (!membership || !canReadIntegrations(membership.role)) return null;

  const [subscription, trucks, drivers, loads, deliveries, members, integrations] =
    await Promise.all([
      db.orm.public.BillingSubscription.where({ organizationId }).first(),
      db.orm.public.Truck.where({ organizationId, deactivatedAt: null })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.Driver.where({ organizationId })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.Load.where({ organizationId })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.Delivery.where({ organizationId })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.Membership.where({ organizationId })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.Integration.where({ organizationId })
        .select("status")
        .all(),
    ]);

  const state = resolveBillingState(subscription);
  const activeIntegrations = integrations.filter(
    (row) => row.status !== "DISCONNECTED",
  ).length;
  const provider = resolveBillingProvider();
  // A resolved provider only counts as connected when its adapter is
  // actually usable (e.g. a test-mode Stripe key or Paddle Sandbox key
  // is present).
  const providerConnected =
    provider !== null &&
    (provider.key === "stripe"
      ? getStripeClient() !== null
      : provider.key === "paddle"
        ? getPaddleClient() !== null
        : false);

  // Paddle-hosted management URLs let customers update their payment
  // method or cancel without TRUXERA ever touching card data. Fetched
  // live because Paddle excludes management_urls from webhook payloads.
  let managementUrls: PaddleSubscriptionManagementUrls | null = null;
  if (
    providerConnected &&
    provider?.key === "paddle" &&
    subscription?.providerSubscriptionId
  ) {
    const paddle = getPaddleClient();
    if (paddle) {
      managementUrls = await getPaddleSubscriptionManagement(
        paddle,
        subscription.providerSubscriptionId,
      );
    }
  }

  return {
    ...state,
    usage: {
      vehicles: trucks.total,
      drivers: drivers.total,
      loads: loads.total,
      deliveries: deliveries.total,
      members: members.total,
      integrations: activeIntegrations,
    },
    providerConnected,
    billingProvider: providerConnected ? (provider?.key ?? null) : null,
    providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
    managementUrls,
  };
}
