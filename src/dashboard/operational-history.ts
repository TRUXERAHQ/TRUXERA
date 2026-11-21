import { formatDateTime } from "./delivery-chain.ts";
import {
  addDaysToDateString,
  operationalDayStart,
  prepareDailyDeliveries,
  type DailyDeliveryInput,
} from "./daily-summary.ts";
import {
  parseReassignmentEndReason,
  type RecoveryOutcome,
} from "./recovery-result.ts";

export type OperationalHistoryEventType =
  | "LOAD_CREATED"
  | "DELIVERY_CREATED"
  | "DELIVERY_DELIVERED"
  | "DELIVERY_EVENT"
  | "ASSIGNMENT_CREATED"
  | "ASSIGNMENT_ENDED"
  | "RECOVERY_ACTION"
  | "IMPACT_MEASURED";

export type OperationalHistoryEntry = {
  id: string;
  timestamp: Date;
  timeLabel: string;
  type: OperationalHistoryEventType;
  typeLabel: string;
  loadId: string | null;
  loadReference: string | null;
  deliveryId: string | null;
  deliveryLabel: string | null;
  truckId: string | null;
  truckLabel: string | null;
  driverId: string | null;
  driverLabel: string | null;
  title: string;
  description: string;
  sourceId: string | null;
  outcome: RecoveryOutcome | null;
  impactMetrics: { label: string; state: string; display: string }[] | null;
};

export type OperationalHistoryFilters = {
  from?: string | null;
  to?: string | null;
  loadId?: string | null;
  deliveryId?: string | null;
  truckId?: string | null;
  driverId?: string | null;
  type?: string | null;
  outcome?: string | null;
  q?: string | null;
  order?: "asc" | "desc" | null;
};

export type OperationalHistoryFacet = {
  id: string;
  label: string;
};

export type OperationalHistory = {
  entries: OperationalHistoryEntry[];
  totalEntries: number;
  timezone: string;
  timezoneAvailable: boolean;
  facets: {
    loads: OperationalHistoryFacet[];
    deliveries: OperationalHistoryFacet[];
    trucks: OperationalHistoryFacet[];
    drivers: OperationalHistoryFacet[];
    types: { value: OperationalHistoryEventType; label: string }[];
    outcomes: { value: RecoveryOutcome; label: string }[];
  };
};

const reassignmentPrefix = "Reassigned from truck ";

const typeLabels: Record<OperationalHistoryEventType, string> = {
  LOAD_CREATED: "Load created",
  DELIVERY_CREATED: "Delivery created",
  DELIVERY_DELIVERED: "Delivery completed",
  DELIVERY_EVENT: "Delivery event",
  ASSIGNMENT_CREATED: "Assignment created",
  ASSIGNMENT_ENDED: "Assignment ended",
  RECOVERY_ACTION: "Recovery action",
  IMPACT_MEASURED: "Impact measured",
};

const typeOrder: OperationalHistoryEventType[] = [
  "LOAD_CREATED",
  "DELIVERY_CREATED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_ENDED",
  "RECOVERY_ACTION",
  "DELIVERY_EVENT",
  "DELIVERY_DELIVERED",
  "IMPACT_MEASURED",
];

const outcomeLabels: Record<RecoveryOutcome, string> = {
  successful: "Successful",
  monitoring: "Monitoring",
  unresolved: "Unresolved",
  insufficientData: "Insufficient data",
};

const deliveryEventTitles: Record<string, string> = {
  STATUS_CHANGED: "Delivery status changed",
  ASSIGNMENT_CHANGED: "Assignment change recorded",
  ETA_UPDATED: "ETA updated",
  DELIVERY_ATTEMPTED: "Delivery attempted",
  EXCEPTION_REPORTED: "Exception reported",
  LOCATION_UPDATED: "Location updated",
};

function safeTimeLabel(value: Date, timezone: string) {
  try {
    return formatDateTime(value, timezone);
  } catch {
    return value.toISOString();
  }
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function validDateString(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function utcMidnight(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function buildOperationalHistory(input: {
  deliveries: DailyDeliveryInput[];
  loads: { id: string; reference: string; createdAt: Date | null }[];
  timezone: string;
  filters?: OperationalHistoryFilters;
}): OperationalHistory {
  const timezone = input.timezone;
  const timezoneAvailable = (() => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  })();

  const loadCreatedAtById = new Map(
    input.loads.map((load) => [load.id, load.createdAt] as const),
  );
  const loadReferenceById = new Map(
    input.loads.map((load) => [load.id, load.reference] as const),
  );

  const prepared = prepareDailyDeliveries(input.deliveries, timezone);
  const entries: OperationalHistoryEntry[] = [];

  const push = (entry: OperationalHistoryEntry) => entries.push(entry);

  const emittedLoads = new Set<string>();
  for (const item of prepared) {
    const { input: source } = item;
    const delivery = source.delivery;
    const label = item.label;
    const loadReference =
      loadReferenceById.get(delivery.loadId) ?? delivery.loadReference;
    const base = {
      loadId: delivery.loadId,
      loadReference,
      deliveryId: delivery.id,
      deliveryLabel: label,
      truckId: null as string | null,
      truckLabel: null as string | null,
      driverId: null as string | null,
      driverLabel: null as string | null,
      outcome: null as RecoveryOutcome | null,
      impactMetrics: null as OperationalHistoryEntry["impactMetrics"],
      sourceId: null as string | null,
    };

    const loadCreatedAt = loadCreatedAtById.get(delivery.loadId);
    if (loadCreatedAt && !emittedLoads.has(delivery.loadId)) {
      emittedLoads.add(delivery.loadId);
      push({
        ...base,
        deliveryId: null,
        deliveryLabel: null,
        id: `LOAD_CREATED:${delivery.loadId}`,
        timestamp: loadCreatedAt,
        timeLabel: safeTimeLabel(loadCreatedAt, timezone),
        type: "LOAD_CREATED",
        typeLabel: typeLabels.LOAD_CREATED,
        title: `Load ${loadReference} created`,
        description: `Load ${loadReference} was created${
          source.delivery.customerName
            ? ` for ${source.delivery.customerName}`
            : ""
        }.`,
        sourceId: delivery.loadId,
      });
    }

    if (delivery.createdAt) {
      push({
        ...base,
        id: `DELIVERY_CREATED:${delivery.id}`,
        timestamp: delivery.createdAt,
        timeLabel: safeTimeLabel(delivery.createdAt, timezone),
        type: "DELIVERY_CREATED",
        typeLabel: typeLabels.DELIVERY_CREATED,
        title: `Delivery ${label} created`,
        description: `Delivery ${label} was added to load ${loadReference}.`,
        sourceId: delivery.id,
      });
    }

    const sortedAssignments = [...source.assignments].sort(
      (left, right) => left.assignedAt.getTime() - right.assignedAt.getTime(),
    );

    sortedAssignments.forEach((assignment) => {
      const truckDriver = `${assignment.truck.unitNumber} · ${assignment.driver.name}`;
      const resourceBase = {
        ...base,
        truckId: assignment.truckId,
        truckLabel: assignment.truck.unitNumber,
        driverId: assignment.driverId,
        driverLabel: assignment.driver.name,
      };
      push({
        ...resourceBase,
        id: `ASSIGNMENT_CREATED:${assignment.id}`,
        timestamp: assignment.assignedAt,
        timeLabel: safeTimeLabel(assignment.assignedAt, timezone),
        type: "ASSIGNMENT_CREATED",
        typeLabel: typeLabels.ASSIGNMENT_CREATED,
        title: `Delivery ${label} assigned`,
        description: `Assigned to ${truckDriver}.`,
        sourceId: assignment.id,
      });

      if (assignment.endedAt !== null) {
        const isRecovery =
          assignment.endReason?.startsWith(reassignmentPrefix) ?? false;
        const successor =
          sortedAssignments.find(
            (candidate) =>
              candidate.id !== assignment.id &&
              candidate.assignedAt.getTime() >=
                assignment.endedAt!.getTime() - 1000,
          ) ??
          sortedAssignments.find(
            (candidate) =>
              candidate.id !== assignment.id && candidate.endedAt === null,
          ) ??
          null;
        const successorLabel = successor
          ? `${successor.truck.unitNumber} · ${successor.driver.name}`
          : "Not recorded";
        const parsed = assignment.endReason
          ? parseReassignmentEndReason(assignment.endReason)
          : { dispatcherReason: null, routeNote: null };
        const isLatestRecovery =
          isRecovery &&
          item.recovery.recovery !== null &&
          item.recovery.recovery.occurredAt.getTime() ===
            assignment.endedAt.getTime();

        if (isRecovery) {
          push({
            ...resourceBase,
            id: `RECOVERY_ACTION:${assignment.id}`,
            timestamp: assignment.endedAt,
            timeLabel: safeTimeLabel(assignment.endedAt, timezone),
            type: "RECOVERY_ACTION",
            typeLabel: typeLabels.RECOVERY_ACTION,
            title: `Delivery ${label} reassigned`,
            description: [
              `${truckDriver} → ${successorLabel}.`,
              parsed.dispatcherReason
                ? `Reason: ${parsed.dispatcherReason}`
                : null,
              "Historical recommendation: Not recorded.",
            ]
              .filter(Boolean)
              .join(" "),
            sourceId: assignment.id,
            outcome: isLatestRecovery
              ? item.recovery.recovery?.outcome ?? null
              : null,
          });
        } else {
          push({
            ...resourceBase,
            id: `ASSIGNMENT_ENDED:${assignment.id}`,
            timestamp: assignment.endedAt,
            timeLabel: safeTimeLabel(assignment.endedAt, timezone),
            type: "ASSIGNMENT_ENDED",
            typeLabel: typeLabels.ASSIGNMENT_ENDED,
            title: `Assignment for ${label} ended`,
            description:
              assignment.endReason ??
              "Assignment ended; no end reason was recorded.",
            sourceId: assignment.id,
          });
        }
      }
    });

    for (const event of source.events) {
      const parts = [
        event.fromStatus && event.toStatus
          ? `${humanize(event.fromStatus)} → ${humanize(event.toStatus)}`
          : event.toStatus
            ? `Status: ${humanize(event.toStatus)}`
            : null,
        event.note,
      ].filter(Boolean);
      push({
        ...base,
        id: `DELIVERY_EVENT:${delivery.id}:${event.occurredAt.getTime()}:${event.type}`,
        timestamp: event.occurredAt,
        timeLabel: safeTimeLabel(event.occurredAt, timezone),
        type: "DELIVERY_EVENT",
        typeLabel: typeLabels.DELIVERY_EVENT,
        title: `${deliveryEventTitles[event.type] ?? humanize(event.type)} — ${label}`,
        description:
          parts.join(" · ") ||
          `${deliveryEventTitles[event.type] ?? humanize(event.type)} recorded for ${label}.`,
        sourceId: null,
      });
    }

    if (delivery.deliveredAt) {
      push({
        ...base,
        id: `DELIVERY_DELIVERED:${delivery.id}`,
        timestamp: delivery.deliveredAt,
        timeLabel: safeTimeLabel(delivery.deliveredAt, timezone),
        type: "DELIVERY_DELIVERED",
        typeLabel: typeLabels.DELIVERY_DELIVERED,
        title: `Delivery ${label} completed`,
        description: `Delivery ${label} on load ${loadReference} was marked delivered.`,
        sourceId: delivery.id,
      });
    }

    if (item.recovery.hasRecovery && item.recovery.recovery) {
      push({
        ...base,
        id: `IMPACT_MEASURED:${delivery.id}`,
        timestamp: item.recovery.recovery.occurredAt,
        timeLabel: safeTimeLabel(
          item.recovery.recovery.occurredAt,
          timezone,
        ),
        type: "IMPACT_MEASURED",
        typeLabel: typeLabels.IMPACT_MEASURED,
        title: `Measured impact recorded — ${label}`,
        description:
          "Phase 5 measured impact for the recorded recovery. Unavailable values remain insufficient data.",
        sourceId: delivery.id,
        impactMetrics: item.impact.metrics.map((metric) => ({
          label: metric.label,
          state: metric.state,
          display: metric.display,
        })),
      });
    }
  }

  const filters = input.filters ?? {};
  const fromDate = validDateString(filters.from);
  const toDate = validDateString(filters.to);
  const rangeStart = fromDate
    ? (operationalDayStart(fromDate, timezone) ?? utcMidnight(fromDate))
    : null;
  const toExclusive = toDate ? addDaysToDateString(toDate, 1) : null;
  const rangeEnd = toExclusive
    ? (operationalDayStart(toExclusive, timezone) ?? utcMidnight(toExclusive))
    : null;

  const query = filters.q?.trim().toLowerCase() ?? "";
  const filtered = entries.filter((entry) => {
    if (rangeStart && entry.timestamp.getTime() < rangeStart.getTime())
      return false;
    if (rangeEnd && entry.timestamp.getTime() >= rangeEnd.getTime())
      return false;
    if (filters.loadId && entry.loadId !== filters.loadId) return false;
    if (filters.deliveryId && entry.deliveryId !== filters.deliveryId)
      return false;
    if (filters.truckId && entry.truckId !== filters.truckId) return false;
    if (filters.driverId && entry.driverId !== filters.driverId) return false;
    if (
      filters.type &&
      filters.type !== "" &&
      entry.type !== filters.type
    )
      return false;
    if (filters.outcome && entry.outcome !== filters.outcome) return false;
    if (query) {
      const haystack = [
        entry.loadReference,
        entry.deliveryLabel,
        entry.truckLabel,
        entry.driverLabel,
        entry.title,
        entry.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const descending = filters.order !== "asc";
  const rank = (type: OperationalHistoryEventType) => typeOrder.indexOf(type);
  filtered.sort((left, right) => {
    const timeDiff = left.timestamp.getTime() - right.timestamp.getTime();
    const primary = descending ? -timeDiff : timeDiff;
    if (primary !== 0) return primary;
    const rankDiff = rank(left.type) - rank(right.type);
    if (rankDiff !== 0) return rankDiff;
    return left.id.localeCompare(right.id);
  });

  const loads = new Map<string, string>();
  const deliveries = new Map<string, string>();
  const trucks = new Map<string, string>();
  const drivers = new Map<string, string>();
  for (const item of prepared) {
    const delivery = item.input.delivery;
    loads.set(delivery.loadId, item.input.delivery.loadReference);
    deliveries.set(delivery.id, item.label);
    for (const assignment of item.input.assignments) {
      trucks.set(assignment.truckId, assignment.truck.unitNumber);
      drivers.set(assignment.driverId, assignment.driver.name);
    }
  }
  const facetSort = (a: OperationalHistoryFacet, b: OperationalHistoryFacet) =>
    a.label.localeCompare(b.label);

  return {
    entries: filtered,
    totalEntries: entries.length,
    timezone,
    timezoneAvailable,
    facets: {
      loads: [...loads.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort(facetSort),
      deliveries: [...deliveries.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort(facetSort),
      trucks: [...trucks.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort(facetSort),
      drivers: [...drivers.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort(facetSort),
      types: typeOrder.map((value) => ({
        value,
        label: typeLabels[value],
      })),
      outcomes: (Object.keys(outcomeLabels) as RecoveryOutcome[]).map(
        (value) => ({ value, label: outcomeLabels[value] }),
      ),
    },
  };
}

