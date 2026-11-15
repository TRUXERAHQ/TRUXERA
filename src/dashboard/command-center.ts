import {
  deliveryStatuses,
  type DeliveryStatus,
} from "../fleet/delivery-lifecycle.ts";
import type {
  DeliveryRiskAnalysis,
  OperationalRiskLevel,
} from "../fleet/delivery-risk.ts";
import { riskLevels } from "../fleet/delivery-risk.ts";
import { isUuid } from "../trucks/truck-policy.ts";

const activeStatuses = new Set<DeliveryStatus>([
  "PLANNED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
]);
const recentEventWindowMs = 24 * 60 * 60 * 1000;

export type CommandCenterFilters = {
  query: string;
  risk: OperationalRiskLevel | "INSUFFICIENT_DATA" | "ANY";
  status: DeliveryStatus | "ANY";
  assignmentState: "ASSIGNED" | "UNASSIGNED" | "ANY";
  truckId: string | null;
  driverId: string | null;
  loadId: string | null;
  requiresAttention: boolean | null;
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCommandCenterFilters(params: {
  q?: string | string[];
  risk?: string | string[];
  status?: string | string[];
  assignmentState?: string | string[];
  truckId?: string | string[];
  driverId?: string | string[];
  loadId?: string | string[];
  attention?: string | string[];
}): CommandCenterFilters {
  const query = firstValue(params.q)?.trim().slice(0, 100) ?? "";
  const riskValue = firstValue(params.risk);
  const statusValue = firstValue(params.status);
  const assignmentValue = firstValue(params.assignmentState);
  const attentionValue = firstValue(params.attention);
  const truckId = firstValue(params.truckId);
  const driverId = firstValue(params.driverId);
  const loadId = firstValue(params.loadId);

  return {
    query,
    risk: riskValue === "INSUFFICIENT_DATA"
      ? riskValue
      : riskLevels.find((level) => level === riskValue) ?? "ANY",
    status:
      deliveryStatuses.find((status) => status === statusValue) ?? "ANY",
    assignmentState:
      assignmentValue === "ASSIGNED" || assignmentValue === "UNASSIGNED"
        ? assignmentValue
        : "ANY",
    truckId: isUuid(truckId) ? truckId : null,
    driverId: isUuid(driverId) ? driverId : null,
    loadId: isUuid(loadId) ? loadId : null,
    requiresAttention:
      attentionValue === "1"
        ? true
        : attentionValue === "0"
          ? false
          : null,
  };
}

export type CommandCenterDelivery = {
  id: string;
  organizationId: string;
  loadId: string;
  reference: string | null;
  stopNumber: number;
  status: DeliveryStatus;
  riskLevel: OperationalRiskLevel;
  eta: Date | null;
  destinationAddress: string;
  load: {
    organizationId: string;
    reference: string;
    customerName: string;
    weightKg: number | string | null;
  };
};

export type CommandCenterAssignment = {
  id: string;
  organizationId: string;
  deliveryId: string;
  endedAt: Date | null;
  truck: {
    id: string;
    organizationId: string;
    unitNumber: string;
  };
  driver: {
    id: string;
    organizationId: string;
    name: string;
  };
  delivery: {
    organizationId: string;
  };
};

export type CommandCenterEvent = {
  id: string;
  organizationId: string;
  deliveryId: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  occurredAt: Date;
};

export type CommandCenterItem = {
  deliveryId: string;
  loadId: string;
  deliveryReference: string;
  loadReference: string;
  customerName: string;
  destinationAddress: string;
  status: DeliveryStatus;
  activeWork: boolean;
  risk: DeliveryRiskAnalysis;
  assignment: {
    id: string;
    truckId: string;
    truckUnitNumber: string;
    driverId: string;
    driverName: string;
  } | null;
  assignmentState: "ASSIGNED" | "UNASSIGNED";
  recentEvents: CommandCenterEvent[];
  latestEventAt: Date | null;
  requiresAttention: boolean;
  priority: number;
  actionability: number;
};

function compareItems(left: CommandCenterItem, right: CommandCenterItem) {
  return (
    left.priority - right.priority ||
    right.actionability - left.actionability ||
    (right.latestEventAt?.getTime() ?? 0) -
      (left.latestEventAt?.getTime() ?? 0) ||
    left.loadReference.localeCompare(right.loadReference, "en", {
      numeric: true,
      sensitivity: "base",
    }) ||
    left.deliveryId.localeCompare(right.deliveryId)
  );
}

function filterItems(
  items: CommandCenterItem[],
  filters: CommandCenterFilters,
) {
  const query = filters.query.toLocaleLowerCase();
  return items.filter((item) => {
    const matchesRisk =
      filters.risk === "ANY" ||
      (filters.risk === "INSUFFICIENT_DATA"
        ? item.risk.riskLevel === null
        : item.risk.riskLevel === filters.risk);
    const matchesStatus =
      filters.status === "ANY" || item.status === filters.status;
    const matchesAssignment =
      filters.assignmentState === "ANY" ||
      item.assignmentState === filters.assignmentState;
    const matchesTruck =
      filters.truckId === null || item.assignment?.truckId === filters.truckId;
    const matchesDriver =
      filters.driverId === null ||
      item.assignment?.driverId === filters.driverId;
    const matchesLoad =
      filters.loadId === null || item.loadId === filters.loadId;
    const matchesAttention =
      filters.requiresAttention === null ||
      item.requiresAttention === filters.requiresAttention;
    const matchesQuery =
      !query ||
      [
        item.deliveryId,
        item.loadId,
        item.deliveryReference,
        item.loadReference,
        item.customerName,
      ].some((value) => value.toLocaleLowerCase().includes(query));

    return (
      matchesRisk &&
      matchesStatus &&
      matchesAssignment &&
      matchesTruck &&
      matchesDriver &&
      matchesLoad &&
      matchesAttention &&
      matchesQuery
    );
  });
}

export function buildCommandCenter(input: {
  organizationId: string;
  now: Date;
  filters: CommandCenterFilters;
  deliveries: CommandCenterDelivery[];
  assignments: CommandCenterAssignment[];
  events: CommandCenterEvent[];
  analyses: Array<{
    organizationId: string;
    deliveryId: string;
    analysis: DeliveryRiskAnalysis;
  }>;
}) {
  const deliveries = input.deliveries.filter(
    (delivery) =>
      delivery.organizationId === input.organizationId &&
      delivery.load.organizationId === input.organizationId,
  );
  const deliveryIds = new Set(deliveries.map((delivery) => delivery.id));
  const assignments = input.assignments.filter(
    (assignment) =>
      assignment.organizationId === input.organizationId &&
      assignment.delivery.organizationId === input.organizationId &&
      deliveryIds.has(assignment.deliveryId) &&
      assignment.endedAt === null &&
      assignment.truck.organizationId === input.organizationId &&
      assignment.driver.organizationId === input.organizationId,
  );
  const assignmentByDeliveryId = new Map(
    assignments.map((assignment) => [assignment.deliveryId, assignment]),
  );
  const analysisByDeliveryId = new Map(
    input.analyses
      .filter(
        (item) =>
          item.organizationId === input.organizationId &&
          deliveryIds.has(item.deliveryId),
      )
      .map((item) => [item.deliveryId, item.analysis]),
  );
  const scopedEvents = input.events
    .filter(
      (event) =>
        event.organizationId === input.organizationId &&
        deliveryIds.has(event.deliveryId),
    )
    .sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        right.id.localeCompare(left.id),
    );
  const eventsByDeliveryId = new Map<string, CommandCenterEvent[]>();
  for (const event of scopedEvents) {
    const events = eventsByDeliveryId.get(event.deliveryId) ?? [];
    events.push(event);
    eventsByDeliveryId.set(event.deliveryId, events);
  }

  const items = deliveries.flatMap((delivery) => {
    const activeWork = activeStatuses.has(delivery.status);
    if (!activeWork && delivery.status !== "FAILED") return [];

    const assignment = assignmentByDeliveryId.get(delivery.id);
    const analysis = analysisByDeliveryId.get(delivery.id);
    const risk: DeliveryRiskAnalysis = analysis ?? {
      status: "INSUFFICIENT_DATA",
      riskLevel: null,
      storedRiskLevel: delivery.riskLevel,
      reasons: ["Risk analysis is unavailable for this delivery."],
      evidence: [],
      limitations: ["Operational risk signals could not be assembled."],
      intervention: {
        required: false,
        action: null,
        eligibleReassignmentCount: 0,
        insufficientReassignmentDataCount: 0,
        recommended: null,
      },
      reassignmentCandidates: [],
    };
    const recentEvents = (eventsByDeliveryId.get(delivery.id) ?? []).slice(0, 4);
    const latestEventAt = recentEvents[0]?.occurredAt ?? null;
    const hasRecentEvent = recentEvents.some(
      (event) => {
        const age = input.now.getTime() - event.occurredAt.getTime();
        return age >= 0 && age <= recentEventWindowMs;
      },
    );
    const hasException = recentEvents.some(
      (event) => event.type === "EXCEPTION_REPORTED",
    );
    const requiresAttention =
      risk.riskLevel === "HIGH" ||
      risk.riskLevel === "MEDIUM" ||
      delivery.status === "FAILED" ||
      (risk.riskLevel === "LOW" && (hasRecentEvent || hasException));
    const priority =
      risk.riskLevel === "HIGH"
        ? 0
        : risk.riskLevel === "MEDIUM"
          ? 1
          : risk.riskLevel === "LOW" && (hasRecentEvent || hasException)
            ? 2
            : activeWork
              ? 3
              : 4;
    const reasons = risk.reasons.join(" ").toLocaleLowerCase();
    const actionability =
      Number(Boolean(risk.intervention.recommended)) +
      Number(reasons.includes("unavailable") || reasons.includes("out of service")) +
      Number(reasons.includes("capacity")) +
      Number(reasons.includes("conflicting active work")) +
      Number(delivery.status === "FAILED") +
      Number(hasException) +
      Number(hasRecentEvent);

    return [{
      deliveryId: delivery.id,
      loadId: delivery.loadId,
      deliveryReference:
        delivery.reference ?? `${delivery.load.reference} · Stop ${delivery.stopNumber}`,
      loadReference: delivery.load.reference,
      customerName: delivery.load.customerName,
      destinationAddress: delivery.destinationAddress,
      status: delivery.status,
      activeWork,
      risk,
      assignment: assignment
        ? {
            id: assignment.id,
            truckId: assignment.truck.id,
            truckUnitNumber: assignment.truck.unitNumber,
            driverId: assignment.driver.id,
            driverName: assignment.driver.name,
          }
        : null,
      assignmentState: assignment ? "ASSIGNED" as const : "UNASSIGNED" as const,
      recentEvents,
      latestEventAt,
      requiresAttention,
      priority,
      actionability,
    }];
  });

  const openDeliveries = deliveries.filter((delivery) =>
    activeStatuses.has(delivery.status),
  );
  const recentEvents = scopedEvents.slice(0, 12);
  const summary = {
    requiresAttention: items.filter((item) => item.requiresAttention).length,
    highRisk: items.filter((item) => item.risk.riskLevel === "HIGH").length,
    mediumRisk: items.filter((item) => item.risk.riskLevel === "MEDIUM").length,
    activeAssignments: assignments.filter((assignment) =>
      openDeliveries.some((delivery) => delivery.id === assignment.deliveryId),
    ).length,
    openDeliveries: openDeliveries.length,
  };

  return {
    items: filterItems(items.sort(compareItems), input.filters),
    recentEvents,
    summary,
    totalItems: items.length,
  };
}
