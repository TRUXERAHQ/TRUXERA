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

export type BillingUsage = Record<UsageLimitKey, number>;

export type BillingOverview = BillingState & {
  usage: BillingUsage;
  /** Whether a billing provider adapter is configured (always false today). */
  providerConnected: boolean;
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
        .aggregate((aggregate) => ({ total: aggregate.count() })),
    ]);

  const state = resolveBillingState(subscription);

  return {
    ...state,
    usage: {
      vehicles: trucks.total,
      drivers: drivers.total,
      loads: loads.total,
      deliveries: deliveries.total,
      members: members.total,
      integrations: integrations.total,
    },
    providerConnected: resolveBillingProvider() !== null,
  };
}
