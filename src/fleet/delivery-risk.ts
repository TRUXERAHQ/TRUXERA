import type { DeliveryStatus } from "./delivery-lifecycle";
import {
  getReassignmentRecommendations,
  getResourceAssignmentConflicts,
  type CurrentAssignmentResources,
  type ReassignmentAssignment,
  type ReassignmentDriver,
  type ReassignmentTruck,
} from "./reassignment-engine.ts";

export const riskLevels = ["LOW", "MEDIUM", "HIGH"] as const;

export type OperationalRiskLevel = (typeof riskLevels)[number];

type DeliveryRiskEvent = {
  type: string;
  toStatus: string | null;
  note: string | null;
};

type DeliveryRiskAssignment = CurrentAssignmentResources & {
  deliveryId: string;
  truck: ReassignmentTruck;
  driver: ReassignmentDriver;
};

export type DeliveryRiskInput = {
  organizationId: string;
  analyzedAt: Date;
  delivery: {
    id: string;
    organizationId: string;
    loadId: string;
    status: DeliveryStatus;
    riskLevel: OperationalRiskLevel;
    eta: Date | null;
    weightKg: number | string | null;
  };
  currentAssignment: DeliveryRiskAssignment | null;
  assignmentHistory: Array<{
    endedAt: Date | null;
    endReason: string | null;
  }>;
  trucks: ReassignmentTruck[];
  drivers: ReassignmentDriver[];
  activeAssignments: ReassignmentAssignment[];
  events: DeliveryRiskEvent[] | null;
};

export type DeliveryRiskRecord = {
  id: string;
  organizationId: string;
  loadId: string;
  status: DeliveryStatus;
  riskLevel: OperationalRiskLevel;
  eta: Date | null;
  load: { weightKg: number | string | null };
};

export type DeliveryRiskAssignmentRecord = Omit<
  ReassignmentAssignment,
  "loadId"
> & {
  organizationId: string;
  endReason: string | null;
  truck: ReassignmentTruck;
  driver: ReassignmentDriver;
  delivery: { organizationId: string; loadId: string };
};

export type DeliveryRiskEventRecord = DeliveryRiskEvent & {
  organizationId: string;
  deliveryId: string;
};

export type DeliveryRiskAnalysis = {
  status: "ASSESSED" | "INSUFFICIENT_DATA";
  riskLevel: OperationalRiskLevel | null;
  storedRiskLevel: OperationalRiskLevel;
  reasons: string[];
  evidence: string[];
  limitations: string[];
  intervention: {
    required: boolean;
    action: string | null;
    eligibleReassignmentCount: number;
    insufficientReassignmentDataCount: number;
    recommended: {
      truckId: string;
      truckUnitNumber: string;
      driverId: string;
      driverName: string;
    } | null;
  };
  reassignmentCandidates: Array<{
    truckId: string;
    truckUnitNumber: string;
    driverId: string;
    driverName: string;
    capacityUtilizationPercent: number;
  }>;
};

export function analyzeDeliveryRisksForOrganization(input: {
  organizationId: string;
  analyzedAt: Date;
  deliveries: DeliveryRiskRecord[];
  trucks: ReassignmentTruck[];
  drivers: ReassignmentDriver[];
  assignments: DeliveryRiskAssignmentRecord[];
  events: DeliveryRiskEventRecord[];
}) {
  const organizationTrucks = input.trucks.filter(
    (truck) => truck.organizationId === input.organizationId,
  );
  const organizationDrivers = input.drivers.filter(
    (driver) => driver.organizationId === input.organizationId,
  );
  const organizationAssignments = input.assignments.filter(
    (assignment) =>
      assignment.organizationId === input.organizationId &&
      assignment.delivery.organizationId === input.organizationId,
  );
  const activeAssignments: ReassignmentAssignment[] =
    organizationAssignments
      .filter((assignment) => assignment.endedAt === null)
      .map((assignment) => ({
        id: assignment.id,
        deliveryId: assignment.deliveryId,
        loadId: assignment.delivery.loadId,
        truckId: assignment.truckId,
        driverId: assignment.driverId,
        endedAt: assignment.endedAt,
      }));
  const organizationEvents = input.events.filter(
    (event) => event.organizationId === input.organizationId,
  );

  return input.deliveries
    .filter((delivery) => delivery.organizationId === input.organizationId)
    .map((delivery) => {
      const deliveryAssignments = organizationAssignments.filter(
        (assignment) => assignment.deliveryId === delivery.id,
      );
      const active = deliveryAssignments.find(
        (assignment) => assignment.endedAt === null,
      );
      const currentAssignment: DeliveryRiskAssignment | null = active
        ? {
            id: active.id,
            deliveryId: active.deliveryId,
            truckId: active.truckId,
            driverId: active.driverId,
            truck: active.truck,
            driver: active.driver,
          }
        : null;

      return {
        deliveryId: delivery.id,
        analysis: analyzeDeliveryRisk({
          organizationId: input.organizationId,
          analyzedAt: input.analyzedAt,
          delivery: {
            id: delivery.id,
            organizationId: delivery.organizationId,
            loadId: delivery.loadId,
            status: delivery.status,
            riskLevel: delivery.riskLevel,
            eta: delivery.eta,
            weightKg: delivery.load.weightKg,
          },
          currentAssignment,
          assignmentHistory: deliveryAssignments
            .filter((assignment) => assignment.endedAt !== null)
            .map(({ endedAt, endReason }) => ({ endedAt, endReason })),
          trucks: organizationTrucks,
          drivers: organizationDrivers,
          activeAssignments,
          events: organizationEvents
            .filter((event) => event.deliveryId === delivery.id)
            .map(({ type, toStatus, note }) => ({ type, toStatus, note })),
        }),
      };
    });
}

export function summarizeDeliveryRisks(
  analyses: Iterable<DeliveryRiskAnalysis>,
) {
  const summary = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    insufficientData: 0,
    requiringIntervention: 0,
    withEligibleReassignment: 0,
  };

  for (const analysis of analyses) {
    if (analysis.riskLevel) summary[analysis.riskLevel] += 1;
    else summary.insufficientData += 1;
    if (analysis.intervention.required) summary.requiringIntervention += 1;
    if (analysis.intervention.eligibleReassignmentCount > 0) {
      summary.withEligibleReassignment += 1;
    }
  }

  return summary;
}

const activeDeliveryStatuses = new Set<DeliveryStatus>([
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
]);

const terminalDeliveryStatuses = new Set<DeliveryStatus>([
  "DELIVERED",
  "FAILED",
  "CANCELLED",
]);

function numericValue(value: number | string | null) {
  if (value === null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hasReassignmentHistory(input: DeliveryRiskInput) {
  return (
    input.assignmentHistory.some((assignment) =>
      assignment.endReason?.startsWith("Reassigned from "),
    ) ||
    input.events?.some(
      (event) =>
        event.type === "ASSIGNMENT_CHANGED" &&
        event.note?.startsWith("Reassigned from "),
    ) === true
  );
}

function getReassignmentAssessment(input: DeliveryRiskInput) {
  const assignment = input.currentAssignment;
  if (
    !assignment ||
    !activeDeliveryStatuses.has(input.delivery.status) ||
    assignment.deliveryId !== input.delivery.id
  ) {
    return null;
  }

  return getReassignmentRecommendations({
    organizationId: input.organizationId,
    delivery: {
      id: input.delivery.id,
      organizationId: input.delivery.organizationId,
      loadId: input.delivery.loadId,
      weightKg: input.delivery.weightKg,
    },
    currentAssignment: {
      id: assignment.id,
      truckId: assignment.truckId,
      driverId: assignment.driverId,
    },
    trucks: input.trucks,
    drivers: input.drivers,
    activeAssignments: input.activeAssignments,
  });
}

export function analyzeDeliveryRisk(
  input: DeliveryRiskInput,
): DeliveryRiskAnalysis {
  const reasons: string[] = [];
  const evidence: string[] = [
    `Delivery status: ${input.delivery.status}.`,
    `Stored delivery risk level: ${input.delivery.riskLevel}.`,
  ];
  const limitations: string[] = [];
  const highSignals: string[] = [];
  const mediumSignals: string[] = [];
  let hasBlockingUnknown = false;

  if (
    input.delivery.organizationId !== input.organizationId ||
    (input.currentAssignment &&
      (input.currentAssignment.truck.organizationId !== input.organizationId ||
        input.currentAssignment.driver.organizationId !== input.organizationId))
  ) {
    return {
      status: "INSUFFICIENT_DATA",
      riskLevel: null,
      storedRiskLevel: input.delivery.riskLevel,
      reasons: ["Risk analysis requires organization-scoped operational data."],
      evidence: [],
      limitations: ["One or more risk inputs are outside the selected organization."],
      intervention: {
        required: false,
        action: null,
        eligibleReassignmentCount: 0,
        insufficientReassignmentDataCount: 0,
        recommended: null,
      },
      reassignmentCandidates: [],
    };
  }

  if (input.delivery.riskLevel === "HIGH") {
    highSignals.push("The stored delivery risk level is HIGH.");
  } else if (input.delivery.riskLevel === "MEDIUM") {
    mediumSignals.push("The stored delivery risk level is MEDIUM.");
  }

  if (input.delivery.status === "FAILED") {
    highSignals.push("The delivery is recorded as failed.");
  }

  const active = activeDeliveryStatuses.has(input.delivery.status);
  const assignment = input.currentAssignment;
  if (assignment && assignment.deliveryId !== input.delivery.id) {
    highSignals.push("The active assignment points to a different delivery.");
  }
  if (active && !assignment) {
    highSignals.push("The active delivery has no current truck and driver assignment.");
  } else if (!active && assignment && terminalDeliveryStatuses.has(input.delivery.status)) {
    highSignals.push("A terminal delivery still has an active assignment.");
  } else if (input.delivery.status === "PLANNED" && assignment) {
    highSignals.push("A planned delivery already has an active assignment.");
  }

  if (assignment) {
    evidence.push(
      `Current assignment: truck ${assignment.truck.unitNumber}, driver ${assignment.driver.name}.`,
      `Truck status: ${assignment.truck.status}.`,
      `Driver status: ${assignment.driver.status}.`,
    );

    if (
      assignment.truck.deactivatedAt !== null ||
      assignment.truck.status === "MAINTENANCE" ||
      assignment.truck.status === "OUT_OF_SERVICE"
    ) {
      highSignals.push("The assigned truck is deactivated, in maintenance, or out of service.");
    }

    if (
      assignment.driver.status === "OFF_DUTY" ||
      assignment.driver.status === "ON_LEAVE" ||
      assignment.driver.status === "INACTIVE"
    ) {
      highSignals.push("The assigned driver is off duty, on leave, or inactive.");
    }

    const weightKg = numericValue(input.delivery.weightKg);
    const capacityKg = numericValue(assignment.truck.capacityKg);
    if (weightKg === null || capacityKg === null || capacityKg === 0) {
      hasBlockingUnknown = true;
      limitations.push(
        "Load weight or assigned-truck capacity is unavailable; capacity fit cannot be verified.",
      );
    } else {
      evidence.push(
        `Load weight: ${weightKg} kg; assigned-truck capacity: ${capacityKg} kg.`,
      );
      if (weightKg > capacityKg) {
        highSignals.push("The assigned truck capacity is insufficient for the load weight.");
      }
    }

    const conflicts = getResourceAssignmentConflicts(
      input.activeAssignments,
      input.delivery.loadId,
      assignment.truckId,
      assignment.driverId,
    );
    if (conflicts.truck > 0) {
      highSignals.push("The assigned truck has conflicting active work on another load.");
    }
    if (conflicts.driver > 0) {
      highSignals.push("The assigned driver has conflicting active work on another load.");
    }
    if (conflicts.truck === 0 && conflicts.driver === 0) {
      evidence.push("No conflicting active assignments on other loads were found.");
    }
  }

  if (input.delivery.eta === null) {
    limitations.push("No stored ETA is available; ETA-based delay is not assessed.");
  } else {
    evidence.push(`Stored ETA: ${input.delivery.eta.toISOString()}.`);
    if (
      !terminalDeliveryStatuses.has(input.delivery.status) &&
      input.analyzedAt.getTime() > input.delivery.eta.getTime()
    ) {
      highSignals.push("The stored delivery ETA has passed while the delivery remains incomplete.");
    }
  }

  if (input.events === null) {
    hasBlockingUnknown = true;
    limitations.push("Operational event history is unavailable; history-based signals are not assessed.");
  } else {
    if (
      input.events.some(
        (event) =>
          event.type === "STATUS_CHANGED" && event.toStatus === "FAILED",
      )
    ) {
      highSignals.push("Operational history records a failed delivery status.");
    }
    const exceptionCount = input.events.filter(
      (event) => event.type === "EXCEPTION_REPORTED",
    ).length;
    if (exceptionCount > 0) {
      highSignals.push("Operational history contains a reported exception.");
    }
    const attemptCount = input.events.filter(
      (event) => event.type === "DELIVERY_ATTEMPTED",
    ).length;
    if (attemptCount > 1) {
      mediumSignals.push("Operational history contains multiple delivery attempts.");
    }
    evidence.push(`Operational events reviewed: ${input.events.length}.`);
  }

  if (hasReassignmentHistory(input)) {
    mediumSignals.push("The delivery has recorded reassignment history.");
  }

  const reassignment = getReassignmentAssessment(input);
  if (reassignment) {
    evidence.push(
      `Eligible replacement combinations: ${reassignment.eligibleCount}.`,
    );
    if (reassignment.insufficientDataCount > 0) {
      limitations.push(
        `Capacity fit could not be verified for ${reassignment.insufficientDataCount} replacement combination(s).`,
      );
    }
  }

  const riskLevel = highSignals.length > 0
    ? "HIGH"
    : mediumSignals.length > 0
      ? "MEDIUM"
      : hasBlockingUnknown
        ? null
        : "LOW";

  if (highSignals.length > 0) reasons.push(...highSignals);
  if (mediumSignals.length > 0) reasons.push(...mediumSignals);
  if (riskLevel === "LOW") {
    reasons.push("No elevated operational risk signal was found in the available data.");
  } else if (riskLevel === null) {
    reasons.push("Risk could not be classified because required operational evidence is unavailable.");
  }

  const recommended = reassignment?.recommended;
  const interventionRequired =
    riskLevel === "HIGH" &&
    input.delivery.status !== "DELIVERED" &&
    input.delivery.status !== "CANCELLED";
  return {
    status: riskLevel === null ? "INSUFFICIENT_DATA" : "ASSESSED",
    riskLevel,
    storedRiskLevel: input.delivery.riskLevel,
    reasons,
    evidence,
    limitations,
    intervention: {
      required: interventionRequired,
      action: interventionRequired
        ? recommended
          ? "Review reassignment"
          : assignment
            ? "Review current assignment"
            : "Review delivery status and assignment"
        : null,
      eligibleReassignmentCount: reassignment?.eligibleCount ?? 0,
      insufficientReassignmentDataCount:
        reassignment?.insufficientDataCount ?? 0,
      recommended: recommended
        ? {
            truckId: recommended.truck.id,
            truckUnitNumber: recommended.truck.unitNumber,
            driverId: recommended.driver.id,
            driverName: recommended.driver.name,
          }
        : null,
    },
    reassignmentCandidates:
      reassignment?.candidates.flatMap((candidate) =>
        candidate.assessment.status === "ELIGIBLE"
          ? [{
              truckId: candidate.truck.id,
              truckUnitNumber: candidate.truck.unitNumber,
              driverId: candidate.driver.id,
              driverName: candidate.driver.name,
              capacityUtilizationPercent:
                candidate.assessment.capacityUtilizationPercent,
            }]
          : [],
      ) ?? [],
  };
}
