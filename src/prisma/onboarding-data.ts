import { connectDatabase, db } from "./db";
import { getMembershipForUserInOrganization } from "./organization-data";
import { authorizeFleetAccess, isUuid } from "../trucks/truck-policy";
import type {
  OnboardingFacts,
  OnboardingIntegrationSummary,
} from "../onboarding/onboarding";

/**
 * Org-scoped onboarding facts. Every query is filtered by organizationId;
 * read access requires an existing organization membership. Returns null
 * when the user cannot read the organization.
 */
export async function getOnboardingFactsForUser(
  userId: string,
  organizationId: string,
  integrations: OnboardingIntegrationSummary[] = [],
): Promise<OnboardingFacts | null> {
  if (!isUuid(organizationId)) return null;
  await connectDatabase();

  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  if (!authorizeFleetAccess(membership, organizationId)) return null;

  const [organization, memberships, truck, driver, load, delivery] =
    await Promise.all([
      db.orm.public.Organization.where({ id: organizationId }).first(),
      db.orm.public.Membership.where({ organizationId }).all(),
      db.orm.public.Truck.where({
        organizationId,
        deactivatedAt: null,
      }).first(),
      db.orm.public.Driver.where({ organizationId }).first(),
      db.orm.public.Load.where({ organizationId }).first(),
      db.orm.public.Delivery.where({ organizationId }).first(),
    ]);

  if (!organization) return null;

  return {
    organizationName: organization.name,
    hasOwner: memberships.some((m) => m.role === "OWNER"),
    hasAdmin: memberships.some(
      (m) => m.role === "OWNER" || m.role === "ADMIN",
    ),
    hasActiveTruck: truck !== null,
    hasDriver: driver !== null,
    hasLoad: load !== null,
    hasDelivery: delivery !== null,
    integrations,
  };
}
