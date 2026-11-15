export type ReassignmentDelivery = {
  id: string;
  organizationId: string;
  loadId: string;
  weightKg: number | string | null;
};

export type ReassignmentTruck = {
  id: string;
  organizationId: string;
  unitNumber: string;
  status: string;
  deactivatedAt: Date | null;
  capacityKg: number | string | null;
};

export type ReassignmentDriver = {
  id: string;
  organizationId: string;
  name: string;
  status: string;
};

export type ReassignmentAssignment = {
  id: string;
  deliveryId: string;
  loadId: string;
  truckId: string;
  driverId: string;
  endedAt: Date | null;
};

export type CurrentAssignmentResources = {
  id: string;
  truckId: string;
  driverId: string;
};

export type CandidateAssessment =
  | {
      status: "ELIGIBLE";
      reason: string;
      score: number;
      capacityUtilizationPercent: number;
    }
  | {
      status: "INSUFFICIENT_DATA";
      reason: string;
      score: null;
      capacityUtilizationPercent: null;
    }
  | {
      status: "INELIGIBLE";
      reason: string;
      score: null;
      capacityUtilizationPercent: null;
    };

export type ReassignmentCandidate = {
  truck: ReassignmentTruck;
  driver: ReassignmentDriver;
  assessment: Exclude<CandidateAssessment, { status: "INELIGIBLE" }>;
};

export type ReassignmentRecommendations = {
  candidates: ReassignmentCandidate[];
  eligibleCount: number;
  insufficientDataCount: number;
  recommended: ReassignmentCandidate | null;
};

function numericValue(value: number | string | null) {
  if (value === null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getResourceAssignmentConflicts(
  assignments: ReassignmentAssignment[],
  loadId: string,
  truckId: string,
  driverId: string,
) {
  const active = assignments.filter(
    (assignment) =>
      assignment.endedAt === null && assignment.loadId !== loadId,
  );
  return {
    truck: active.filter((assignment) => assignment.truckId === truckId)
      .length,
    driver: active.filter((assignment) => assignment.driverId === driverId)
      .length,
  };
}

export function assessReassignmentCandidate(
  organizationId: string,
  delivery: ReassignmentDelivery,
  currentAssignment: CurrentAssignmentResources,
  truck: ReassignmentTruck,
  driver: ReassignmentDriver,
  activeAssignments: ReassignmentAssignment[],
): CandidateAssessment {
  if (
    delivery.organizationId !== organizationId ||
    truck.organizationId !== organizationId ||
    driver.organizationId !== organizationId
  ) {
    return {
      status: "INELIGIBLE",
      reason: "All records must belong to the same organization.",
      score: null,
      capacityUtilizationPercent: null,
    };
  }
  if (
    truck.id === currentAssignment.truckId ||
    driver.id === currentAssignment.driverId
  ) {
    return {
      status: "INELIGIBLE",
      reason: "The current truck and driver cannot be recommended again.",
      score: null,
      capacityUtilizationPercent: null,
    };
  }
  if (truck.deactivatedAt !== null || truck.status !== "AVAILABLE") {
    return {
      status: "INELIGIBLE",
      reason: "The truck is not active and available.",
      score: null,
      capacityUtilizationPercent: null,
    };
  }
  if (driver.status !== "AVAILABLE" && driver.status !== "ON_DUTY") {
    return {
      status: "INELIGIBLE",
      reason: "The driver is not available or on duty.",
      score: null,
      capacityUtilizationPercent: null,
    };
  }

  const conflicts = getResourceAssignmentConflicts(
    activeAssignments.filter(
      (assignment) => assignment.id !== currentAssignment.id,
    ),
    delivery.loadId,
    truck.id,
    driver.id,
  );
  if (conflicts.truck > 0 || conflicts.driver > 0) {
    return {
      status: "INELIGIBLE",
      reason: "The truck or driver has an active assignment on another load.",
      score: null,
      capacityUtilizationPercent: null,
    };
  }

  const weightKg = numericValue(delivery.weightKg);
  const capacityKg = numericValue(truck.capacityKg);
  if (weightKg === null || capacityKg === null || capacityKg === 0) {
    return {
      status: "INSUFFICIENT_DATA",
      reason: "Load weight or truck capacity is unavailable; capacity fit cannot be verified.",
      score: null,
      capacityUtilizationPercent: null,
    };
  }
  if (weightKg > capacityKg) {
    return {
      status: "INELIGIBLE",
      reason: "The truck does not have sufficient capacity for this load.",
      score: null,
      capacityUtilizationPercent: null,
    };
  }

  const sameLoadAssignmentCount = activeAssignments.filter(
    (assignment) =>
      assignment.endedAt === null &&
      assignment.id !== currentAssignment.id &&
      assignment.loadId === delivery.loadId &&
      (assignment.truckId === truck.id || assignment.driverId === driver.id),
  ).length;

  // Eligible candidates have verified capacity and no cross-load conflicts.
  // Scores then favor an available driver over an on-duty driver, fewer active
  // stops for the same load, and finally stable truck/driver identifiers.
  const score =
    1_000 +
    100 +
    (driver.status === "AVAILABLE" ? 20 : 10) -
    sameLoadAssignmentCount;

  return {
    status: "ELIGIBLE",
    reason: "Capacity and resource availability are verified.",
    score,
    capacityUtilizationPercent: Math.round((weightKg / capacityKg) * 100),
  };
}

function compareCandidates(
  left: ReassignmentCandidate,
  right: ReassignmentCandidate,
) {
  if (left.assessment.status !== right.assessment.status) {
    return left.assessment.status === "ELIGIBLE" ? -1 : 1;
  }
  if (
    left.assessment.status === "ELIGIBLE" &&
    right.assessment.status === "ELIGIBLE" &&
    left.assessment.score !== right.assessment.score
  ) {
    return right.assessment.score - left.assessment.score;
  }

  return (
    left.truck.unitNumber.localeCompare(right.truck.unitNumber, "en", {
      numeric: true,
      sensitivity: "base",
    }) ||
    left.driver.name.localeCompare(right.driver.name, "en", {
      sensitivity: "base",
    }) ||
    left.truck.id.localeCompare(right.truck.id) ||
    left.driver.id.localeCompare(right.driver.id)
  );
}

export function getReassignmentRecommendations(input: {
  organizationId: string;
  delivery: ReassignmentDelivery;
  currentAssignment: CurrentAssignmentResources;
  trucks: ReassignmentTruck[];
  drivers: ReassignmentDriver[];
  activeAssignments: ReassignmentAssignment[];
}): ReassignmentRecommendations {
  const candidates: ReassignmentCandidate[] = [];

  for (const truck of input.trucks) {
    for (const driver of input.drivers) {
      const assessment = assessReassignmentCandidate(
        input.organizationId,
        input.delivery,
        input.currentAssignment,
        truck,
        driver,
        input.activeAssignments,
      );
      if (assessment.status !== "INELIGIBLE") {
        candidates.push({ truck, driver, assessment });
      }
    }
  }

  candidates.sort(compareCandidates);
  const eligible = candidates.filter(
    (candidate) => candidate.assessment.status === "ELIGIBLE",
  );

  return {
    candidates,
    eligibleCount: eligible.length,
    insufficientDataCount: candidates.length - eligible.length,
    recommended: eligible[0] ?? null,
  };
}
