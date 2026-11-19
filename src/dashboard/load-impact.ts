import {
  formatDateTime,
  formatDuration,
  type ChainDeliveryInput,
  type ChainRiskLevel,
  type ImpactAssignmentInput,
  type ImpactEventInput,
} from "./delivery-chain.ts";

export type LoadImpactAssignment = ImpactAssignmentInput & {
  truckId: string;
  driverId: string;
};

export type LoadImpactInput = {
  deliveries: ChainDeliveryInput[];
  loadCustomerName: string;
  riskByDeliveryId: Map<string, { riskLevel: ChainRiskLevel }>;
  assignmentsByDeliveryId: Map<string, LoadImpactAssignment[]>;
  eventsByDeliveryId: Map<string, ImpactEventInput[]>;
  timezone: string;
};

export type DeliveryEvidenceKind =
  | "failed"
  | "cancelled"
  | "reassigned"
  | "manualEnd"
  | "exception"
  | "attempts"
  | "projectedDelay"
  | "risk";

export type DeliveryEvidence = {
  kind: DeliveryEvidenceKind;
  sentence: string;
};

const terminalStatuses = new Set(["DELIVERED", "FAILED", "CANCELLED"]);
const reassignmentPrefix = "Reassigned from truck ";
const autoEndPrefix = "Delivery status changed to ";

function isReassignment(reason: string | null) {
  return reason?.startsWith(reassignmentPrefix) ?? false;
}

function isAutoEnd(reason: string | null) {
  return reason?.startsWith(autoEndPrefix) ?? false;
}

function activeAssignment(
  assignments: LoadImpactAssignment[],
): LoadImpactAssignment | undefined {
  return assignments.find((assignment) => assignment.endedAt === null);
}

function projectedDelayMs(
  delivery: ChainDeliveryInput,
): number | null {
  if (!delivery.eta || !delivery.deliveryWindowEnd) return null;
  const delta =
    delivery.eta.getTime() - delivery.deliveryWindowEnd.getTime();
  return delta > 0 ? delta : null;
}

function parseReassignmentRoute(endReason: string) {
  const match = endReason.match(
    /^Reassigned from truck (.+?) \/ driver (.+?) to truck (.+?) \/ driver (.+?)(?:\. Reason: .*)?$/,
  );
  if (!match) {
    return endReason.replace(/\. Reason: .*$/, "");
  }
  const [, fromTruck, fromDriver, toTruck, toDriver] = match;
  return `from truck ${fromTruck} · driver ${fromDriver} to truck ${toTruck} · driver ${toDriver}`;
}

export function collectDeliveryEvidence(
  delivery: ChainDeliveryInput,
  assignments: LoadImpactAssignment[],
  events: ImpactEventInput[],
  riskLevel: ChainRiskLevel,
): DeliveryEvidence[] {
  const label = delivery.reference ?? `Stop ${delivery.stopNumber}`;
  const evidence: DeliveryEvidence[] = [];

  const failedEvent = events.find(
    (event) => event.type === "STATUS_CHANGED" && event.toStatus === "FAILED",
  );
  if (failedEvent || delivery.status === "FAILED") {
    evidence.push({
      kind: "failed",
      sentence: `${label} was marked failed.`,
    });
  }

  const cancelledEvent = events.find(
    (event) =>
      event.type === "STATUS_CHANGED" && event.toStatus === "CANCELLED",
  );
  if (cancelledEvent || delivery.status === "CANCELLED") {
    evidence.push({
      kind: "cancelled",
      sentence: `${label} was cancelled.`,
    });
  }

  const orderedAssignments = [...assignments].sort(
    (left, right) => left.assignedAt.getTime() - right.assignedAt.getTime(),
  );
  for (const assignment of orderedAssignments) {
    const reason = assignment.endReason;
    if (assignment.endedAt !== null && isReassignment(reason)) {
      evidence.push({
        kind: "reassigned",
        sentence: `${label} was reassigned ${parseReassignmentRoute(reason ?? "")}.`,
      });
    } else if (
      assignment.endedAt !== null &&
      !isAutoEnd(reason)
    ) {
      const detail = reason?.trim();
      evidence.push({
        kind: "manualEnd",
        sentence:
          detail && detail !== "Assignment ended"
            ? `${label} assignment ended — ${detail}.`
            : `${label} assignment ended.`,
      });
    }
  }

  const exceptionEvents = events.filter(
    (event) => event.type === "EXCEPTION_REPORTED",
  );
  if (exceptionEvents.length > 0) {
    const notes = exceptionEvents
      .map((event) => event.note?.trim())
      .filter((note): note is string => Boolean(note))
      .slice(0, 2);
    evidence.push({
      kind: "exception",
      sentence:
        `${label} has ${exceptionEvents.length} reported exception` +
        `${exceptionEvents.length === 1 ? "" : "s"}` +
        `${notes.length > 0 ? `: ${notes.join(" · ")}` : ""}.`,
    });
  }

  const attemptCount = events.filter(
    (event) => event.type === "DELIVERY_ATTEMPTED",
  ).length;
  if (attemptCount > 1) {
    evidence.push({
      kind: "attempts",
      sentence: `${label} has ${attemptCount} recorded delivery attempts.`,
    });
  }

  const delayMs = projectedDelayMs(delivery);
  if (delayMs !== null) {
    evidence.push({
      kind: "projectedDelay",
      sentence: `${label} has a projected ETA ${formatDuration(delayMs)} beyond its scheduled window.`,
    });
  }

  if (riskLevel === "MEDIUM" || riskLevel === "HIGH") {
    evidence.push({
      kind: "risk",
      sentence: `${label} is currently assessed at ${riskLevel.toLowerCase()} risk.`,
    });
  }

  return evidence;
}

export type WhatHappened = {
  statements: string[];
  hasDisruption: boolean;
};

export function buildWhatHappened(input: LoadImpactInput): WhatHappened {
  const statements = [...input.deliveries]
    .sort((left, right) => left.stopNumber - right.stopNumber)
    .flatMap((delivery) => {
      const evidence = collectDeliveryEvidence(
        delivery,
        input.assignmentsByDeliveryId.get(delivery.id) ?? [],
        input.eventsByDeliveryId.get(delivery.id) ?? [],
        input.riskByDeliveryId.get(delivery.id)?.riskLevel ?? null,
      );
      return evidence.map((item) => item.sentence);
    });

  return { statements, hasDisruption: statements.length > 0 };
}

export type DownstreamImpactState = "current" | "projected" | "resolved";

export type DownstreamImpactEntry = {
  deliveryId: string;
  label: string;
  stopNumber: number;
  customer: string | null;
  status: string;
  riskLevel: ChainRiskLevel;
  truck: string | null;
  driver: string | null;
  etaLabel: string | null;
  projectedDelayLabel: string | null;
  state: DownstreamImpactState;
  reasons: string[];
};

export type DownstreamImpact = {
  entries: DownstreamImpactEntry[];
};

const propagatingKinds = new Set<DeliveryEvidenceKind>([
  "failed",
  "projectedDelay",
  "risk",
]);

const ownImpactKinds = new Set<DeliveryEvidenceKind>([
  "reassigned",
  "manualEnd",
  "exception",
  "projectedDelay",
  "risk",
]);

function deliveryLabel(delivery: ChainDeliveryInput) {
  return delivery.reference ?? `Stop ${delivery.stopNumber}`;
}

export function buildDownstreamImpact(
  input: LoadImpactInput,
): DownstreamImpact {
  const orderedDeliveries = [...input.deliveries].sort(
    (left, right) => left.stopNumber - right.stopNumber,
  );

  const evidenceByDeliveryId = new Map(
    orderedDeliveries.map((delivery) => [
      delivery.id,
      collectDeliveryEvidence(
        delivery,
        input.assignmentsByDeliveryId.get(delivery.id) ?? [],
        input.eventsByDeliveryId.get(delivery.id) ?? [],
        input.riskByDeliveryId.get(delivery.id)?.riskLevel ?? null,
      ),
    ]),
  );

  const impacts = new Map<
    string,
    { delivery: ChainDeliveryInput; reasons: string[]; current: boolean }
  >();

  for (const source of orderedDeliveries) {
    if (terminalStatuses.has(source.status) && source.status !== "FAILED") {
      continue;
    }
    const sourceEvidence = evidenceByDeliveryId.get(source.id) ?? [];
    const propagating = sourceEvidence.filter((item) =>
      propagatingKinds.has(item.kind),
    );
    if (propagating.length === 0) continue;

    const sourceSummary = propagating[0].sentence;
    const sourceAssignment = activeAssignment(
      input.assignmentsByDeliveryId.get(source.id) ?? [],
    );

    for (const target of orderedDeliveries) {
      if (target.stopNumber <= source.stopNumber) continue;

      const targetAssignments =
        input.assignmentsByDeliveryId.get(target.id) ?? [];
      const targetActive = activeAssignment(targetAssignments);
      const sharedTruck =
        sourceAssignment &&
        targetActive &&
        sourceAssignment.truckId === targetActive.truckId
          ? sourceAssignment.truck.unitNumber
          : null;
      const sharedDriver =
        sourceAssignment &&
        targetActive &&
        sourceAssignment.driverId === targetActive.driverId
          ? sourceAssignment.driver.name
          : null;

      const reasons = [
        `Later stop on the same load route after ${deliveryLabel(source)} (stop ${source.stopNumber}); ${sourceSummary}`,
      ];
      if (sharedTruck) {
        reasons.push(
          `Shares truck ${sharedTruck} with ${deliveryLabel(source)}'s active assignment.`,
        );
      }
      if (sharedDriver) {
        reasons.push(
          `Shares driver ${sharedDriver} with ${deliveryLabel(source)}'s active assignment.`,
        );
      }

      const targetEvidence = evidenceByDeliveryId.get(target.id) ?? [];
      const hasOwnImpact = targetEvidence.some((item) =>
        ownImpactKinds.has(item.kind),
      );
      const isCurrent =
        hasOwnImpact || sharedTruck !== null || sharedDriver !== null;

      const existing = impacts.get(target.id);
      if (existing) {
        existing.reasons.push(...reasons);
        existing.current = existing.current || isCurrent;
        continue;
      }

      impacts.set(target.id, {
        delivery: target,
        reasons,
        current: isCurrent,
      });
    }
  }

  const stateOrder: Record<DownstreamImpactState, number> = {
    current: 0,
    projected: 1,
    resolved: 2,
  };

  const entries: DownstreamImpactEntry[] = [...impacts.values()]
    .map(({ delivery, reasons, current }) => {
      const targetAssignments =
        input.assignmentsByDeliveryId.get(delivery.id) ?? [];
      const active = activeAssignment(targetAssignments);
      const riskLevel =
        input.riskByDeliveryId.get(delivery.id)?.riskLevel ?? null;
      const state: DownstreamImpactState = terminalStatuses.has(
        delivery.status,
      )
        ? "resolved"
        : current
          ? "current"
          : "projected";
      const delayMs = projectedDelayMs(delivery);
      return {
        deliveryId: delivery.id,
        label: deliveryLabel(delivery),
        stopNumber: delivery.stopNumber,
        customer: delivery.recipientName ?? input.loadCustomerName,
        status: delivery.status,
        riskLevel,
        truck: active?.truck.unitNumber ?? null,
        driver: active?.driver.name ?? null,
        etaLabel: delivery.eta
          ? formatDateTime(delivery.eta, input.timezone)
          : null,
        projectedDelayLabel:
          delayMs !== null
            ? `Projected ${formatDuration(delayMs)} beyond scheduled window`
            : null,
        state,
        reasons,
      };
    })
    .sort(
      (left, right) =>
        stateOrder[left.state] - stateOrder[right.state] ||
        left.stopNumber - right.stopNumber,
    );

  return { entries };
}
