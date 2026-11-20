import { formatDateTime } from "./delivery-chain.ts";

export type AssignmentReportTruck = {
  unitNumber: string;
  vin: string | null;
  capacityKg: { toString(): string } | number | null;
  status: string;
};

export type AssignmentReportDriver = {
  name: string;
  status: string;
};

export type AssignmentReportAssignment = {
  id: string;
  truckId: string;
  driverId: string;
  assignedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  truck: AssignmentReportTruck;
  driver: AssignmentReportDriver;
};

export type AssignmentReportDelivery = {
  reference: string | null;
  stopNumber: number;
};

export type AssignmentHistoryRow = {
  id: string;
  sequence: number;
  truck: string;
  driver: string;
  assignedAtLabel: string;
  endedAtLabel: string | null;
  state: "current" | "ended";
  endReason: string | null;
};

export type AssignmentChange = {
  fromLabel: string;
  toLabel: string;
  atLabel: string;
  reason: string | null;
  sameResources: boolean;
};

export type AssignmentTimelineEntry = {
  timeLabel: string;
  event: string;
  truck: string;
  driver: string;
  note: string | null;
};

export type AssignmentVehicleReport = {
  deliveryLabel: string;
  hasAssignments: boolean;
  current: {
    truck: string;
    driver: string;
    vinLabel: string;
    capacityLabel: string;
    truckStatusLabel: string;
    driverStatusLabel: string;
    assignedAtLabel: string;
  } | null;
  history: AssignmentHistoryRow[];
  changes: AssignmentChange[];
  continuity: { kind: string; label: string };
  timeline: AssignmentTimelineEntry[];
};

const reassignmentPrefix = "Reassigned from truck ";

function label(delivery: AssignmentReportDelivery) {
  return delivery.reference ?? `Stop ${delivery.stopNumber}`;
}

function resourceLabel(
  truckUnitNumber: string,
  driverName: string,
) {
  return `${truckUnitNumber} · ${driverName}`;
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function capacityLabel(capacityKg: AssignmentReportTruck["capacityKg"]) {
  if (capacityKg === null || capacityKg === undefined) return "Not recorded";
  const value = Number(capacityKg);
  if (!Number.isFinite(value)) return "Not recorded";
  return `${value} kg`;
}

function continuityFor(
  ordered: AssignmentReportAssignment[],
): { kind: string; label: string } {
  if (ordered.length === 0) {
    return { kind: "none", label: "No assignments recorded." };
  }
  if (ordered.length === 1) {
    return {
      kind: "single",
      label: "Single recorded assignment — no resource change.",
    }
  }
  const truckChanged = ordered.some(
    (assignment, index) =>
      index > 0 && assignment.truckId !== ordered[index - 1].truckId,
  );
  const driverChanged = ordered.some(
    (assignment, index) =>
      index > 0 && assignment.driverId !== ordered[index - 1].driverId,
  );
  if (!truckChanged && !driverChanged) {
    return {
      kind: "same",
      label: "Same truck and driver throughout the recorded history.",
    };
  }
  if (truckChanged && driverChanged) {
    return {
      kind: "both",
      label: "Truck and driver both changed during the recorded history.",
    };
  }
  if (truckChanged) {
    return {
      kind: "truck",
      label: "Truck changed during the recorded history; driver unchanged.",
    };
  }
  return {
    kind: "driver",
    label: "Driver changed during the recorded history; truck unchanged.",
  };
}

export function buildAssignmentVehicleReport(input: {
  delivery: AssignmentReportDelivery;
  assignments: AssignmentReportAssignment[];
  timezone: string;
}): AssignmentVehicleReport {
  const { delivery, timezone } = input;
  const ordered = [...input.assignments].sort(
    (left, right) => left.assignedAt.getTime() - right.assignedAt.getTime(),
  );
  const current = ordered.find(
    (assignment) => assignment.endedAt === null,
  );

  const history: AssignmentHistoryRow[] = ordered.map(
    (assignment, index) => ({
      id: assignment.id,
      sequence: index + 1,
      truck: assignment.truck.unitNumber,
      driver: assignment.driver.name,
      assignedAtLabel: formatDateTime(assignment.assignedAt, timezone),
      endedAtLabel: assignment.endedAt
        ? formatDateTime(assignment.endedAt, timezone)
        : null,
      state: assignment.endedAt === null ? "current" : "ended",
      endReason: assignment.endReason,
    }),
  );

  const changes: AssignmentChange[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index];
    const to = ordered[index + 1];
    if (from.endedAt === null) continue;
    const sameResources =
      from.truckId === to.truckId && from.driverId === to.driverId;
    const reason = from.endReason?.startsWith(reassignmentPrefix)
      ? (from.endReason.match(/\. Reason: (.*)$/)?.[1]?.trim() ?? null)
      : from.endReason;
    changes.push({
      fromLabel: resourceLabel(from.truck.unitNumber, from.driver.name),
      toLabel: resourceLabel(to.truck.unitNumber, to.driver.name),
      atLabel: formatDateTime(from.endedAt, timezone),
      reason: reason ?? null,
      sameResources,
    });
  }

  const timeline: AssignmentTimelineEntry[] = [];
  for (const assignment of ordered) {
    const isCurrent = assignment.endedAt === null;
    timeline.push({
      timeLabel: formatDateTime(assignment.assignedAt, timezone),
      event: isCurrent ? "Assigned — current" : "Assigned",
      truck: assignment.truck.unitNumber,
      driver: assignment.driver.name,
      note: null,
    });
    if (assignment.endedAt) {
      timeline.push({
        timeLabel: formatDateTime(assignment.endedAt, timezone),
        event: assignment.endReason?.startsWith(reassignmentPrefix)
          ? "Reassigned"
          : "Assignment ended",
        truck: assignment.truck.unitNumber,
        driver: assignment.driver.name,
        note: assignment.endReason,
      });
    }
  }

  return {
    deliveryLabel: label(delivery),
    hasAssignments: ordered.length > 0,
    current: current
      ? {
          truck: current.truck.unitNumber,
          driver: current.driver.name,
          vinLabel: current.truck.vin ?? "Not recorded",
          capacityLabel: capacityLabel(current.truck.capacityKg),
          truckStatusLabel: formatStatus(current.truck.status),
          driverStatusLabel: formatStatus(current.driver.status),
          assignedAtLabel: formatDateTime(current.assignedAt, timezone),
        }
      : null,
    history,
    changes,
    continuity: continuityFor(ordered),
    timeline,
  };
}
