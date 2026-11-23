import { getMembershipForUserInOrganization } from "./organization-data";
import { connectDatabase, db } from "./db";
import { authorizeFleetAccess, hasDuplicateUnitNumber } from "@/src/trucks/truck-policy";
import {
  ACCOUNT_SUSPENDED_ERROR,
  isAccountWritable,
} from "@/src/account/account-status";
import type { TruckInput } from "@/src/trucks/truck-validation";

type MutationResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function hasDelivery<T extends { delivery: unknown }>(
  assignment: T,
): assignment is T & { delivery: NonNullable<T["delivery"]> } {
  return assignment.delivery !== null;
}

async function authorize(
  userId: string,
  organizationId: string,
  write = false,
) {
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );

  return authorizeFleetAccess(membership, organizationId, write);
}

export async function getTrucksForOrganization(
  userId: string,
  organizationId: string,
  includeArchived = false,
) {
  if (!(await authorize(userId, organizationId))) return null;

  const trucks = includeArchived
    ? await db.orm.public.Truck.where({ organizationId })
        .orderBy((truck) => truck.unitNumber.asc())
        .all()
    : await db.orm.public.Truck.where({
        organizationId,
        deactivatedAt: null,
      })
        .orderBy((truck) => truck.unitNumber.asc())
        .all();

  const assignments = await db.orm.public.DispatchAssignment.where({
    organizationId,
    endedAt: null,
  })
    .include("truck")
    .include("driver")
    .include("delivery", (delivery) => delivery.include("load"))
    .orderBy((assignment) => assignment.assignedAt.desc())
    .all();

  return {
    trucks,
    assignments: assignments
      .filter(hasDelivery)
      .filter((assignment) => assignment.truck.deactivatedAt === null),
  };
}

export async function getTruckDetailsForOrganization(
  userId: string,
  organizationId: string,
  truckId: string,
) {
  if (!(await authorize(userId, organizationId))) return null;

  const truck = await db.orm.public.Truck.where({
    id: truckId,
    organizationId,
  }).first();
  if (!truck) return null;

  const assignments = await db.orm.public.DispatchAssignment.where({
    organizationId,
    truckId,
    endedAt: null,
  })
    .include("driver")
    .include("delivery", (delivery) => delivery.include("load"))
    .orderBy((assignment) => assignment.assignedAt.desc())
    .all();

  return {
    truck,
    assignments: assignments.filter(hasDelivery),
  };
}

export async function createTruckForUser(
  userId: string,
  organizationId: string,
  input: TruckInput,
): Promise<MutationResult<{ id: string }>> {
  await connectDatabase();

  return db.transaction(async (tx) => {
    const membership = await tx.orm.public.Membership.where({
      userId,
      organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!authorizeFleetAccess(membership, organizationId, true)) {
      return {
        ok: false,
        error: "You do not have permission to manage this organization's fleet.",
      };
    }

    const organization = await tx.orm.public.Organization.where({
      id: organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!organization) {
      return { ok: false, error: "The selected organization was not found." };
    }
    if (!isAccountWritable(organization.status)) {
      return { ok: false, error: ACCOUNT_SUSPENDED_ERROR };
    }

    const existingTrucks = await tx.orm.public.Truck.where({
      organizationId,
    })
      .select("id", "unitNumber")
      .all();
    if (hasDuplicateUnitNumber(existingTrucks, input.unitNumber)) {
      return {
        ok: false,
        error: "A truck with this unit number already exists.",
      };
    }

    const truck = await tx.orm.public.Truck.create({
      organizationId,
      ...input,
      deactivatedAt: null,
    });

    return { ok: true, value: { id: truck.id } };
  });
}

export async function updateTruckForUser(
  userId: string,
  organizationId: string,
  truckId: string,
  input: TruckInput,
): Promise<MutationResult> {
  await connectDatabase();

  return db.transaction(async (tx) => {
    const membership = await tx.orm.public.Membership.where({
      userId,
      organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!authorizeFleetAccess(membership, organizationId, true)) {
      return {
        ok: false,
        error: "You do not have permission to manage this organization's fleet.",
      };
    }

    const organization = await tx.orm.public.Organization.where({
      id: organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!organization) {
      return { ok: false, error: "The selected organization was not found." };
    }
    if (!isAccountWritable(organization.status)) {
      return { ok: false, error: ACCOUNT_SUSPENDED_ERROR };
    }

    const truck = await tx.orm.public.Truck.where({
      id: truckId,
      organizationId,
      deactivatedAt: null,
    }).first();
    if (!truck) {
      return { ok: false, error: "This active truck could not be found." };
    }

    const existingTrucks = await tx.orm.public.Truck.where({
      organizationId,
    })
      .select("id", "unitNumber")
      .all();
    if (
      hasDuplicateUnitNumber(existingTrucks, input.unitNumber, truckId)
    ) {
      return {
        ok: false,
        error: "A truck with this unit number already exists.",
      };
    }

    await tx.orm.public.Truck.where({
      id: truckId,
      organizationId,
      deactivatedAt: null,
    }).update(input);

    return { ok: true, value: undefined };
  });
}

export async function setTruckDeactivatedForUser(
  userId: string,
  organizationId: string,
  truckId: string,
  deactivated: boolean,
): Promise<MutationResult> {
  await connectDatabase();

  return db.transaction(async (tx) => {
    const membership = await tx.orm.public.Membership.where({
      userId,
      organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!authorizeFleetAccess(membership, organizationId, true)) {
      return {
        ok: false,
        error: "You do not have permission to manage this organization's fleet.",
      };
    }

    const organization = await tx.orm.public.Organization.where({
      id: organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!organization) {
      return { ok: false, error: "The selected organization was not found." };
    }
    if (!isAccountWritable(organization.status)) {
      return { ok: false, error: ACCOUNT_SUSPENDED_ERROR };
    }

    const truck = await tx.orm.public.Truck.where({
      id: truckId,
      organizationId,
    }).first();
    if (!truck) return { ok: false, error: "This truck could not be found." };

    if (deactivated && truck.deactivatedAt === null) {
      const activeAssignment = await tx.orm.public.DispatchAssignment.where({
        organizationId,
        truckId,
        endedAt: null,
      }).first();
      if (activeAssignment) {
        return {
          ok: false,
          error:
            "End the truck's active assignment before removing it from the fleet.",
        };
      }
    }

    await tx.orm.public.Truck.where({
      id: truckId,
      organizationId,
    }).update({ deactivatedAt: deactivated ? new Date() : null });

    return { ok: true, value: undefined };
  });
}
