import type {
  DeliveryStopInput,
  DriverInput,
  LoadInput,
  LoadUpdateInput,
} from "./operations-validation";
import type { DeliveryStatus } from "./delivery-lifecycle";
import {
  assessReassignmentCandidate,
  getResourceAssignmentConflicts,
  type ReassignmentAssignment,
  type ReassignmentDriver,
  type ReassignmentTruck,
} from "./reassignment-engine.ts";

export type OperationResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type DriverRecord = { id: string };

export type DriverWriteRepository<TDriver extends DriverRecord> = {
  findDriver(driverId: string): Promise<TDriver | null>;
  hasDuplicateLicenseNumber(
    licenseNumber: string,
    excludingDriverId?: string,
  ): Promise<boolean>;
  createDriver(input: DriverInput): Promise<TDriver>;
  updateDriver(driverId: string, input: DriverInput): Promise<TDriver>;
};

export async function saveDriver<TDriver extends DriverRecord>(
  driverId: string | undefined,
  input: DriverInput,
  repository: DriverWriteRepository<TDriver>,
): Promise<OperationResult<{ id: string }>> {
  if (driverId && !(await repository.findDriver(driverId))) {
    return { ok: false, error: "This driver could not be found." };
  }

  if (
    input.licenseNumber &&
    (await repository.hasDuplicateLicenseNumber(
      input.licenseNumber,
      driverId,
    ))
  ) {
    return {
      ok: false,
      error: "A driver with this license number already exists.",
    };
  }

  const driver = driverId
    ? await repository.updateDriver(driverId, input)
    : await repository.createDriver(input);

  return { ok: true, value: { id: driver.id } };
}

export type LoadWriteRepository<TLoad extends { id: string }> = {
  createLoad(input: Omit<LoadInput, "deliveries">): Promise<TLoad>;
  createDelivery(
    loadId: string,
    stopNumber: number,
    input: DeliveryStopInput,
  ): Promise<{ id: string }>;
  createInitialStatusEvent(deliveryId: string): Promise<void>;
};

export type LoadUpdateRepository = {
  findLoad(loadId: string): Promise<{ id: string } | null>;
  updateLoad(loadId: string, input: LoadUpdateInput): Promise<void>;
};

export async function updateLoadDetails(
  loadId: string,
  input: LoadUpdateInput,
  repository: LoadUpdateRepository,
): Promise<OperationResult<{ id: string }>> {
  if (!(await repository.findLoad(loadId))) {
    return { ok: false, error: "This load could not be found." };
  }

  await repository.updateLoad(loadId, input);
  return { ok: true, value: { id: loadId } };
}

export async function createLoadWithDeliveries<
  TLoad extends { id: string },
>(
  input: LoadInput,
  repository: LoadWriteRepository<TLoad>,
): Promise<OperationResult<{ id: string; deliveryIds: string[] }>> {
  const load = await repository.createLoad({
    reference: input.reference,
    customerName: input.customerName,
    pickupAddress: input.pickupAddress,
    cargoDescription: input.cargoDescription,
    weightKg: input.weightKg,
  });

  const deliveryIds: string[] = [];
  for (const [index, stop] of input.deliveries.entries()) {
    const delivery = await repository.createDelivery(load.id, index + 1, stop);
    deliveryIds.push(delivery.id);
    await repository.createInitialStatusEvent(delivery.id);
  }

  return { ok: true, value: { id: load.id, deliveryIds } };
}

export type DispatchDeliveryStatus = DeliveryStatus;

export type DispatchDelivery = {
  id: string;
  organizationId: string;
  loadId: string;
  status: DispatchDeliveryStatus;
  weightKg: number | string | null;
};

export type DispatchTruck = {
  id: string;
  organizationId: string;
  unitNumber: string;
  status: string;
  deactivatedAt: Date | null;
  capacityKg: number | string | null;
};

export type DispatchDriver = {
  id: string;
  organizationId: string;
  name: string;
  status: string;
};

export type ActiveAssignment = {
  id: string;
  deliveryId: string;
  delivery: { status: DispatchDeliveryStatus };
};

export type AssignDeliveryRepository = {
  findDelivery(deliveryId: string): Promise<DispatchDelivery | null>;
  findTruck(truckId: string): Promise<DispatchTruck | null>;
  findDriver(driverId: string): Promise<DispatchDriver | null>;
  findActiveAssignment(deliveryId: string): Promise<{ id: string } | null>;
  findActiveResourceAssignments(
    truckId: string,
    driverId: string,
  ): Promise<ReassignmentAssignment[]>;
  createAssignment(input: {
    deliveryId: string;
    truckId: string;
    driverId: string;
  }): Promise<{ id: string }>;
  updateDeliveryStatus(
    deliveryId: string,
    status: "ASSIGNED",
  ): Promise<void>;
  createAssignmentEvent(input: {
    deliveryId: string;
    fromStatus: DispatchDeliveryStatus;
    toStatus: DispatchDeliveryStatus;
    note: string;
  }): Promise<void>;
};

export type ReassignmentCurrentAssignment = {
  id: string;
  organizationId: string;
  deliveryId: string;
  truckId: string;
  driverId: string;
  truckUnitNumber: string;
  driverName: string;
};

export type ReassignDeliveryRepository = {
  findDeliveryForUpdate(
    deliveryId: string,
  ): Promise<DispatchDelivery | null>;
  findActiveAssignmentForUpdate(
    deliveryId: string,
  ): Promise<ReassignmentCurrentAssignment | null>;
  findTruckForUpdate(truckId: string): Promise<DispatchTruck | null>;
  findDriverForUpdate(driverId: string): Promise<DispatchDriver | null>;
  findActiveResourceAssignments(
    truckId: string,
    driverId: string,
  ): Promise<ReassignmentAssignment[]>;
  endAssignment(
    assignmentId: string,
    endedAt: Date,
    endReason: string,
  ): Promise<void>;
  createAssignment(input: {
    deliveryId: string;
    truckId: string;
    driverId: string;
    assignedByUserId: string;
  }): Promise<{ id: string }>;
  createAssignmentEvent(input: {
    deliveryId: string;
    fromStatus: DispatchDeliveryStatus;
    toStatus: DispatchDeliveryStatus;
    note: string;
    actorUserId: string;
  }): Promise<void>;
};

export type EndAssignmentRepository = {
  findActiveAssignmentForEnd(
    assignmentId: string,
  ): Promise<ActiveAssignment | null>;
  endAssignment(
    assignmentId: string,
    endedAt: Date,
    endReason: string,
  ): Promise<void>;
  createAssignmentEvent(input: {
    deliveryId: string;
    fromStatus: DispatchDeliveryStatus;
    toStatus: DispatchDeliveryStatus;
    note: string;
  }): Promise<void>;
};

export async function assignDelivery(
  organizationId: string,
  deliveryId: string,
  truckId: string,
  driverId: string,
  repository: AssignDeliveryRepository,
): Promise<OperationResult<{ id: string }>> {
  const delivery = await repository.findDelivery(deliveryId);
  const truck = await repository.findTruck(truckId);
  const driver = await repository.findDriver(driverId);
  if (!delivery || !truck || !driver) {
    return {
      ok: false,
      error: "Choose an existing delivery, active truck, and driver.",
    };
  }

  if (
    delivery.organizationId !== organizationId ||
    truck.organizationId !== organizationId ||
    driver.organizationId !== organizationId
  ) {
    return {
      ok: false,
      error: "The delivery, truck, and driver must belong to this organization.",
    };
  }
  if (truck.deactivatedAt !== null || truck.status !== "AVAILABLE") {
    return {
      ok: false,
      error: "Choose an active, available truck.",
    };
  }
  if (driver.status !== "AVAILABLE" && driver.status !== "ON_DUTY") {
    return {
      ok: false,
      error: "Choose a driver who is available or on duty.",
    };
  }
  if (delivery.status !== "PLANNED" && delivery.status !== "ASSIGNED") {
    return {
      ok: false,
      error: "Only planned or previously assigned deliveries can be assigned.",
    };
  }
  if (await repository.findActiveAssignment(deliveryId)) {
    return {
      ok: false,
      error: "End the current assignment before assigning this delivery again.",
    };
  }
  const resourceAssignments = await repository.findActiveResourceAssignments(
    truckId,
    driverId,
  );
  const conflicts = getResourceAssignmentConflicts(
    resourceAssignments,
    delivery.loadId,
    truckId,
    driverId,
  );
  if (conflicts.truck > 0 || conflicts.driver > 0) {
    return {
      ok: false,
      error: "Choose a truck and driver without active assignments on another load.",
    };
  }

  const assignment = await repository.createAssignment({
    deliveryId,
    truckId,
    driverId,
  });
  await repository.updateDeliveryStatus(deliveryId, "ASSIGNED");
  await repository.createAssignmentEvent({
    deliveryId,
    fromStatus: delivery.status,
    toStatus: "ASSIGNED",
    note: `Assigned to truck ${truck.unitNumber} and driver ${driver.name}.`,
  });

  return { ok: true, value: { id: assignment.id } };
}

export async function reassignDelivery(
  organizationId: string,
  userId: string,
  deliveryId: string,
  expectedCurrentAssignmentId: string,
  truckId: string,
  driverId: string,
  reason: string,
  repository: ReassignDeliveryRepository,
): Promise<OperationResult<{ id: string }>> {
  const delivery = await repository.findDeliveryForUpdate(deliveryId);
  if (!delivery || delivery.organizationId !== organizationId) {
    return { ok: false, error: "This delivery could not be found." };
  }

  const currentAssignment =
    await repository.findActiveAssignmentForUpdate(deliveryId);
  if (
    !currentAssignment ||
    currentAssignment.organizationId !== organizationId ||
    currentAssignment.id !== expectedCurrentAssignmentId
  ) {
    return {
      ok: false,
      error: "The active assignment changed. Refresh the dispatch board and try again.",
    };
  }
  if (
    delivery.status !== "ASSIGNED" &&
    delivery.status !== "PICKED_UP" &&
    delivery.status !== "IN_TRANSIT"
  ) {
    return {
      ok: false,
      error: "Only an active assigned delivery can be reassigned.",
    };
  }
  if (reason.trim().length > 250) {
    return { ok: false, error: "The reassignment reason is too long." };
  }

  const truck = await repository.findTruckForUpdate(truckId);
  const driver = await repository.findDriverForUpdate(driverId);
  if (!truck || !driver) {
    return {
      ok: false,
      error: "Choose an existing active truck and driver.",
    };
  }

  const activeResourceAssignments =
    await repository.findActiveResourceAssignments(truckId, driverId);
  const assessment = assessReassignmentCandidate(
    organizationId,
    {
      id: delivery.id,
      organizationId: delivery.organizationId,
      loadId: delivery.loadId,
      weightKg: delivery.weightKg,
    },
    {
      id: currentAssignment.id,
      truckId: currentAssignment.truckId,
      driverId: currentAssignment.driverId,
    },
    {
      id: truck.id,
      organizationId: truck.organizationId,
      unitNumber: truck.unitNumber,
      status: truck.status,
      deactivatedAt: truck.deactivatedAt,
      capacityKg: truck.capacityKg,
    } satisfies ReassignmentTruck,
    {
      id: driver.id,
      organizationId: driver.organizationId,
      name: driver.name,
      status: driver.status,
    } satisfies ReassignmentDriver,
    activeResourceAssignments,
  );
  if (assessment.status !== "ELIGIBLE") {
    return { ok: false, error: assessment.reason };
  }

  const trimmedReason = reason.trim() || "Dispatcher approved reassignment";
  const changeNote =
    `Reassigned from truck ${currentAssignment.truckUnitNumber} / ` +
    `driver ${currentAssignment.driverName} to truck ${truck.unitNumber} / ` +
    `driver ${driver.name}. Reason: ${trimmedReason}`;

  await repository.endAssignment(
    currentAssignment.id,
    new Date(),
    changeNote,
  );
  const assignment = await repository.createAssignment({
    deliveryId,
    truckId,
    driverId,
    assignedByUserId: userId,
  });
  await repository.createAssignmentEvent({
    deliveryId,
    fromStatus: delivery.status,
    toStatus: delivery.status,
    note: changeNote,
    actorUserId: userId,
  });

  return { ok: true, value: { id: assignment.id } };
}

export async function endDeliveryAssignment(
  assignmentId: string,
  reason: string,
  repository: EndAssignmentRepository,
): Promise<OperationResult> {
  const assignment = await repository.findActiveAssignmentForEnd(assignmentId);
  if (!assignment) {
    return { ok: false, error: "This active assignment could not be found." };
  }

  const endedAt = new Date();
  const endReason = reason.trim() || "Assignment ended";
  await repository.endAssignment(assignmentId, endedAt, endReason);
  await repository.createAssignmentEvent({
    deliveryId: assignment.deliveryId,
    fromStatus: assignment.delivery.status,
    toStatus: assignment.delivery.status,
    note: endReason,
  });

  return { ok: true, value: undefined };
}
