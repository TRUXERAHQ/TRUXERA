export const deliveryStatuses = [
  "PLANNED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const;

export type DeliveryStatus = (typeof deliveryStatuses)[number];

const allowedTransitions: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  PLANNED: ["CANCELLED"],
  ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "FAILED"],
  IN_TRANSIT: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
};

const assignmentRequiredStatuses = new Set<DeliveryStatus>([
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
]);

const terminalStatuses = new Set<DeliveryStatus>([
  "DELIVERED",
  "FAILED",
  "CANCELLED",
]);

export type LifecycleResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return (
    typeof value === "string" &&
    deliveryStatuses.some((status) => status === value)
  );
}

export function getAllowedDeliveryStatusTransitions(
  status: DeliveryStatus,
): readonly DeliveryStatus[] {
  return allowedTransitions[status];
}

export function canTransitionDeliveryStatus(
  fromStatus: DeliveryStatus,
  toStatus: DeliveryStatus,
) {
  return allowedTransitions[fromStatus].includes(toStatus);
}

export type DeliveryLifecycleRepository = {
  findDeliveryForUpdate(deliveryId: string): Promise<{
    id: string;
    organizationId: string;
    loadId: string;
    status: DeliveryStatus;
  } | null>;
  findActiveAssignmentForUpdate(
    deliveryId: string,
  ): Promise<{ id: string } | null>;
  updateDeliveryStatus(
    deliveryId: string,
    status: DeliveryStatus,
    deliveredAt: Date | null,
  ): Promise<void>;
  endAssignment(
    assignmentId: string,
    endedAt: Date,
    endReason: string,
  ): Promise<void>;
  createStatusEvent(input: {
    deliveryId: string;
    actorUserId: string;
    fromStatus: DeliveryStatus;
    toStatus: DeliveryStatus;
    occurredAt: Date;
    note: string;
  }): Promise<void>;
  createAssignmentEvent(input: {
    deliveryId: string;
    actorUserId: string;
    occurredAt: Date;
    note: string;
  }): Promise<void>;
};

function statusEventDescription(status: DeliveryStatus) {
  switch (status) {
    case "PICKED_UP":
      return "Delivery picked up.";
    case "IN_TRANSIT":
      return "Delivery is in transit.";
    case "DELIVERED":
      return "Delivery completed.";
    case "FAILED":
      return "Delivery marked failed.";
    case "CANCELLED":
      return "Delivery cancelled.";
    case "PLANNED":
    case "ASSIGNED":
      return `Delivery status changed to ${status.toLowerCase()}.`;
  }
}

export async function changeDeliveryStatus(
  organizationId: string,
  userId: string,
  deliveryId: string,
  expectedCurrentStatus: DeliveryStatus,
  nextStatus: DeliveryStatus,
  note: string,
  repository: DeliveryLifecycleRepository,
): Promise<LifecycleResult<{ id: string; loadId: string }>> {
  const delivery = await repository.findDeliveryForUpdate(deliveryId);
  if (!delivery || delivery.organizationId !== organizationId) {
    return { ok: false, error: "This delivery could not be found." };
  }
  if (delivery.status !== expectedCurrentStatus) {
    return {
      ok: false,
      error: "The delivery status changed. Refresh the page and try again.",
    };
  }
  const currentStatus = delivery.status;
  if (!canTransitionDeliveryStatus(delivery.status, nextStatus)) {
    return {
      ok: false,
      error: `A delivery cannot transition from ${delivery.status.toLowerCase()} to ${nextStatus.toLowerCase()}.`,
    };
  }
  if (note.trim().length > 250) {
    return { ok: false, error: "The event note must be 250 characters or fewer." };
  }

  const assignment = await repository.findActiveAssignmentForUpdate(deliveryId);
  if (assignmentRequiredStatuses.has(nextStatus) && !assignment) {
    return {
      ok: false,
      error: "An active truck and driver assignment is required for this transition.",
    };
  }

  const occurredAt = new Date();
  await repository.updateDeliveryStatus(
    deliveryId,
    nextStatus,
    nextStatus === "DELIVERED" ? occurredAt : null,
  );
  const eventNote = [statusEventDescription(nextStatus), note.trim()]
    .filter(Boolean)
    .join(" ");
  await repository.createStatusEvent({
    deliveryId,
    actorUserId: userId,
    fromStatus: currentStatus,
    toStatus: nextStatus,
    occurredAt,
    note: eventNote,
  });

  if (terminalStatuses.has(nextStatus) && assignment) {
    const endReason = `Delivery status changed to ${nextStatus}.`;
    await repository.endAssignment(assignment.id, occurredAt, endReason);
    await repository.createAssignmentEvent({
      deliveryId,
      actorUserId: userId,
      occurredAt,
      note: `Active assignment ended because ${endReason}`,
    });
  }

  return { ok: true, value: { id: delivery.id, loadId: delivery.loadId } };
}
