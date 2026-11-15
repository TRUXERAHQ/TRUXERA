import { getOrganizationsForUser } from "./organization-data";
import { db } from "./db";
import { loadForAccessibleOrganization } from "@/src/auth/tenant-policy";

export async function getDashboardData(
  userId: string,
  requestedOrganizationId?: string,
) {
  const organizations = await getOrganizationsForUser(userId);

  const scopedData = await loadForAccessibleOrganization(
    organizations,
    requestedOrganizationId,
    async (organizationId) => {
      const [trucks, drivers, deliveries, assignments] = await Promise.all([
        db.orm.public.Truck.where({
          organizationId,
          deactivatedAt: null,
        })
          .orderBy((truck) => truck.unitNumber.asc())
          .all(),
        db.orm.public.Driver.where({ organizationId })
          .orderBy((driver) => driver.name.asc())
          .all(),
        db.orm.public.Delivery.where({ organizationId })
          .include("load")
          .orderBy((delivery) => delivery.eta.asc({ nulls: "last" }))
          .all(),
        db.orm.public.DispatchAssignment.where({
          organizationId,
          endedAt: null,
        })
          .include("truck")
          .include("driver")
          .orderBy((assignment) => assignment.assignedAt.desc())
          .all(),
      ]);

      return {
        trucks,
        drivers,
        deliveries,
        assignments: assignments.filter(
          (assignment) => assignment.truck.deactivatedAt === null,
        ),
      };
    },
  );

  if (!scopedData.organization || !scopedData.data) {
    return {
      organizations,
      organization: scopedData.organization,
      trucks: [],
      drivers: [],
      deliveries: [],
      assignments: [],
    };
  }

  return {
    organizations,
    organization: scopedData.organization,
    ...scopedData.data,
  };
}
