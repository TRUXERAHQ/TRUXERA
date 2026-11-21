import {
  addDaysToDateString,
  collectDayActivity,
  operationalDayBounds,
  operationalDayStart,
  prepareDailyDeliveries,
  summarizeScopedDeliveries,
  type AggregatedImpactMetric,
  type DailyDeliveryInput,
  type DailyDeliveryRow,
  type PreparedDelivery,
  type ScopedSummary,
} from "./daily-summary.ts";
import type { RecoveryOutcome } from "./recovery-result.ts";

export type ReportPeriodKind = "week" | "month";

export type PeriodBounds = {
  kind: ReportPeriodKind;
  startDate: string;
  endDateExclusive: string;
  start: Date;
  end: Date;
  label: string;
};

export type ComparisonRow = {
  label: string;
  current: number;
  previous: number;
  delta: number;
};

export type ImpactComparison = {
  key: string;
  label: string;
  state: "actual" | "estimated" | "insufficient";
  currentDisplay: string;
  previousDisplay: string;
  delta: number | null;
  unit: string | null;
};

export type ExecutiveReport = {
  kind: ReportPeriodKind;
  periodLabel: string;
  previousPeriodLabel: string | null;
  timezone: string;
  timezoneAvailable: boolean;
  periodStart: Date;
  periodEnd: Date;
  scopeCount: number;
  snapshot: ScopedSummary["snapshot"];
  riskSummary: ScopedSummary["riskSummary"];
  recovery: {
    actionsExecuted: number;
    deliveriesWithRecovery: number;
    outcomes: Record<RecoveryOutcome, number>;
    noAction: number;
  };
  outcomes: ScopedSummary["outcomes"];
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
  downstreamAffected: ScopedSummary["downstreamAffected"];
  comparison: {
    available: boolean;
    previousLabel: string | null;
    rows: ComparisonRow[];
    impact: ImpactComparison[];
  };
  events: {
    timeLabel: string | null;
    deliveryLabel: string;
    kind: string;
    description: string;
  }[];
  deliveries: DailyDeliveryRow[];
  recordsWithoutTimestamps: number;
  narrative: string;
};

function isoWeekdayIndex(date: string): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts) return 0;
  const jsDay = new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])),
  ).getUTCDay();
  return (jsDay + 6) % 7;
}

function formatPeriodDate(
  date: string,
  timezone: string,
  withYear = true,
) {
  const start = operationalDayStart(date, timezone);
  if (!start) return date;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" as const } : {}),
      timeZone: timezone,
    }).format(start);
  } catch {
    return date;
  }
}

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function resolvePeriodBounds(
  kind: ReportPeriodKind,
  anchor: string,
  timezone: string,
): PeriodBounds | null {
  let startDate: string | null = null;
  let endDateExclusive: string | null = null;
  let label = "";

  if (kind === "week") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return null;
    const mondayOffset = isoWeekdayIndex(anchor);
    startDate = addDaysToDateString(anchor, -mondayOffset);
    endDateExclusive = addDaysToDateString(anchor, 7 - mondayOffset);
    if (!startDate || !endDateExclusive) return null;
    const lastDay = addDaysToDateString(endDateExclusive, -1);
    if (!lastDay) return null;
    label = `Week: ${formatPeriodDate(startDate, timezone, false)} – ${formatPeriodDate(lastDay, timezone)}`;
  } else {
    const match = /^(\d{4})-(\d{2})$/.exec(anchor);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    startDate = `${anchor}-01`;
    const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    endDateExclusive = next;
    label = `Month: ${formatMonthLabel(year, month)}`;
  }

  const start = operationalDayStart(startDate, timezone);
  const end = operationalDayStart(endDateExclusive, timezone);
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return { kind, startDate, endDateExclusive, start, end, label };
}

export function previousPeriodAnchor(
  kind: ReportPeriodKind,
  anchor: string,
): string | null {
  if (kind === "week") {
    return addDaysToDateString(anchor, -7);
  }
  const match = /^(\d{4})-(\d{2})$/.exec(anchor);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

function periodDates(startDate: string, endDateExclusive: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor < endDateExclusive) {
    dates.push(cursor);
    const next = addDaysToDateString(cursor, 1);
    if (!next) break;
    cursor = next;
  }
  return dates;
}

type PeriodComputation = {
  scopeCount: number;
  actionsExecuted: number;
  outcomes: Record<RecoveryOutcome, number>;
  noAction: number;
  impactMetrics: AggregatedImpactMetric[];
};

function computePeriod(
  bounds: PeriodBounds,
  timezone: string,
  prepared: PreparedDelivery[],
): {
  scoped: PreparedDelivery[];
  activity: ReturnType<typeof collectDayActivity>[];
  summary: ScopedSummary;
  computation: PeriodComputation;
} {
  const scopedById = new Map<string, PreparedDelivery>();
  const activities: ReturnType<typeof collectDayActivity>[] = [];
  for (const date of periodDates(bounds.startDate, bounds.endDateExclusive)) {
    const dayBounds = operationalDayBounds(date, timezone);
    if (!dayBounds) continue;
    const activity = collectDayActivity(
      prepared,
      dayBounds.start,
      dayBounds.end,
      timezone,
    );
    activities.push(activity);
    for (const item of activity.scoped) {
      if (!scopedById.has(item.input.delivery.id)) {
        scopedById.set(item.input.delivery.id, item);
      }
    }
  }
  const scoped = [...scopedById.values()];
  const summary = summarizeScopedDeliveries(scoped, prepared);
  return {
    scoped,
    activity: activities,
    summary,
    computation: {
      scopeCount: scoped.length,
      actionsExecuted: activities.reduce(
        (sum, activity) => sum + activity.reassignmentsInDay,
        0,
      ),
      outcomes: summary.outcomeCounts,
      noAction: summary.snapshot.withoutRecoveryAction,
      impactMetrics: summary.impactMetrics,
    },
  };
}

function buildNarrative(parts: {
  periodLabel: string;
  timezone: string;
  timezoneAvailable: boolean;
  scopeCount: number;
  snapshot: ScopedSummary["snapshot"];
  recovery: ExecutiveReport["recovery"];
  assignmentTransitions: number;
  impactMetrics: AggregatedImpactMetric[];
  downstreamCount: number;
}) {
  const lines: string[] = [];
  if (parts.scopeCount === 0) {
    lines.push(
      `No operational activity was recorded during ${parts.periodLabel}${parts.timezoneAvailable ? ` (${parts.timezone})` : ""}.`,
    );
    return lines.join(" ");
  }
  lines.push(
    `During ${parts.periodLabel}, TRUXERA recorded ${parts.scopeCount} ${parts.scopeCount === 1 ? "delivery" : "deliveries"} in scope.`,
  );
  if (parts.recovery.actionsExecuted > 0) {
    lines.push(
      `${parts.recovery.actionsExecuted} recovery ${parts.recovery.actionsExecuted === 1 ? "action was" : "actions were"} executed, with ${parts.recovery.outcomes.successful} verified successful ${parts.recovery.outcomes.successful === 1 ? "outcome" : "outcomes"}, ${parts.recovery.outcomes.monitoring} under monitoring, and ${parts.recovery.outcomes.unresolved} unresolved.`,
    );
  } else if (parts.snapshot.withRecoveryAction > 0) {
    lines.push(
      `${parts.snapshot.withRecoveryAction} ${parts.snapshot.withRecoveryAction === 1 ? "delivery has" : "deliveries have"} recorded recovery history, with ${parts.recovery.outcomes.successful} verified successful ${parts.recovery.outcomes.successful === 1 ? "outcome" : "outcomes"}.`,
    );
  }
  if (parts.recovery.noAction > 0) {
    lines.push(
      `${parts.recovery.noAction} ${parts.recovery.noAction === 1 ? "delivery had" : "deliveries had"} no recovery action.`,
    );
  }
  if (parts.assignmentTransitions > 0) {
    lines.push(
      `${parts.assignmentTransitions} assignment ${parts.assignmentTransitions === 1 ? "change was" : "changes were"} recorded during the period.`,
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

export function buildExecutiveReport(input: {
  kind: ReportPeriodKind;
  anchor: string;
  timezone: string;
  deliveries: DailyDeliveryInput[];
}): ExecutiveReport {
  const bounds = resolvePeriodBounds(input.kind, input.anchor, input.timezone);
  const timezoneAvailable = bounds !== null;
  const anchorDate =
    input.kind === "month" ? `${input.anchor}-01` : input.anchor.slice(0, 10);
  const fallbackStart =
    operationalDayStart(anchorDate, input.timezone) ??
    new Date(`${anchorDate}T00:00:00.000Z`);
  const fallbackDays = input.kind === "week" ? 7 : 31;
  const fallbackEndDate = addDaysToDateString(anchorDate, fallbackDays);
  const fallbackBounds: PeriodBounds = {
    kind: input.kind,
    startDate: anchorDate,
    endDateExclusive: fallbackEndDate ?? anchorDate,
    start: fallbackStart,
    end: fallbackEndDate
      ? (operationalDayStart(fallbackEndDate, input.timezone) ??
        new Date(fallbackStart.getTime() + fallbackDays * 86400000))
      : new Date(fallbackStart.getTime() + fallbackDays * 86400000),
    label: input.anchor,
  };
  const period = bounds ?? fallbackBounds;

  const previousAnchor = previousPeriodAnchor(input.kind, input.anchor);
  const previousBounds = previousAnchor
    ? resolvePeriodBounds(input.kind, previousAnchor, input.timezone)
    : null;

  const prepared = prepareDailyDeliveries(input.deliveries, input.timezone);
  const current = computePeriod(period, input.timezone, prepared);
  const previous = previousBounds
    ? computePeriod(previousBounds, input.timezone, prepared)
    : null;

  const changedDeliveryIds = new Set<string>();
  let transitions = 0;
  let truckChanges = 0;
  let driverChanges = 0;
  let truckAndDriverChanges = 0;
  let reRecords = 0;
  let assignmentsCreated = 0;
  const timedEvents: {
    time: number;
    timeLabel: string | null;
    deliveryLabel: string;
    kind: string;
    description: string;
  }[] = [];
  const stateEventKeys = new Set<string>();
  const stateEvents: {
    timeLabel: string | null;
    deliveryLabel: string;
    kind: string;
    description: string;
  }[] = [];

  for (const activity of current.activity) {
    for (const id of activity.changedDeliveryIds) changedDeliveryIds.add(id);
    transitions += activity.assignmentStats.transitions;
    truckChanges += activity.assignmentStats.truckChanges;
    driverChanges += activity.assignmentStats.driverChanges;
    truckAndDriverChanges += activity.assignmentStats.truckAndDriverChanges;
    reRecords += activity.assignmentStats.reRecords;
    assignmentsCreated += activity.assignmentStats.assignmentsCreated;
    for (const event of activity.events) {
      if (event.time !== null) {
        timedEvents.push({ ...event, time: event.time });
      } else {
        const key = `${event.deliveryLabel}|${event.kind}`;
        if (!stateEventKeys.has(key)) {
          stateEventKeys.add(key);
          stateEvents.push({
            timeLabel: event.timeLabel,
            deliveryLabel: event.deliveryLabel,
            kind: event.kind,
            description: event.description,
          });
        }
      }
    }
  }

  const unchanged = current.scoped.filter((item) => {
    const hasActive = item.input.assignments.some(
      (assignment) => assignment.endedAt === null,
    );
    return hasActive && !changedDeliveryIds.has(item.input.delivery.id);
  }).length;

  const comparisonRows: ComparisonRow[] = previous
    ? [
        {
          label: "Deliveries in scope",
          current: current.computation.scopeCount,
          previous: previous.computation.scopeCount,
          delta: current.computation.scopeCount - previous.computation.scopeCount,
        },
        {
          label: "Recovery actions executed",
          current: current.computation.actionsExecuted,
          previous: previous.computation.actionsExecuted,
          delta: current.computation.actionsExecuted - previous.computation.actionsExecuted,
        },
        {
          label: "Successful outcomes",
          current: current.computation.outcomes.successful,
          previous: previous.computation.outcomes.successful,
          delta: current.computation.outcomes.successful - previous.computation.outcomes.successful,
        },
        {
          label: "Monitoring outcomes",
          current: current.computation.outcomes.monitoring,
          previous: previous.computation.outcomes.monitoring,
          delta: current.computation.outcomes.monitoring - previous.computation.outcomes.monitoring,
        },
        {
          label: "Unresolved outcomes",
          current: current.computation.outcomes.unresolved,
          previous: previous.computation.outcomes.unresolved,
          delta: current.computation.outcomes.unresolved - previous.computation.outcomes.unresolved,
        },
        {
          label: "No recovery action",
          current: current.computation.noAction,
          previous: previous.computation.noAction,
          delta: current.computation.noAction - previous.computation.noAction,
        },
      ]
    : [];

  const impactComparison: ImpactComparison[] = previous
    ? current.summary.impactMetrics.map((metric) => {
        const prior = previous.summary.impactMetrics.find(
          (item) => item.key === metric.key,
        );
        const comparable =
          prior !== undefined &&
          metric.state !== "insufficient" &&
          prior.state !== "insufficient" &&
          metric.unit !== null &&
          metric.unit === prior.unit &&
          metric.total !== null &&
          prior.total !== null;
        return {
          key: metric.key,
          label: metric.label,
          state: metric.state,
          currentDisplay: metric.display,
          previousDisplay: prior?.display ?? "Insufficient data",
          delta: comparable ? (metric.total ?? 0) - (prior?.total ?? 0) : null,
          unit: metric.unit,
        };
      })
    : [];

  const events = [
    ...timedEvents
      .sort((left, right) => left.time - right.time)
      .map((event) => ({
        timeLabel: event.timeLabel,
        deliveryLabel: event.deliveryLabel,
        kind: event.kind,
        description: event.description,
      })),
    ...stateEvents,
  ];

  const recordsWithoutTimestamps = prepared.filter((item) => {
    const { delivery, assignments, events: deliveryEvents } = item.input;
    return (
      delivery.createdAt === null &&
      delivery.deliveredAt === null &&
      assignments.length === 0 &&
      deliveryEvents.length === 0
    );
  }).length;

  const recovery = {
    actionsExecuted: current.computation.actionsExecuted,
    deliveriesWithRecovery: current.summary.snapshot.withRecoveryAction,
    outcomes: current.summary.outcomeCounts,
    noAction: current.summary.snapshot.withoutRecoveryAction,
  };

  const narrative = buildNarrative({
    periodLabel: period.label,
    timezone: input.timezone,
    timezoneAvailable,
    scopeCount: current.computation.scopeCount,
    snapshot: current.summary.snapshot,
    recovery,
    assignmentTransitions: transitions,
    impactMetrics: current.summary.impactMetrics,
    downstreamCount: current.summary.downstreamAffected.length,
  });

  return {
    kind: input.kind,
    periodLabel: period.label,
    previousPeriodLabel: previousBounds?.label ?? null,
    timezone: input.timezone,
    timezoneAvailable,
    periodStart: period.start,
    periodEnd: period.end,
    scopeCount: current.computation.scopeCount,
    snapshot: current.summary.snapshot,
    riskSummary: current.summary.riskSummary,
    recovery,
    outcomes: current.summary.outcomes,
    assignmentActivity: {
      assignmentsCreated,
      transitions,
      deliveriesWithChanges: changedDeliveryIds.size,
      truckChanges,
      driverChanges,
      truckAndDriverChanges,
      reRecords,
      unchanged,
    },
    impact: { metrics: current.summary.impactMetrics },
    downstreamAffected: current.summary.downstreamAffected,
    comparison: {
      available: previous !== null,
      previousLabel: previousBounds?.label ?? null,
      rows: comparisonRows,
      impact: impactComparison,
    },
    events,
    deliveries: current.summary.deliveryRows,
    recordsWithoutTimestamps,
    narrative,
  };
}
