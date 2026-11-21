export type ChainRiskLevel = "LOW" | "MEDIUM" | "HIGH" | null;

export type ChainDeliveryInput = {
  id: string;
  reference: string | null;
  stopNumber: number;
  recipientName: string | null;
  status: string;
  eta: Date | null;
  deliveryWindowEnd: Date | null;
  deliveredAt: Date | null;
};

export type ChainNode = {
  id: string;
  label: string;
  stopNumber: number;
  customer: string | null;
  status: string;
  riskLevel: ChainRiskLevel;
  etaLabel: string | null;
  projectedDelayLabel: string | null;
  truckLabel: string | null;
  attention: boolean;
  inProgress: boolean;
};

const activeWorkStatuses = new Set([
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
]);

export function formatDateTime(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
}

export function formatDuration(ms: number) {
  const totalMinutes = Math.round(Math.abs(ms) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function buildDeliveryChain(input: {
  deliveries: ChainDeliveryInput[];
  loadCustomerName: string;
  riskByDeliveryId: Map<string, { riskLevel: ChainRiskLevel }>;
  activeAssignmentByDeliveryId: Map<
    string,
    { truckUnitNumber: string; driverName: string }
  >;
  timezone: string;
}): ChainNode[] {
  return [...input.deliveries]
    .sort((left, right) => left.stopNumber - right.stopNumber)
    .map((delivery) => {
      const risk = input.riskByDeliveryId.get(delivery.id);
      const riskLevel = risk?.riskLevel ?? null;
      const assignment = input.activeAssignmentByDeliveryId.get(delivery.id);
      const inProgress =
        activeWorkStatuses.has(delivery.status) && assignment !== undefined;
      const attention =
        riskLevel === "HIGH" ||
        riskLevel === "MEDIUM" ||
        delivery.status === "FAILED";

      let projectedDelayLabel: string | null = null;
      if (delivery.eta && delivery.deliveryWindowEnd) {
        const delta = delivery.eta.getTime() - delivery.deliveryWindowEnd.getTime();
        projectedDelayLabel =
          delta > 0
            ? `Projected ${formatDuration(delta)} beyond scheduled window`
            : delta < 0
              ? `Projected ${formatDuration(delta)} inside scheduled window`
              : "Projected within scheduled window";
      }

      return {
        id: delivery.id,
        label: delivery.reference ?? `Stop ${delivery.stopNumber}`,
        stopNumber: delivery.stopNumber,
        customer: delivery.recipientName ?? input.loadCustomerName,
        status: delivery.status,
        riskLevel,
        etaLabel: delivery.eta
          ? formatDateTime(delivery.eta, input.timezone)
          : null,
        projectedDelayLabel,
        truckLabel: assignment
          ? `${assignment.truckUnitNumber} · ${assignment.driverName}`
          : null,
        attention,
        inProgress,
      };
    });
}

export type ImpactEventInput = {
  type: string;
  fromStatus?: string | null;
  toStatus: string | null;
  note: string | null;
  occurredAt: Date;
};

export type ImpactAssignmentInput = {
  truck: { unitNumber: string };
  driver: { name: string };
  assignedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
};

export type ImpactStage = {
  key: "before" | "disruption" | "recovery" | "after";
  title: string;
  lines: string[];
  tone: "neutral" | "warning" | "positive" | "muted";
};

export type RecoveryImpact = {
  stages: ImpactStage[];
  hasDisruption: boolean;
  outcomeLabel: string;
};

export function buildRecoveryImpact(input: {
  delivery: {
    status: string;
    eta: Date | null;
    deliveredAt: Date | null;
  };
  events: ImpactEventInput[];
  assignments: ImpactAssignmentInput[];
  riskLevel: ChainRiskLevel;
  timezone: string;
}): RecoveryImpact {
  const { delivery, events, assignments, riskLevel, timezone } = input;
  const orderedAssignments = [...assignments].sort(
    (left, right) => left.assignedAt.getTime() - right.assignedAt.getTime(),
  );
  const firstAssignment = orderedAssignments[0];
  const activeAssignment = orderedAssignments.find(
    (assignment) => assignment.endedAt === null,
  );
  const reassignments = orderedAssignments.filter((assignment) =>
    assignment.endReason?.startsWith("Reassigned from "),
  );

  const disruptionLines: string[] = [];
  const failedEvent = events.find(
    (event) => event.type === "STATUS_CHANGED" && event.toStatus === "FAILED",
  );
  if (failedEvent) {
    disruptionLines.push(
      `Delivery marked failed · ${formatDateTime(failedEvent.occurredAt, timezone)}`,
    );
  }
  const endedCount = orderedAssignments.filter(
    (assignment) =>
      assignment.endedAt !== null &&
      !assignment.endReason?.startsWith("Reassigned from "),
  ).length;
  if (endedCount > 0) {
    disruptionLines.push(
      `${endedCount} assignment${endedCount === 1 ? "" : "s"} ended before completion.`,
    );
  }
  if (riskLevel === "HIGH" || riskLevel === "MEDIUM") {
    disruptionLines.push(
      `Current assessed risk: ${riskLevel === "HIGH" ? "high" : "medium"}.`,
    );
  }
  const hasDisruption = disruptionLines.length > 0;

  const beforeLines = firstAssignment
    ? [
        `Truck ${firstAssignment.truck.unitNumber} · ${firstAssignment.driver.name}`,
        `Assigned ${formatDateTime(firstAssignment.assignedAt, timezone)}`,
      ]
    : ["No assignment recorded."];
  if (delivery.eta) {
    beforeLines.push(`Projected ETA ${formatDateTime(delivery.eta, timezone)}`);
  } else {
    beforeLines.push("ETA not recorded.");
  }

  const recoveryLines = reassignments.flatMap((assignment) => [
    assignment.endReason ?? "Reassignment recorded.",
    `Ended ${assignment.endedAt ? formatDateTime(assignment.endedAt, timezone) : "time not recorded"}`,
  ]);
  if (recoveryLines.length === 0) {
    recoveryLines.push("No recovery action recorded.");
  }

  const afterLines: string[] = [];
  if (activeAssignment) {
    afterLines.push(
      `Truck ${activeAssignment.truck.unitNumber} · ${activeAssignment.driver.name}`,
    );
  } else {
    afterLines.push("No active assignment.");
  }
  afterLines.push(
    delivery.status === "DELIVERED" && delivery.deliveredAt
      ? `Completed ${formatDateTime(delivery.deliveredAt, timezone)}`
      : `Status: ${delivery.status.toLowerCase().replaceAll("_", " ")}`,
  );
  if (delivery.eta) {
    afterLines.push(`Projected ETA ${formatDateTime(delivery.eta, timezone)}`);
  } else {
    afterLines.push("ETA not recorded.");
  }

  let outcomeLabel: string;
  if (delivery.status === "DELIVERED" && delivery.deliveredAt && delivery.eta) {
    const delta = delivery.deliveredAt.getTime() - delivery.eta.getTime();
    outcomeLabel =
      delta <= 0
        ? `Completed on or ahead of the projected ETA by ${formatDuration(-delta)}.`
        : `Completed ${formatDuration(delta)} after the projected ETA.`;
  } else if (delivery.eta) {
    outcomeLabel =
      "A projected ETA is recorded; no completion time is available to measure improvement.";
  } else {
    outcomeLabel =
      "ETA is not recorded, so ETA improvement cannot be calculated.";
  }

  return {
    hasDisruption,
    outcomeLabel,
    stages: [
      {
        key: "before",
        title: "Before",
        lines: beforeLines,
        tone: "neutral",
      },
      {
        key: "disruption",
        title: "Disruption",
        lines: hasDisruption ? disruptionLines : ["No disruption recorded."],
        tone: hasDisruption ? "warning" : "muted",
      },
      {
        key: "recovery",
        title: "Recovery",
        lines: recoveryLines,
        tone: reassignments.length > 0 ? "positive" : "muted",
      },
      {
        key: "after",
        title: "After",
        lines: afterLines,
        tone: "neutral",
      },
    ],
  };
}
