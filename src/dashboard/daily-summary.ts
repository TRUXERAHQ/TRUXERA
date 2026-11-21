import {
  formatDateTime,
  type ChainDeliveryInput,
  type ChainRiskLevel,
  type ImpactEventInput,
} from "./delivery-chain.ts";
import {
  buildRecoveryResult,
  type RecoveryOutcome,
  type RecoveryResult,
} from "./recovery-result.ts";
import {
  buildMeasureImpact,
  type ImpactMetric,
  type MeasureImpact,
} from "./measure-impact.ts";
import type { DownstreamImpactEntry } from "./load-impact.ts";
import type { AssignmentReportAssignment } from "./assignment-report.ts";

export type DailyDeliveryInput = {
  delivery: ChainDeliveryInput & {
    id: string;
    loadId: string;
    loadReference: string;
    customerName: string | null;
    createdAt: Date | null;
    deliveryWindowStart: Date | null;
    deliveryWindowEnd: Date | null;
  };
  assignments: AssignmentReportAssignment[];
  events: ImpactEventInput[];
  riskLevel: ChainRiskLevel;
  projectedDelay: boolean;
  downstreamEntries: DownstreamImpactEntry[];
};

export type AggregatedImpactMetric = {
  key: string;
  label: string;
  state: "actual" | "estimated" | "insufficient";
  display: string;
  coverage: string | null;
  total: number | null;
  unit: string | null;
};

export type DailyDeliveryRow = {
  deliveryId: string;
  loadId: string;
  label: string;
  loadReference: string;
  stopNumber: number;
  status: string;
  riskLevel: ChainRiskLevel;
  recoveryState: RecoveryOutcome | "none" | "insufficientData";
  impactState: "measured" | "insufficient" | "notApplicable";
  currentAssignmentLabel: string | null;
  attention: boolean;
};

export type DailyOperationsSummary = {
  date: string;
  dateLabel: string;
  timezone: string;
  timezoneAvailable: boolean;
  dayStart: Date;
  dayEnd: Date;
  scopeCount: number;
  snapshot: {
    completed: number;
    currentlyAssigned: number;
    cancelled: number;
    failed: number;
    withRecoveryAction: number;
    withoutRecoveryAction: number;
  };
  riskSummary: {
    low: number;
    medium: number;
    high: number;
    unassessed: number;
    failed: number;
    cancelled: number;
    projectedDelay: number;
  };
  recovery: {
    actionsExecuted: number;
    deliveriesWithRecovery: number;
    outcomes: Record<RecoveryOutcome, number>;
    noAction: number;
  };
  assignmentActivity: {
    assignmentsCreated: number;
    transitions: number;
    deliveriesWithChanges: number;
    truckChanges: number;
    driverChanges: number;
    truckAndDriverChanges: number;
    reRecords: number;
    unchanged: number;
  };
  impact: { metrics: AggregatedImpactMetric[] };
  outcomes: {
    successful: string[];
    monitoring: string[];
    unresolved: string[];
    insufficientData: string[];
    noRecoveryAction: string[];
  };
  downstreamAffected: {
    label: string;
    state: string;
    sourceLabels: string[];
  }[];
  events: {
    timeLabel: string | null;
    deliveryLabel: string;
    kind: string;
    description: string;
  }[];
  deliveries: DailyDeliveryRow[];
  narrative: string;
};

const reassignmentPrefix = "Reassigned from truck ";

function inDay(value: Date | null, start: Date, end: Date) {
  return value !== null && value.getTime() >= start.getTime() && value.getTime() < end.getTime();
}

function dayParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function zonedMidnightUtc(
  year: number,
  month: number,
  day: number,
  timezone: string,
): Date | null {
  try {
    return zonedMidnightUtcUnsafe(year, month, day, timezone);
  } catch {
    return null;
  }
}

function zonedMidnightUtcUnsafe(
  year: number,
  month: number,
  day: number,
  timezone: string,
): Date | null {
  const target = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  let utc = target;
  for (let i = 0; i < 4; i += 1) {
    const parts = formatter.formatToParts(new Date(utc));
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const hour = get("hour") === 24 ? 0 : get("hour");
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      hour,
      get("minute"),
      get("second"),
    );
    const offset = asUtc - utc;
    const next = target - offset;
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc);
}

export function operationalDayBounds(
  date: string,
  timezone: string,
): { start: Date; end: Date } | null {
  const parts = dayParts(date);
  if (!parts) return null;
  const start = zonedMidnightUtc(parts.year, parts.month, parts.day, timezone);
  if (!start || Number.isNaN(start.getTime())) return null;
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + 86400000);
  const end = zonedMidnightUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    timezone,
  );
  if (!end || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

export function operationalDayStart(
  date: string,
  timezone: string,
): Date | null {
  const parts = dayParts(date);
  if (!parts) return null;
  const start = zonedMidnightUtc(parts.year, parts.month, parts.day, timezone);
  return start && !Number.isNaN(start.getTime()) ? start : null;
}

export function addDaysToDateString(date: string, days: number): string | null {
  const parts = dayParts(date);
  if (!parts) return null;
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return shifted.toISOString().slice(0, 10);
}

function deliveryLabel(delivery: { reference: string | null; stopNumber: number }) {
  return delivery.reference ?? `Stop ${delivery.stopNumber}`;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function eventKind(event: ImpactEventInput): string {
  if (event.type === "STATUS_CHANGED") {
    if (event.toStatus === "DELIVERED") return "Delivery completed";
    if (event.toStatus === "FAILED") return "Delivery failed";
    if (event.toStatus === "CANCELLED") return "Delivery cancelled";
    return "Status change";
  }
  if (event.type === "ASSIGNMENT_CHANGED") {
    return event.note?.startsWith(reassignmentPrefix)
      ? "Recovery reassignment"
      : "Assignment changed";
  }
  if (event.type === "EXCEPTION_REPORTED") return "Exception reported";
  if (event.type === "ETA_UPDATED") return "ETA updated";
  return humanize(event.type);
}

export type PreparedDelivery = {
  input: DailyDeliveryInput;
  label: string;
  recovery: RecoveryResult;
  impact: MeasureImpact;
};

function aggregateMetric(
  key: string,
  label: string,
  metrics: ImpactMetric[],
  measurableCount: number,
): AggregatedImpactMetric {
  const calculated = metrics.filter(
    (metric) => metric.state !== "insufficient" && metric.numericValue !== null,
  );
  if (calculated.length === 0) {
    return {
      key,
      label,
      state: "insufficient",
      display: "Insufficient data",
      coverage: null,
      total: null,
      unit: null,
    };
  }
  const units = new Set(calculated.map((metric) => metric.unit));
  if (units.size !== 1) {
    return {
      key,
      label,
      state: "insufficient",
      display: "Insufficient data",
      coverage: "Recorded values use mixed units and cannot be aggregated.",
      total: null,
      unit: null,
    };
  }
  const unit = calculated[0].unit ?? "";
  const total = calculated.reduce(
    (sum, metric) => sum + (metric.numericValue ?? 0),
    0,
  );
  const allActual = calculated.every((metric) => metric.state === "actual");
  const rounded =
    unit === "min"
      ? Math.round(total)
      : Math.round(total * 10) / 10;
  const display = unit
    ? `${rounded.toLocaleString()} ${unit}`
    : rounded.toLocaleString();
  const partial = measurableCount - calculated.length;
  return {
    key,
    label,
    state: allActual ? "actual" : "estimated",
    display,
    coverage:
      partial > 0
        ? `${calculated.length} of ${measurableCount} recovered deliveries measurable.`
        : null,
    total,
    unit,
  };
}

export function buildDailyOperationsSummary(input: {
  date: string;
  timezone: string;
  deliveries: DailyDeliveryInput[];
}): DailyOperationsSummary {
  const bounds = operationalDayBounds(input.date, input.timezone);
  const timezoneAvailable = bounds !== null;
  const fallbackStart = new Date(`${input.date}T00:00:00.000Z`);
  const fallbackEnd = new Date(fallbackStart.getTime() + 86400000);
  const start = bounds?.start ?? fallbackStart;
  const end = bounds?.end ?? fallbackEnd;
  const dateLabel = (() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${input.date}T00:00:00.000Z`));
    } catch {
      return input.date;
    }
  })();

  const prepared = prepareDailyDeliveries(input.deliveries, input.timezone);
  const activity = collectDayActivity(prepared, start, end, input.timezone);
  const scoped = activity.scoped;
  const {
    snapshot,
    riskSummary,
    outcomes,
    outcomeCounts,
    deliveryRows,
    downstreamAffected,
    impactMetrics,
  } = summarizeScopedDeliveries(scoped, prepared);
  const events = activity.events
    .sort((left, right) => (left.time ?? Infinity) - (right.time ?? Infinity))
    .map((event) => ({
      timeLabel: event.timeLabel,
      deliveryLabel: event.deliveryLabel,
      kind: event.kind,
      description: event.description,
    }));

  const narrative = buildNarrative({
    dateLabel,
    timezone: input.timezone,
    timezoneAvailable,
    scopeCount: scoped.length,
    snapshot,
    outcomes,
    outcomeCounts,
    reassignmentsInDay: activity.reassignmentsInDay,
    assignmentStats: activity.assignmentStats,
    impactMetrics,
    downstreamCount: downstreamAffected.length,
  });

  return {
    date: input.date,
    dateLabel,
    timezone: input.timezone,
    timezoneAvailable,
    dayStart: start,
    dayEnd: end,
    scopeCount: scoped.length,
    snapshot,
    riskSummary,
    recovery: {
      actionsExecuted: activity.reassignmentsInDay,
      deliveriesWithRecovery: scoped.filter((item) => item.recovery.hasRecovery).length,
      outcomes: outcomeCounts,
      noAction: scoped.filter((item) => !item.recovery.hasRecovery).length,
    },
    assignmentActivity: activity.assignmentStats,
    impact: { metrics: impactMetrics },
    outcomes,
    downstreamAffected,
    events,
    deliveries: deliveryRows,
    narrative,
  };
}

function buildNarrative(parts: {
  dateLabel: string;
  timezone: string;
  timezoneAvailable: boolean;
  scopeCount: number;
  snapshot: DailyOperationsSummary["snapshot"];
  outcomes: DailyOperationsSummary["outcomes"];
  outcomeCounts: Record<RecoveryOutcome, number>;
  reassignmentsInDay: number;
  assignmentStats: DailyOperationsSummary["assignmentActivity"];
  impactMetrics: AggregatedImpactMetric[];
  downstreamCount: number;
}) {
  const lines: string[] = [];
  if (parts.scopeCount === 0) {
    lines.push(
      `No deliveries with recorded activity appear in the operational day of ${parts.dateLabel}${parts.timezoneAvailable ? ` (${parts.timezone})` : ""}.`,
    );
    return lines.join(" ");
  }
  lines.push(
    `${parts.scopeCount} ${parts.scopeCount === 1 ? "delivery was" : "deliveries were"} in scope on ${parts.dateLabel}.`,
  );
  if (parts.reassignmentsInDay > 0) {
    lines.push(
      `${parts.reassignmentsInDay} reassignment ${parts.reassignmentsInDay === 1 ? "action was" : "actions were"} recorded during the day across ${parts.snapshot.withRecoveryAction} ${parts.snapshot.withRecoveryAction === 1 ? "delivery" : "deliveries"} with recovery history.`,
    );
  }
  const outcomeBits = (
    [
      ["successful", "operating normally"],
      ["monitoring", "under monitoring"],
      ["unresolved", "unresolved"],
      ["insufficientData", "with insufficient outcome data"],
    ] as const
  )
    .filter(([key]) => parts.outcomeCounts[key] > 0)
    .map(([key, phrase]) => `${parts.outcomeCounts[key]} ${phrase}`);
  if (outcomeBits.length > 0) {
    lines.push(`Recovery outcomes: ${outcomeBits.join(", ")}.`);
  }
  if (parts.snapshot.withoutRecoveryAction > 0) {
    lines.push(
      `${parts.snapshot.withoutRecoveryAction} ${parts.snapshot.withoutRecoveryAction === 1 ? "delivery had" : "deliveries had"} no recorded recovery action.`,
    );
  }
  if (parts.assignmentStats.transitions > 0) {
    lines.push(
      `${parts.assignmentStats.transitions} assignment ${parts.assignmentStats.transitions === 1 ? "change was" : "changes were"} recorded during the day.`,
    );
  }
  const measured = parts.impactMetrics.filter(
    (metric) => metric.state !== "insufficient",
  );
  if (measured.length === 0) {
    lines.push(
      "Measured impact remains insufficient where required source data was not recorded.",
    );
  } else {
    lines.push(
      `Measured impact: ${measured.map((metric) => `${metric.label.toLowerCase()} ${metric.display}`).join("; ")}.`,
    );
  }
  if (parts.downstreamCount > 0) {
    lines.push(
      `${parts.downstreamCount} downstream ${parts.downstreamCount === 1 ? "delivery was" : "deliveries were"} recorded as affected.`,
    );
  }
  return lines.join(" ");
}

export function prepareDailyDeliveries(
  deliveries: DailyDeliveryInput[],
  timezone: string,
): PreparedDelivery[] {
  return deliveries.map((item) => {
    const recovery = buildRecoveryResult({
      delivery: {
        id: item.delivery.id,
        reference: item.delivery.reference,
        stopNumber: item.delivery.stopNumber,
        status: item.delivery.status,
        eta: item.delivery.eta,
      },
      assignments: item.assignments,
      events: item.events,
      riskLevel: item.riskLevel,
      timezone,
    });
    const impact = buildMeasureImpact({
      recovery,
      delivery: {
        id: item.delivery.id,
        reference: item.delivery.reference,
        stopNumber: item.delivery.stopNumber,
        status: item.delivery.status,
        eta: item.delivery.eta,
        deliveredAt: item.delivery.deliveredAt,
        deliveryWindowStart: item.delivery.deliveryWindowStart,
        deliveryWindowEnd: item.delivery.deliveryWindowEnd,
      },
      downstreamEntries: item.downstreamEntries,
      beforeEta: null,
      mileage: null,
      fuel: null,
      labor: null,
      timezone,
    });
    return {
      input: item,
      label: deliveryLabel(item.delivery),
      recovery,
      impact,
    };
  });
}

export function deliveryHasRecordedActivity(
  item: DailyDeliveryInput,
  start: Date,
  end: Date,
) {
  return (
    inDay(item.delivery.createdAt, start, end) ||
    inDay(item.delivery.deliveredAt, start, end) ||
    item.events.some((event) => inDay(event.occurredAt, start, end)) ||
    item.assignments.some(
      (assignment) =>
        inDay(assignment.assignedAt, start, end) ||
        inDay(assignment.endedAt, start, end),
    )
  );
}

export type DayActivity = {
  scoped: PreparedDelivery[];
  assignmentStats: {
    assignmentsCreated: number;
    transitions: number;
    deliveriesWithChanges: number;
    truckChanges: number;
    driverChanges: number;
    truckAndDriverChanges: number;
    reRecords: number;
    unchanged: number;
  };
  changedDeliveryIds: Set<string>;
  reassignmentsInDay: number;
  events: {
    time: number | null;
    timeLabel: string | null;
    deliveryLabel: string;
    kind: string;
    description: string;
  }[];
};

export function collectDayActivity(
  prepared: PreparedDelivery[],
  start: Date,
  end: Date,
  timezone: string,
): DayActivity {
  const scoped = prepared.filter((item) =>
    deliveryHasRecordedActivity(item.input, start, end),
  );

  const assignmentStats = {
    assignmentsCreated: 0,
    transitions: 0,
    deliveriesWithChanges: 0,
    truckChanges: 0,
    driverChanges: 0,
    truckAndDriverChanges: 0,
    reRecords: 0,
    unchanged: 0,
  };
  const changedDeliveryIds = new Set<string>();
  let reassignmentsInDay = 0;
  const events: DayActivity["events"] = [];

  for (const item of scoped) {
    const { delivery, assignments } = item.input;
    const sorted = [...assignments].sort(
      (left, right) => left.assignedAt.getTime() - right.assignedAt.getTime(),
    );

    for (const assignment of sorted) {
      if (inDay(assignment.assignedAt, start, end)) {
        assignmentStats.assignmentsCreated += 1;
      }
      const endedAt = assignment.endedAt;
      if (endedAt !== null && inDay(endedAt, start, end)) {
        assignmentStats.transitions += 1;
        const index = sorted.indexOf(assignment);
        const successor = sorted[index + 1];
        if (successor) {
          const truckChanged = successor.truckId !== assignment.truckId;
          const driverChanged = successor.driverId !== assignment.driverId;
          if (truckChanged && driverChanged) {
            assignmentStats.truckAndDriverChanges += 1;
          } else if (truckChanged) {
            assignmentStats.truckChanges += 1;
          } else if (driverChanged) {
            assignmentStats.driverChanges += 1;
          } else {
            assignmentStats.reRecords += 1;
          }
        }
        if (assignment.endReason?.startsWith(reassignmentPrefix)) {
          reassignmentsInDay += 1;
          events.push({
            time: endedAt.getTime(),
            timeLabel: formatDateTime(endedAt, timezone),
            deliveryLabel: item.label,
            kind: "Recovery reassignment",
            description: `Assignment ended and successor recorded (${assignment.endReason}).`,
          });
        } else {
          events.push({
            time: endedAt.getTime(),
            timeLabel: formatDateTime(endedAt, timezone),
            deliveryLabel: item.label,
            kind: "Assignment ended",
            description: assignment.endReason ?? "Assignment ended.",
          });
        }
      }
    }

    const changedToday = sorted.some((assignment) =>
      inDay(assignment.endedAt, start, end),
    );
    if (changedToday) {
      assignmentStats.deliveriesWithChanges += 1;
      changedDeliveryIds.add(item.input.delivery.id);
    }

    const activeAssignment = sorted.find(
      (assignment) => assignment.endedAt === null,
    );
    if (activeAssignment && !changedToday) {
      assignmentStats.unchanged += 1;
    }

    for (const event of item.input.events) {
      if (!inDay(event.occurredAt, start, end)) continue;
      events.push({
        time: event.occurredAt.getTime(),
        timeLabel: formatDateTime(event.occurredAt, timezone),
        deliveryLabel: item.label,
        kind: eventKind(event),
        description: event.note ?? eventKind(event),
      });
    }

    if (item.input.riskLevel === "HIGH" || item.input.riskLevel === "MEDIUM") {
      events.push({
        time: null,
        timeLabel: null,
        deliveryLabel: item.label,
        kind: `Current ${item.input.riskLevel.toLowerCase()} risk`,
        description: `Currently assessed ${item.input.riskLevel.toLowerCase()} risk.`,
      });
    }
    if (item.input.projectedDelay) {
      events.push({
        time: null,
        timeLabel: null,
        deliveryLabel: item.label,
        kind: "Projected delay",
        description: "Current ETA projects beyond the delivery window.",
      });
    }
    if (
      (delivery.status === "FAILED" || delivery.status === "CANCELLED") &&
      !item.input.events.some(
        (event) =>
          inDay(event.occurredAt, start, end) &&
          event.type === "STATUS_CHANGED" &&
          event.toStatus === delivery.status,
      )
    ) {
      events.push({
        time: null,
        timeLabel: null,
        deliveryLabel: item.label,
        kind:
          delivery.status === "FAILED"
            ? "Currently failed"
            : "Currently cancelled",
        description: `Delivery is currently ${humanize(delivery.status).toLowerCase()}.`,
      });
    }
  }

  return {
    scoped,
    assignmentStats,
    changedDeliveryIds,
    reassignmentsInDay,
    events,
  };
}

export type ScopedSummary = {
  snapshot: DailyOperationsSummary["snapshot"];
  riskSummary: DailyOperationsSummary["riskSummary"];
  outcomes: DailyOperationsSummary["outcomes"];
  outcomeCounts: Record<RecoveryOutcome, number>;
  deliveryRows: DailyDeliveryRow[];
  downstreamAffected: DailyOperationsSummary["downstreamAffected"];
  impactMetrics: AggregatedImpactMetric[];
};

export function summarizeScopedDeliveries(
  scoped: PreparedDelivery[],
  allPrepared: PreparedDelivery[],
): ScopedSummary {
  const outcomes = {
    successful: [] as string[],
    monitoring: [] as string[],
    unresolved: [] as string[],
    insufficientData: [] as string[],
    noRecoveryAction: [] as string[],
  };
  const outcomeCounts: Record<RecoveryOutcome, number> = {
    successful: 0,
    monitoring: 0,
    unresolved: 0,
    insufficientData: 0,
  };

  for (const item of scoped) {
    if (item.recovery.hasRecovery && item.recovery.recovery) {
      const outcome = item.recovery.recovery.outcome;
      outcomeCounts[outcome] += 1;
      const bucket =
        outcome === "successful"
          ? outcomes.successful
          : outcome === "monitoring"
            ? outcomes.monitoring
            : outcome === "unresolved"
              ? outcomes.unresolved
              : outcomes.insufficientData;
      bucket.push(item.label);
    } else {
      outcomes.noRecoveryAction.push(item.label);
    }
  }

  const scopedIds = new Set(scoped.map((item) => item.input.delivery.id));
  const labelById = new Map(
    allPrepared.map((item) => [item.input.delivery.id, item.label]),
  );
  const downstreamAffected = new Map<
    string,
    { label: string; state: string; sourceLabels: string[] }
  >();

  for (const item of scoped) {
    for (const entry of item.input.downstreamEntries) {
      const touchesScope =
        scopedIds.has(entry.deliveryId) ||
        entry.sourceDeliveryIds.some((id) => scopedIds.has(id));
      if (!touchesScope) continue;
      const existing = downstreamAffected.get(entry.deliveryId);
      const sourceLabels = entry.sourceDeliveryIds.map(
        (id) => labelById.get(id) ?? "Unknown delivery",
      );
      if (existing) {
        existing.sourceLabels = [
          ...new Set([...existing.sourceLabels, ...sourceLabels]),
        ];
      } else {
        downstreamAffected.set(entry.deliveryId, {
          label: entry.label,
          state: entry.state,
          sourceLabels,
        });
      }
    }
  }

  const recoveredScoped = scoped.filter((item) => item.recovery.hasRecovery);
  const metricKeys: { key: string; label: string }[] = [];
  for (const item of recoveredScoped) {
    for (const metric of item.impact.metrics) {
      if (!metricKeys.some((entry) => entry.key === metric.key)) {
        metricKeys.push({ key: metric.key, label: metric.label });
      }
    }
  }
  const impactMetrics = metricKeys.map(({ key, label }) =>
    aggregateMetric(
      key,
      label,
      recoveredScoped.map(
        (item) => item.impact.metrics.find((metric) => metric.key === key)!,
      ),
      recoveredScoped.length,
    ),
  );

  const snapshot = {
    completed: scoped.filter((item) => item.input.delivery.status === "DELIVERED").length,
    currentlyAssigned: scoped.filter((item) =>
      [...item.input.assignments].some((assignment) => assignment.endedAt === null),
    ).length,
    cancelled: scoped.filter((item) => item.input.delivery.status === "CANCELLED").length,
    failed: scoped.filter((item) => item.input.delivery.status === "FAILED").length,
    withRecoveryAction: scoped.filter((item) => item.recovery.hasRecovery).length,
    withoutRecoveryAction: scoped.filter((item) => !item.recovery.hasRecovery).length,
  };
  const riskSummary = {
    low: scoped.filter((item) => item.input.riskLevel === "LOW").length,
    medium: scoped.filter((item) => item.input.riskLevel === "MEDIUM").length,
    high: scoped.filter((item) => item.input.riskLevel === "HIGH").length,
    unassessed: scoped.filter((item) => item.input.riskLevel === null).length,
    failed: snapshot.failed,
    cancelled: snapshot.cancelled,
    projectedDelay: scoped.filter((item) => item.input.projectedDelay).length,
  };

  const deliveryRows: DailyDeliveryRow[] = scoped.map((item) => {
    const active = [...item.input.assignments]
      .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())
      .find((assignment) => assignment.endedAt === null);
    const impactStates = item.impact.metrics.map((metric) => metric.state);
    const impactState: DailyDeliveryRow["impactState"] = !item.recovery.hasRecovery
      ? "notApplicable"
      : impactStates.every((state) => state === "insufficient")
        ? "insufficient"
        : "measured";
    return {
      deliveryId: item.input.delivery.id,
      loadId: item.input.delivery.loadId,
      label: item.label,
      loadReference: item.input.delivery.loadReference,
      stopNumber: item.input.delivery.stopNumber,
      status: item.input.delivery.status,
      riskLevel: item.input.riskLevel,
      recoveryState: item.recovery.hasRecovery
        ? (item.recovery.recovery?.outcome ?? "insufficientData")
        : "none",
      impactState,
      currentAssignmentLabel: active
        ? `${active.truck.unitNumber} · ${active.driver.name}`
        : null,
      attention:
        item.input.riskLevel === "HIGH" ||
        item.input.riskLevel === "MEDIUM" ||
        item.input.delivery.status === "FAILED" ||
        (item.recovery.hasRecovery &&
          (item.recovery.recovery?.outcome === "unresolved" ||
            item.recovery.recovery?.outcome === "insufficientData")),
    };
  });

  return {
    snapshot,
    riskSummary,
    outcomes,
    outcomeCounts,
    deliveryRows,
    downstreamAffected: [...downstreamAffected.values()],
    impactMetrics,
  };
}
