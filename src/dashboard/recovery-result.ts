import {
  formatDateTime,
  type ChainDeliveryInput,
  type ChainRiskLevel,
  type ImpactAssignmentInput,
  type ImpactEventInput,
} from "./delivery-chain.ts";

export type RecoveryResultDelivery = Pick<
  ChainDeliveryInput,
  "id" | "reference" | "stopNumber" | "status" | "eta"
>;

export type RecoveryOutcome =
  | "successful"
  | "monitoring"
  | "unresolved"
  | "insufficientData";

export type RecoveryComparisonRow = {
  metric: string;
  before: string;
  after: string;
};

export type RecoveryResult = {
  hasRecovery: boolean;
  recovery: {
    occurredAt: Date;
    dispatcherReason: string | null;
    before: {
      truck: string;
      driver: string;
      status: string;
      etaLabel: string | null;
    };
    action: {
      fromLabel: string;
      toLabel: string;
    };
    after: {
      truck: string | null;
      driver: string | null;
      status: string;
      riskLabel: string | null;
      etaLabel: string | null;
      hasActiveAssignment: boolean;
    };
    outcome: RecoveryOutcome;
    outcomeLabel: string;
    comparison: RecoveryComparisonRow[];
    etaComparisonLabel: string;
    limitations: string[];
  } | null;
};

const reassignmentPrefix = "Reassigned from truck ";
const activeStatuses = new Set(["ASSIGNED", "PICKED_UP", "IN_TRANSIT"]);

function formatStatus(status: string | null) {
  if (!status) return "Not recorded";
  return status.toLowerCase().replaceAll("_", " ");
}

function formatRisk(riskLevel: ChainRiskLevel) {
  if (!riskLevel) return "Insufficient data";
  return `${riskLevel.toLowerCase()} risk`;
}

export function parseReassignmentEndReason(endReason: string) {
  const reasonMatch = /\. Reason: (.*)$/.exec(endReason);
  return {
    dispatcherReason: reasonMatch?.[1]?.trim() || null,
    routeNote: reasonMatch
      ? endReason.slice(0, reasonMatch.index)
      : endReason,
  };
}

function statusAtTime(
  events: ImpactEventInput[],
  at: Date,
): string | null {
  let status: string | null = null;
  for (const event of [...events].sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
  )) {
    if (event.occurredAt.getTime() > at.getTime()) break;
    if (event.toStatus) {
      status = event.toStatus;
    }
  }
  return status;
}

function successorAssignment(
  assignments: ImpactAssignmentInput[],
  recovery: ImpactAssignmentInput,
): ImpactAssignmentInput | null {
  const ordered = [...assignments].sort(
    (left, right) => left.assignedAt.getTime() - right.assignedAt.getTime(),
  );
  const successor = ordered.find(
    (assignment) =>
      assignment !== recovery &&
      assignment.assignedAt.getTime() >= recovery.endedAt!.getTime() - 1000,
  );
  if (successor) return successor;
  return (
    ordered.find((assignment) => assignment.endedAt === null) ??
    ordered[ordered.length - 1] ??
    null
  );
}

function outcomeFor(
  delivery: RecoveryResultDelivery,
  riskLevel: ChainRiskLevel,
): { outcome: RecoveryOutcome; label: string } {
  if (delivery.status === "DELIVERED") {
    return {
      outcome: "successful",
      label: "Recovery successful — the delivery was completed.",
    };
  }
  if (delivery.status === "FAILED") {
    return {
      outcome: "unresolved",
      label:
        "Recovery unresolved — the delivery is recorded as failed.",
    };
  }
  if (delivery.status === "CANCELLED") {
    return {
      outcome: "monitoring",
      label:
        "Recovery executed — monitoring. The delivery was cancelled after the recovery action.",
    };
  }
  if (riskLevel === "HIGH") {
    return {
      outcome: "unresolved",
      label:
        "Recovery unresolved — the delivery still shows a material operational problem.",
    };
  }
  if (riskLevel === "LOW" && activeStatuses.has(delivery.status)) {
    return {
      outcome: "successful",
      label:
        "Recovery successful — the delivery is operating normally.",
    };
  }
  if (riskLevel === "MEDIUM" || riskLevel === null) {
    return {
      outcome: "monitoring",
      label:
        "Recovery executed — monitoring. The current state does not yet confirm a final operational outcome.",
    };
  }
  if (riskLevel === "LOW") {
    return {
      outcome: "successful",
      label:
        "Recovery successful — the delivery is operating normally.",
    };
  }
  return {
    outcome: "insufficientData",
    label:
      "Insufficient data — the recovery outcome cannot be reliably determined.",
  };
}

export function buildRecoveryResult(input: {
  delivery: RecoveryResultDelivery;
  assignments: ImpactAssignmentInput[];
  events: ImpactEventInput[];
  riskLevel: ChainRiskLevel;
  timezone: string;
}): RecoveryResult {
  const { delivery, assignments, events, riskLevel, timezone } = input;
  const reassignments = assignments
    .filter(
      (assignment) =>
        assignment.endedAt !== null &&
        assignment.endReason?.startsWith(reassignmentPrefix),
    )
    .sort(
      (left, right) =>
        (right.endedAt?.getTime() ?? 0) - (left.endedAt?.getTime() ?? 0),
    );
  const recovery = reassignments[0];
  if (!recovery || !recovery.endedAt) {
    return { hasRecovery: false, recovery: null };
  }

  const { dispatcherReason } = parseReassignmentEndReason(
    recovery.endReason ?? "",
  );
  const beforeStatus =
    statusAtTime(events, recovery.endedAt) ?? "PLANNED";
  const after = successorAssignment(assignments, recovery);
  const active = assignments.find(
    (assignment) => assignment.endedAt === null,
  );
  const current = active ?? after;

  const before = {
    truck: recovery.truck.unitNumber,
    driver: recovery.driver.name,
    status: beforeStatus,
    etaLabel: null as string | null,
  };
  const afterState = {
    truck: current?.truck.unitNumber ?? null,
    driver: current?.driver.name ?? null,
    status: delivery.status,
    riskLabel: riskLevel ? formatRisk(riskLevel) : null,
    etaLabel: delivery.eta
      ? formatDateTime(delivery.eta, timezone)
      : null,
    hasActiveAssignment: active !== undefined,
  };

  const outcome = outcomeFor(delivery, riskLevel);
  const limitations = [
    "Risk before the recovery action is not stored; risk is assessed on the current operational state only.",
    "The recommendation shown at the time of recovery is not stored in operational history.",
    "ETA before the recovery action is not recorded; ETA comparison is unavailable.",
  ];

  const comparison: RecoveryComparisonRow[] = [
    {
      metric: "Truck",
      before: before.truck,
      after: afterState.truck ?? "Not recorded",
    },
    {
      metric: "Driver",
      before: before.driver,
      after: afterState.driver ?? "Not recorded",
    },
    {
      metric: "Status",
      before: formatStatus(before.status),
      after: formatStatus(afterState.status),
    },
    {
      metric: "Risk",
      before: "Not recorded",
      after: afterState.riskLabel ?? "Insufficient data",
    },
    {
      metric: "Projected ETA",
      before: "Not recorded",
      after: afterState.etaLabel ?? "Not recorded",
    },
  ];

  return {
    hasRecovery: true,
    recovery: {
      occurredAt: recovery.endedAt,
      dispatcherReason,
      before,
      action: {
        fromLabel: `${before.truck} · ${before.driver}`,
        toLabel: after
          ? `${after.truck.unitNumber} · ${after.driver.name}`
          : "Not recorded",
      },
      after: afterState,
      outcome: outcome.outcome,
      outcomeLabel: outcome.label,
      comparison,
      etaComparisonLabel:
        "ETA comparison unavailable — insufficient data.",
      limitations,
    },
  };
}
