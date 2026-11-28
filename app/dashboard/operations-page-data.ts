import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { selectAccessibleOrganization } from "@/src/auth/tenant-policy";
import { canManageFleet } from "@/src/trucks/truck-policy";
import { checkOperationalAccess } from "@/src/billing/subscription-gate";
import {
  getMembershipForUserInOrganization,
  getOrganizationsForUser,
} from "@/src/prisma/organization-data";

export type OperationsSearchParams = {
  organizationId?: string | string[];
  created?: string | string[];
  updated?: string | string[];
  assigned?: string | string[];
  ended?: string | string[];
  reassigned?: string | string[];
  reassignedDeliveryId?: string | string[];
  statusUpdated?: string | string[];
  error?: string | string[];
  status?: string | string[];
  priority?: string | string[];
  category?: string | string[];
  view?: string | string[];
  replied?: string | string[];
  resolved?: string | string[];
  billing?: string | string[];
  integration?: string | string[];
  integrationError?: string | string[];
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getOperationsPageContext(
  searchParams: OperationsSearchParams,
  options?: { subscriptionExempt?: boolean },
) {
  await connection();

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const organizations = await getOrganizationsForUser(session.user.id);
  if (organizations.length === 0) redirect("/onboarding");

  const organization = selectAccessibleOrganization(
    organizations,
    firstValue(searchParams.organizationId),
  );
  if (!organization) redirect("/onboarding");

  const membership = await getMembershipForUserInOrganization(
    session.user.id,
    organization.id,
  );
  if (!membership) redirect("/onboarding");

  // Mandatory subscription gate: organizations created after the gate
  // launched must hold a valid subscription or provider-managed trial to
  // reach operational surfaces. Account/billing/help surfaces opt out so
  // users can always reach plan selection and billing management.
  if (!options?.subscriptionExempt) {
    const allowed = await checkOperationalAccess({
      organizationId: organization.id,
      organizationCreatedAt: organization.createdAt,
    });
    if (!allowed) {
      redirect(
        `/dashboard/billing?organizationId=${encodeURIComponent(organization.id)}&gate=subscription`,
      );
    }
  }

  return {
    userId: session.user.id,
    organizations,
    organization,
    membership,
    canManage: canManageFleet(membership.role),
    created: firstValue(searchParams.created) === "1",
    updated: firstValue(searchParams.updated) === "1",
    assigned: firstValue(searchParams.assigned) === "1",
    ended: firstValue(searchParams.ended) === "1",
    reassigned: firstValue(searchParams.reassigned) === "1",
    reassignedDeliveryId: firstValue(searchParams.reassignedDeliveryId),
    statusUpdated: firstValue(searchParams.statusUpdated) === "1",
    hasError: Boolean(firstValue(searchParams.error)),
  };
}

export function organizationQuery(organizationId: string) {
  return `organizationId=${encodeURIComponent(organizationId)}`;
}
