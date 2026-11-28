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

export type TruckPageSearchParams = {
  organizationId?: string | string[];
  showArchived?: string | string[];
  created?: string | string[];
  updated?: string | string[];
  deactivated?: string | string[];
  reactivated?: string | string[];
  error?: string | string[];
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getTruckPageContext(
  searchParams: TruckPageSearchParams,
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

  // Mandatory subscription gate — fleet surfaces are operational.
  const allowed = await checkOperationalAccess({
    organizationId: organization.id,
    organizationCreatedAt: organization.createdAt,
  });
  if (!allowed) {
    redirect(
      `/dashboard/billing?organizationId=${encodeURIComponent(organization.id)}&gate=subscription`,
    );
  }

  return {
    userId: session.user.id,
    organizations,
    organization,
    membership,
    showArchived: firstValue(searchParams.showArchived) === "true",
    notice: firstValue(searchParams.created)
      ? "Truck added to the fleet."
      : firstValue(searchParams.updated)
        ? "Truck details saved."
        : firstValue(searchParams.deactivated)
          ? "Truck removed from the active fleet. Its records are preserved."
          : firstValue(searchParams.reactivated)
            ? "Truck returned to the active fleet."
            : firstValue(searchParams.error)
              ? "The truck could not be updated. Please try again."
              : null,
  };
}

export { canManageFleet };

export function firstTruckSearchValue(value?: string | string[]) {
  return firstValue(value);
}
