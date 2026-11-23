import { getMembershipForUserInOrganization } from "./organization-data";
import { connectDatabase, db } from "./db";
import {
  assignDelivery,
  createLoadWithDeliveries,
  endDeliveryAssignment,
  reassignDelivery,
  saveDriver,
  updateLoadDetails,
  type AssignDeliveryRepository,
  type EndAssignmentRepository,
  type LoadUpdateRepository,
  type OperationResult,
  type ReassignDeliveryRepository,
} from "@/src/fleet/operations-service";
import {
  changeDeliveryStatus,
  isDeliveryStatus,
  type DeliveryLifecycleRepository,
  type DeliveryStatus,
} from "@/src/fleet/delivery-lifecycle";
import type { ReassignmentAssignment } from "@/src/fleet/reassignment-engine";
import type {
  DriverInput,
  LoadInput,
  LoadUpdateInput,
} from "@/src/fleet/operations-validation";
import {
  authorizeFleetAccess,
  isUuid,
} from "@/src/trucks/truck-policy";
import {
  ACCOUNT_SUSPENDED_ERROR,
  isAccountWritable,
} from "@/src/account/account-status";

type AuthorizationFailure = { ok: false; error: string };

function hasDelivery<T extends { delivery: unknown }>(
  assignment: T,
): assignment is T & { delivery: NonNullable<T["delivery"]> } {
  return assignment.delivery !== null;
}

async function authorizeRead(userId: string, organizationId: string) {
  if (!isUuid(organizationId)) return false;
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  return authorizeFleetAccess(membership, organizationId);
}

async function authorizeWrite(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  organizationId: string,
): Promise<AuthorizationFailure | null> {
  const membership = await tx.orm.public.Membership.where({
    userId,
    organizationId,
  })
    .forNoKeyUpdate()
    .first();
  if (!authorizeFleetAccess(membership, organizationId, true)) {
    return {
      ok: false,
      error: "You do not have permission to manage this organization's operations.",
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

  return null;
}

function hasDuplicateValue(
  rows: Array<{ id: string; value: string | null }>,
  value: string,
  excludingId?: string,
) {
  const normalized = value.trim().toLocaleUpperCase();
  return rows.some(
    (row) =>
      row.id !== excludingId &&
      row.value?.trim().toLocaleUpperCase() === normalized,
  );
}

export async function getDriversForOrganization(
  userId: string,
  organizationId: string,
) {
  if (!(await authorizeRead(userId, organizationId))) return null;

  return db.orm.public.Driver.where({ organizationId })
    .orderBy((driver) => driver.name.asc())
    .all();
}

export async function getDriverDetailsForOrganization(
  userId: string,
  organizationId: string,
  driverId: string,
) {
  if (!isUuid(driverId) || !(await authorizeRead(userId, organizationId))) {
    return null;
  }

  const driver = await db.orm.public.Driver.where({
    id: driverId,
    organizationId,
  }).first();
  if (!driver) return null;

  const assignments = await db.orm.public.DispatchAssignment.where({
    organizationId,
    driverId,
    endedAt: null,
  })
    .include("truck")
    .include("delivery", (delivery) => delivery.include("load"))
    .orderBy((assignment) => assignment.assignedAt.desc())
    .all();

  return { driver, assignments: assignments.filter(hasDelivery) };
}

export async function saveDriverForUser(
  userId: string,
  organizationId: string,
  driverId: string | undefined,
  input: DriverInput,
): Promise<OperationResult<{ id: string }>> {
  if (!isUuid(organizationId) || (driverId && !isUuid(driverId))) {
    return { ok: false, error: "The organization or driver could not be found." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeWrite(tx, userId, organizationId);
    if (denied) return denied;

    return saveDriver(driverId, input, {
      findDriver: async (id) => {
        const driver = await tx.orm.public.Driver.where({
          id,
          organizationId,
        })
          .select("id")
          .first();
        return driver ?? null;
      },
      hasDuplicateLicenseNumber: async (licenseNumber, excludingDriverId) => {
        if (!licenseNumber) return false;
        const existing = await tx.orm.public.Driver.where({ organizationId })
          .select("id", "licenseNumber")
          .all();
        return hasDuplicateValue(
          existing.map(({ id, licenseNumber: value }) => ({ id, value })),
          licenseNumber,
          excludingDriverId,
        );
      },
      createDriver: async (driverInput) =>
        tx.orm.public.Driver.create({
          organizationId,
          userId: null,
          ...driverInput,
        }),
      updateDriver: async (id, driverInput) => {
        await tx.orm.public.Driver.where({ id, organizationId }).update(
          driverInput,
        );
        return { id };
      },
    });
  });
}

export async function getLoadsForOrganization(
  userId: string,
  organizationId: string,
) {
  if (!(await authorizeRead(userId, organizationId))) return null;

  const [loads, deliveries] = await Promise.all([
    db.orm.public.Load.where({ organizationId })
      .orderBy((load) => load.createdAt.desc())
      .all(),
    db.orm.public.Delivery.where({ organizationId })
      .orderBy((delivery) => delivery.stopNumber.asc())
      .all(),
  ]);
  return { loads, deliveries };
}

export async function getLoadDetailsForOrganization(
  userId: string,
  organizationId: string,
  loadId: string,
) {
  if (!isUuid(loadId) || !(await authorizeRead(userId, organizationId))) {
    return null;
  }

  const load = await db.orm.public.Load.where({
    id: loadId,
    organizationId,
  }).first();
  if (!load) return null;

  const deliveries = await db.orm.public.Delivery.where({
    organizationId,
    loadId,
  })
    .orderBy((delivery) => delivery.stopNumber.asc())
    .all();
  const [
    assignmentGroups,
    eventGroups,
    organizationTrucks,
    organizationDrivers,
    organizationActiveAssignments,
  ] = await Promise.all([
    Promise.all(
      deliveries.map((delivery) =>
        db.orm.public.DispatchAssignment.where({
          organizationId,
          deliveryId: delivery.id,
        })
          .include("truck")
          .include("driver")
          .orderBy((assignment) => assignment.assignedAt.asc())
          .all(),
      ),
    ),
    Promise.all(
      deliveries.map((delivery) =>
        db.orm.public.DeliveryEvent.where({
          organizationId,
          deliveryId: delivery.id,
        })
          .include("actor")
          .orderBy((event) => event.occurredAt.asc())
          .all(),
      ),
    ),
    db.orm.public.Truck.where({ organizationId }).all(),
    db.orm.public.Driver.where({ organizationId }).all(),
    db.orm.public.DispatchAssignment.where({
      organizationId,
      endedAt: null,
    })
      .include("truck")
      .include("driver")
      .include("delivery", (delivery) => delivery.include("load"))
      .all(),
  ]);
  return {
    load,
    deliveries,
    assignments: assignmentGroups.flat(),
    events: eventGroups.flat(),
    organizationTrucks,
    organizationDrivers,
    organizationActiveAssignments,
  };
}

export async function createLoadForUser(
  userId: string,
  organizationId: string,
  input: LoadInput,
): Promise<OperationResult<{ id: string; deliveryIds: string[] }>> {
  if (!isUuid(organizationId)) {
    return { ok: false, error: "Select a valid organization." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeWrite(tx, userId, organizationId);
    if (denied) return denied;

    const existing = await tx.orm.public.Load.where({ organizationId })
      .select("id", "reference")
      .all();
    if (
      hasDuplicateValue(
        existing.map(({ id, reference }) => ({ id, value: reference })),
        input.reference,
      )
    ) {
      return {
        ok: false,
        error: "A load with this reference already exists.",
      };
    }

    return createLoadWithDeliveries(input, {
      createLoad: (loadInput) =>
        tx.orm.public.Load.create({
          organizationId,
          ...loadInput,
        }),
      createDelivery: (loadId, stopNumber, stop) =>
        tx.orm.public.Delivery.create({
          organizationId,
          loadId,
          stopNumber,
          ...stop,
          deliveryWindowStart: null,
          deliveryWindowEnd: null,
          eta: null,
          status: "PLANNED",
          riskLevel: "LOW",
          deliveredAt: null,
        }),
      createInitialStatusEvent: async (deliveryId) => {
        await tx.orm.public.DeliveryEvent.create({
          organizationId,
          deliveryId,
          actorUserId: userId,
          type: "STATUS_CHANGED",
          fromStatus: null,
          toStatus: "PLANNED",
          note: "Delivery created.",
          location: null,
        });
      },
    });
  });
}

export async function updateLoadForUser(
  userId: string,
  organizationId: string,
  loadId: string,
  input: LoadUpdateInput,
): Promise<OperationResult<{ id: string }>> {
  if (!isUuid(organizationId) || !isUuid(loadId)) {
    return { ok: false, error: "The organization or load could not be found." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeWrite(tx, userId, organizationId);
    if (denied) return denied;

    const repository: LoadUpdateRepository = {
      findLoad: async (id) => {
        const load = await tx.orm.public.Load.where({
          id,
          organizationId,
        })
          .forNoKeyUpdate()
          .select("id")
          .first();
        return load ?? null;
      },
      updateLoad: async (id, loadInput) => {
        await tx.orm.public.Load.where({ id, organizationId }).update(
          loadInput,
        );
      },
    };

    return updateLoadDetails(loadId, input, repository);
  });
}

export async function updateDeliveryStatusForUser(
  userId: string,
  organizationId: string,
  deliveryId: string,
  expectedCurrentStatus: DeliveryStatus,
  nextStatus: DeliveryStatus,
  note: string,
): Promise<OperationResult<{ id: string; loadId: string }>> {
  if (
    !isUuid(organizationId) ||
    !isUuid(deliveryId) ||
    !isDeliveryStatus(expectedCurrentStatus) ||
    !isDeliveryStatus(nextStatus)
  ) {
    return { ok: false, error: "Choose a valid delivery and status." };
  }
  if (typeof note !== "string" || note.trim().length > 250) {
    return { ok: false, error: "The event note must be 250 characters or fewer." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeWrite(tx, userId, organizationId);
    if (denied) return denied;

    const repository: DeliveryLifecycleRepository = {
      findDeliveryForUpdate: async (id) => {
        const delivery = await tx.orm.public.Delivery.where({
          id,
          organizationId,
        })
          .forNoKeyUpdate()
          .first();
        return delivery
          ? {
              id: delivery.id,
              organizationId: delivery.organizationId,
              loadId: delivery.loadId,
              status: delivery.status,
            }
          : null;
      },
      findActiveAssignmentForUpdate: async (id) => {
        const assignment = await tx.orm.public.DispatchAssignment.where({
          organizationId,
          deliveryId: id,
          endedAt: null,
        })
          .forNoKeyUpdate()
          .select("id")
          .first();
        return assignment ?? null;
      },
      updateDeliveryStatus: async (id, status, deliveredAt) => {
        await tx.orm.public.Delivery.where({ id, organizationId }).update({
          status,
          deliveredAt,
        });
      },
      endAssignment: async (id, endedAt, endReason) => {
        await tx.orm.public.DispatchAssignment.where({
          id,
          organizationId,
          endedAt: null,
        }).update({ endedAt, endReason });
      },
      createStatusEvent: async (event) => {
        await tx.orm.public.DeliveryEvent.create({
          organizationId,
          type: "STATUS_CHANGED",
          location: null,
          ...event,
        });
      },
      createAssignmentEvent: async (event) => {
        await tx.orm.public.DeliveryEvent.create({
          organizationId,
          type: "ASSIGNMENT_CHANGED",
          fromStatus: null,
          toStatus: null,
          location: null,
          ...event,
        });
      },
    };

    return changeDeliveryStatus(
      organizationId,
      userId,
      deliveryId,
      expectedCurrentStatus,
      nextStatus,
      note,
      repository,
    );
  });
}

export async function getDispatchBoardForOrganization(
  userId: string,
  organizationId: string,
) {
  if (!(await authorizeRead(userId, organizationId))) return null;

  const [deliveries, trucks, drivers, assignments, events] = await Promise.all([
    db.orm.public.Delivery.where({ organizationId })
      .include("load")
      .orderBy((delivery) => delivery.createdAt.desc())
      .all(),
    db.orm.public.Truck.where({
      organizationId,
    })
      .orderBy((truck) => truck.unitNumber.asc())
      .all(),
    db.orm.public.Driver.where({ organizationId })
      .orderBy((driver) => driver.name.asc())
      .all(),
    db.orm.public.DispatchAssignment.where({ organizationId })
      .include("truck")
      .include("driver")
      .include("delivery", (delivery) => delivery.include("load"))
      .orderBy((assignment) => assignment.assignedAt.desc())
      .all(),
    db.orm.public.DeliveryEvent.where({ organizationId }).all(),
  ]);

  return { deliveries, trucks, drivers, assignments, events };
}

export async function assignDeliveryForUser(
  userId: string,
  organizationId: string,
  deliveryId: string,
  truckId: string,
  driverId: string,
): Promise<OperationResult<{ id: string }>> {
  if (
    !isUuid(organizationId) ||
    !isUuid(deliveryId) ||
    !isUuid(truckId) ||
    !isUuid(driverId)
  ) {
    return { ok: false, error: "Choose valid delivery, truck, and driver records." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeWrite(tx, userId, organizationId);
    if (denied) return denied;

    const repository: AssignDeliveryRepository = {
      findDelivery: async (id) => {
        const delivery = await tx.orm.public.Delivery.where({
          id,
          organizationId,
        })
          .forNoKeyUpdate()
          .first();
        if (!delivery) return null;
        const load = await tx.orm.public.Load.where({
          id: delivery.loadId,
          organizationId,
        })
          .select("weightKg")
          .first();
        if (!load) return null;
        return {
          id: delivery.id,
          organizationId: delivery.organizationId,
          loadId: delivery.loadId,
          status: delivery.status,
          weightKg: load.weightKg === null ? null : Number(load.weightKg),
        };
      },
      findTruck: async (id) => {
        const truck = await tx.orm.public.Truck.where({
          id,
          organizationId,
          deactivatedAt: null,
        })
          .forNoKeyUpdate()
          .first();
        return truck
          ? {
              id: truck.id,
              organizationId: truck.organizationId,
              unitNumber: truck.unitNumber,
              status: truck.status,
              deactivatedAt: truck.deactivatedAt,
              capacityKg:
                truck.capacityKg === null ? null : Number(truck.capacityKg),
            }
          : null;
      },
      findDriver: (id) =>
        tx.orm.public.Driver.where({ id, organizationId })
          .forNoKeyUpdate()
          .first(),
      findActiveAssignment: (id) =>
        tx.orm.public.DispatchAssignment.where({
          organizationId,
          deliveryId: id,
          endedAt: null,
        })
          .select("id")
          .first(),
      findActiveResourceAssignments: async (truckId, driverId) => {
        const byTruck = await tx.orm.public.DispatchAssignment.where({
          organizationId,
          truckId,
          endedAt: null,
        })
          .include("delivery")
          .all();
        const byDriver = await tx.orm.public.DispatchAssignment.where({
          organizationId,
          driverId,
          endedAt: null,
        })
          .include("delivery")
          .all();
        const rows = new Map<string, ReassignmentAssignment>();
        for (const assignment of [...byTruck, ...byDriver]) {
          if (!assignment.delivery) continue;
          rows.set(assignment.id, {
            id: assignment.id,
            deliveryId: assignment.deliveryId,
            loadId: assignment.delivery.loadId,
            truckId: assignment.truckId,
            driverId: assignment.driverId,
            endedAt: assignment.endedAt,
          });
        }
        return [...rows.values()];
      },
      createAssignment: (assignment) =>
        tx.orm.public.DispatchAssignment.create({
          organizationId,
          assignedByUserId: userId,
          ...assignment,
        }),
      updateDeliveryStatus: async (id, status) => {
        await tx.orm.public.Delivery.where({ id, organizationId }).update({
          status,
        });
      },
      createAssignmentEvent: async (event) => {
        await tx.orm.public.DeliveryEvent.create({
          organizationId,
          actorUserId: userId,
          type: "ASSIGNMENT_CHANGED",
          location: null,
          ...event,
        });
      },
    };

    return assignDelivery(
      organizationId,
      deliveryId,
      truckId,
      driverId,
      repository,
    );
  });
}

export async function reassignDeliveryForUser(
  userId: string,
  organizationId: string,
  deliveryId: string,
  expectedCurrentAssignmentId: string,
  truckId: string,
  driverId: string,
  reason: string,
): Promise<OperationResult<{ id: string }>> {
  if (
    !isUuid(organizationId) ||
    !isUuid(deliveryId) ||
    !isUuid(expectedCurrentAssignmentId) ||
    !isUuid(truckId) ||
    !isUuid(driverId)
  ) {
    return { ok: false, error: "Choose valid delivery, truck, and driver records." };
  }
  if (typeof reason !== "string" || reason.trim().length > 250) {
    return { ok: false, error: "The reassignment reason must be 250 characters or fewer." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeWrite(tx, userId, organizationId);
    if (denied) return denied;

    const repository: ReassignDeliveryRepository = {
      findDeliveryForUpdate: async (id) => {
        const delivery = await tx.orm.public.Delivery.where({
          id,
          organizationId,
        })
          .forNoKeyUpdate()
          .first();
        if (!delivery) return null;
        const load = await tx.orm.public.Load.where({
          id: delivery.loadId,
          organizationId,
        })
          .select("weightKg")
          .first();
        if (!load) return null;
        return {
          id: delivery.id,
          organizationId: delivery.organizationId,
          loadId: delivery.loadId,
          status: delivery.status,
          weightKg: load.weightKg === null ? null : Number(load.weightKg),
        };
      },
      findActiveAssignmentForUpdate: async (id) => {
        const assignment = await tx.orm.public.DispatchAssignment.where({
          organizationId,
          deliveryId: id,
          endedAt: null,
        })
          .forNoKeyUpdate()
          .first();
        if (!assignment) return null;
        const truck = await tx.orm.public.Truck.where({
          id: assignment.truckId,
          organizationId,
        })
          .select("unitNumber")
          .first();
        const driver = await tx.orm.public.Driver.where({
          id: assignment.driverId,
          organizationId,
        })
          .select("name")
          .first();
        if (!truck || !driver) return null;
        return {
          id: assignment.id,
          organizationId: assignment.organizationId,
          deliveryId: assignment.deliveryId,
          truckId: assignment.truckId,
          driverId: assignment.driverId,
          truckUnitNumber: truck.unitNumber,
          driverName: driver.name,
        };
      },
      findTruckForUpdate: async (id) => {
        const truck = await tx.orm.public.Truck.where({
          id,
          organizationId,
          deactivatedAt: null,
        })
          .forNoKeyUpdate()
          .first();
        return truck
          ? {
              id: truck.id,
              organizationId: truck.organizationId,
              unitNumber: truck.unitNumber,
              status: truck.status,
              deactivatedAt: truck.deactivatedAt,
              capacityKg:
                truck.capacityKg === null ? null : Number(truck.capacityKg),
            }
          : null;
      },
      findDriverForUpdate: (id) =>
        tx.orm.public.Driver.where({ id, organizationId })
          .forNoKeyUpdate()
          .first(),
      findActiveResourceAssignments: async (replacementTruckId, replacementDriverId) => {
        const byTruck = await tx.orm.public.DispatchAssignment.where({
          organizationId,
          truckId: replacementTruckId,
          endedAt: null,
        })
          .include("delivery")
          .all();
        const byDriver = await tx.orm.public.DispatchAssignment.where({
          organizationId,
          driverId: replacementDriverId,
          endedAt: null,
        })
          .include("delivery")
          .all();
        const rows = new Map<string, ReassignmentAssignment>();
        for (const assignment of [...byTruck, ...byDriver]) {
          if (!assignment.delivery) continue;
          rows.set(assignment.id, {
            id: assignment.id,
            deliveryId: assignment.deliveryId,
            loadId: assignment.delivery.loadId,
            truckId: assignment.truckId,
            driverId: assignment.driverId,
            endedAt: assignment.endedAt,
          });
        }
        return [...rows.values()];
      },
      endAssignment: async (id, endedAt, endReason) => {
        await tx.orm.public.DispatchAssignment.where({
          id,
          organizationId,
          endedAt: null,
        }).update({ endedAt, endReason });
      },
      createAssignment: ({ assignedByUserId, ...assignment }) =>
        tx.orm.public.DispatchAssignment.create({
          organizationId,
          assignedByUserId,
          ...assignment,
        }),
      createAssignmentEvent: async ({ actorUserId, ...event }) => {
        await tx.orm.public.DeliveryEvent.create({
          organizationId,
          actorUserId,
          type: "ASSIGNMENT_CHANGED",
          location: null,
          ...event,
        });
      },
    };

    return reassignDelivery(
      organizationId,
      userId,
      deliveryId,
      expectedCurrentAssignmentId,
      truckId,
      driverId,
      reason,
      repository,
    );
  });
}

export async function endAssignmentForUser(
  userId: string,
  organizationId: string,
  assignmentId: string,
  reason: string,
): Promise<OperationResult> {
  if (!isUuid(organizationId) || !isUuid(assignmentId)) {
    return { ok: false, error: "The organization or assignment could not be found." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeWrite(tx, userId, organizationId);
    if (denied) return denied;

    const repository: EndAssignmentRepository = {
      findActiveAssignmentForEnd: async (id) => {
        const assignment = await tx.orm.public.DispatchAssignment.where({
          id,
          organizationId,
          endedAt: null,
        })
          .forNoKeyUpdate()
          .first();
        if (!assignment) return null;

        const delivery = await tx.orm.public.Delivery.where({
          id: assignment.deliveryId,
          organizationId,
        }).first();
        if (!delivery) return null;

        return {
          id: assignment.id,
          deliveryId: assignment.deliveryId,
          delivery: { status: delivery.status },
        };
      },
      endAssignment: async (id, endedAt, endReason) => {
        await tx.orm.public.DispatchAssignment.where({
          id,
          organizationId,
          endedAt: null,
        }).update({ endedAt, endReason });
      },
      createAssignmentEvent: async (event) => {
        await tx.orm.public.DeliveryEvent.create({
          organizationId,
          actorUserId: userId,
          type: "ASSIGNMENT_CHANGED",
          location: null,
          ...event,
        });
      },
    };

    return endDeliveryAssignment(assignmentId, reason, repository);
  });
}
