import {
  formatDateTime,
  type ImpactEventInput,
} from "./delivery-chain.ts";
import {
  collectDeliveryEvidence,
  type DownstreamImpactEntry,
  type LoadImpactAssignment,
} from "./load-impact.ts";
import type { MeasureImpact } from "./measure-impact.ts";
import type { RecoveryResult } from "./recovery-result.ts";

export type RecoveryReportRecommendation = {
  truckUnitNumber: string;
  driverName: string;
  reasons: string[];
} | null;

export type RecoveryReportInput = {
  load: { reference: string; customerName: string };
  delivery: {
    id: string;
    reference: string | null;
    stopNumber: number;
    recipientName: string | null;
    status: string;
    eta: Date | null;
    deliveredAt: Date | null;
    deliveryWindowEnd: Date | null;
  };
  timezone: string;
  assignments: LoadImpactAssignment[];
  events: ImpactEventInput[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | null;
  currentRecommendation: RecoveryReportRecommendation;
  recoveryResult: RecoveryResult;
  measureImpact: MeasureImpact;
  downstreamEntries: DownstreamImpactEntry[];
};

export type RecoveryReport = {
  hasRecovery: boolean;
  header: {
    loadReference: string;
    customerName: string;
    deliveryLabel: string;
    recoveryAtLabel: string | null;
    outcome: string | null;
  };
  whatHappened: string[];
  downstream: {
    entries: DownstreamImpactEntry[];
    hasAffected: boolean;
  };
  recommendation: {
    historical: string;
    current: RecoveryReportRecommendation;
  };
  action: {
    fromLabel: string;
    toLabel: string;
    occurredAtLabel: string | null;
    dispatcherReason: string | null;
  } | null;
  result: {
    before: { truck: string; driver: string; status: string };
    after: {
      truck: string | null;
      driver: string | null;
      status: string;
      riskLabel: string | null;
    };
    outcomeLabel: string;
    comparison: { metric: string; before: string; after: string }[];
  } | null;
  impact: MeasureImpact["metrics"];
  summary: string[];
};

function deliveryLabel(delivery: RecoveryReportInput["delivery"]) {
  return delivery.reference ?? `Stop ${delivery.stopNumber}`;
}

export function buildRecoveryReport(
  input: RecoveryReportInput,
): RecoveryReport {
  const label = deliveryLabel(input.delivery);
  const recovery = input.recoveryResult.recovery;

  const evidence = collectDeliveryEvidence(
    {
      id: input.delivery.id,
      reference: input.delivery.reference,
      stopNumber: input.delivery.stopNumber,
      recipientName: input.delivery.recipientName,
      status: input.delivery.status,
      eta: input.delivery.eta,
      deliveredAt: input.delivery.deliveredAt,
      deliveryWindowEnd: input.delivery.deliveryWindowEnd,
    },
    input.assignments,
    input.events,
    input.riskLevel,
  );
  const whatHappened = evidence.map((item) => item.sentence);

  const downstreamEntries = input.downstreamEntries.filter((entry) =>
    entry.sourceDeliveryIds.includes(input.delivery.id),
  );
  const summary: string[] = [];
  if (whatHappened.length === 0) {
    summary.push(
      `No disruption evidence is recorded for ${label} beyond its operational history.`,
    );
  } else {
    summary.push(
      `TRUXERA recorded ${whatHappened.length} operational ${whatHappened.length === 1 ? "event" : "events"} for ${label}: ${whatHappened.join(" ")}`,
    );
  }

  let action: RecoveryReport["action"] = null;
  let result: RecoveryReport["result"] = null;
  if (recovery) {
    action = {
      fromLabel: recovery.action.fromLabel,
      toLabel: recovery.action.toLabel,
      occurredAtLabel: formatDateTime(
        recovery.occurredAt,
        input.timezone,
      ),
      dispatcherReason: recovery.dispatcherReason,
    };
    result = {
      before: {
        truck: recovery.before.truck,
        driver: recovery.before.driver,
        status: recovery.before.status,
      },
      after: {
        truck: recovery.after.truck,
        driver: recovery.after.driver,
        status: recovery.after.status,
        riskLabel: recovery.after.riskLabel,
      },
      outcomeLabel: recovery.outcomeLabel,
      comparison: recovery.comparison,
    };
    summary.push(
      `The delivery was reassigned from ${recovery.action.fromLabel} to ${recovery.action.toLabel} on ${formatDateTime(recovery.occurredAt, input.timezone)}${recovery.dispatcherReason ? ` (${recovery.dispatcherReason})` : ""}.`,
    );
    summary.push(
      `Current state: status ${input.delivery.status.toLowerCase().replaceAll("_", " ")}${recovery.after.riskLabel ? `, ${recovery.after.riskLabel}` : ""}. ${recovery.outcomeLabel}`,
    );
  } else {
    summary.push("No recovery action has been executed for this delivery.");
  }

  const calculated = input.measureImpact.metrics.filter(
    (metric) => metric.state !== "insufficient",
  );
  const insufficientCount =
    input.measureImpact.metrics.length - calculated.length;
  if (calculated.length === 0) {
    summary.push(
      "Measured operational impact remains insufficient where required source data was not recorded.",
    );
  } else {
    summary.push(
      `${calculated.length} impact ${calculated.length === 1 ? "metric" : "metrics"} could be measured from recorded data; ${insufficientCount} remain insufficient.`,
    );
  }

  return {
    hasRecovery: input.recoveryResult.hasRecovery,
    header: {
      loadReference: input.load.reference,
      customerName: input.load.customerName,
      deliveryLabel: label,
      recoveryAtLabel: recovery
        ? formatDateTime(recovery.occurredAt, input.timezone)
        : null,
      outcome: recovery ? recovery.outcome : null,
    },
    whatHappened,
    downstream: {
      entries: downstreamEntries,
      hasAffected: downstreamEntries.length > 0,
    },
    recommendation: {
      historical: "Not recorded",
      current: input.currentRecommendation,
    },
    action,
    result,
    impact: input.measureImpact.metrics,
    summary,
  };
}
