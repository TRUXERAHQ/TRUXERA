import type { DownstreamImpactEntry } from "./load-impact.ts";
import type { RecoveryResult } from "./recovery-result.ts";

export type ImpactMetricState = "actual" | "estimated" | "insufficient";

export type ImpactMetric = {
  key: string;
  label: string;
  state: ImpactMetricState;
  display: string;
  evidence: string[];
};

export type MeasureImpactDelivery = {
  id: string;
  reference: string | null;
  stopNumber: number;
  status: string;
  eta: Date | null;
  deliveredAt: Date | null;
  deliveryWindowStart: Date | null;
  deliveryWindowEnd: Date | null;
};

export type MeasureImpactInput = {
  recovery: RecoveryResult;
  delivery: MeasureImpactDelivery;
  downstreamEntries: DownstreamImpactEntry[];
  beforeEta: Date | null;
  mileage:
    | { before: number; after: number; unit: string }
    | null;
  fuel:
    | {
        consumptionPerMile: number;
        pricePerUnit: number;
        currency: string;
        distanceDelta: number;
      }
    | null;
  labor:
    | { ratePerHour: number; currency: string; minutesDelta: number }
    | null;
  timezone: string;
};

export type MeasureImpact = {
  hasRecovery: boolean;
  metrics: ImpactMetric[];
};

const terminalStatuses = new Set(["DELIVERED", "FAILED", "CANCELLED"]);

function insufficient(
  key: string,
  label: string,
  evidence: string[],
): ImpactMetric {
  return {
    key,
    label,
    state: "insufficient",
    display: "Insufficient data",
    evidence,
  };
}

function metric(
  key: string,
  label: string,
  state: ImpactMetricState,
  display: string,
  evidence: string[],
): ImpactMetric {
  return { key, label, state, display, evidence };
}

function minutesBetween(later: Date, earlier: Date) {
  return (later.getTime() - earlier.getTime()) / 60000;
}

function projectedLateness(
  projectedAt: Date | null,
  windowEnd: Date | null,
): boolean | null {
  if (!projectedAt || !windowEnd) return null;
  return projectedAt.getTime() > windowEnd.getTime();
}

function delayBeyondWindow(
  projectedAt: Date | null,
  windowEnd: Date | null,
): number | null {
  if (!projectedAt || !windowEnd) return null;
  return Math.max(0, minutesBetween(projectedAt, windowEnd));
}

function deliveriesProtected(
  input: MeasureImpactInput,
): ImpactMetric {
  const key = "deliveriesProtected";
  const label = "Deliveries protected";
  if (!input.recovery.hasRecovery) {
    return insufficient(key, label, [
      "No recovery action was executed, so there is no before/after boundary to measure protection against.",
    ]);
  }
  const attributed = input.downstreamEntries.filter((entry) =>
    entry.sourceDeliveryIds.includes(input.delivery.id),
  );
  if (attributed.length === 0) {
    return insufficient(key, label, [
      "No downstream deliveries are currently recorded as impacted by this delivery's disruption, and no historical impact record exists to confirm what the recovery protected.",
    ]);
  }
  const protectedCount = attributed.filter(
    (entry) =>
      entry.state === "resolved" ||
      (entry.riskLevel === "LOW" &&
        !terminalStatuses.has(entry.status)),
  ).length;
  const unresolved = attributed.filter(
    (entry) =>
      !(
        entry.state === "resolved" ||
        (entry.riskLevel === "LOW" && !terminalStatuses.has(entry.status))
      ),
  );
  const evidence = attributed.map(
    (entry) =>
      `${entry.label} (stop ${entry.stopNumber}): ${entry.state} impact, ${entry.riskLevel === null ? "risk not assessed" : `${entry.riskLevel.toLowerCase()} risk`}, status ${entry.status.toLowerCase().replaceAll("_", " ")}.`,
  );
  if (unresolved.length > 0) {
    evidence.push(
      `${unresolved.length} attributed downstream ${unresolved.length === 1 ? "delivery remains" : "deliveries remain"} impacted and is not counted as protected.`,
    );
  }
  return metric(
    key,
    label,
    "actual",
    `${protectedCount} downstream ${protectedCount === 1 ? "delivery" : "deliveries"}`,
    evidence,
  );
}

function lateDeliveriesAvoided(
  input: MeasureImpactInput,
): ImpactMetric {
  const key = "lateDeliveriesAvoided";
  const label = "Potential late deliveries avoided";
  const { delivery, beforeEta } = input;
  if (!input.recovery.hasRecovery) {
    return insufficient(key, label, [
      "No recovery action was executed.",
    ]);
  }
  const windowEnd = delivery.deliveryWindowEnd;
  if (!beforeEta || !windowEnd) {
    return insufficient(key, label, [
      "A pre-recovery projected ETA and a delivery window are required; at least one is not recorded.",
    ]);
  }
  const beforeLate = projectedLateness(beforeEta, windowEnd);
  const afterLate = delivery.deliveredAt
    ? projectedLateness(delivery.deliveredAt, windowEnd)
    : projectedLateness(delivery.eta, windowEnd);
  if (beforeLate === null || afterLate === null) {
    return insufficient(key, label, [
      "The post-recovery delivery outcome or projected ETA is not recorded.",
    ]);
  }
  const avoided = beforeLate && !afterLate ? 1 : 0;
  return metric(
    key,
    label,
    "estimated",
    `${avoided} ${avoided === 1 ? "delivery" : "deliveries"}`,
    [
      `Pre-recovery projection ${beforeLate ? "exceeded" : "met"} the delivery window.`,
      `Post-recovery ${delivery.deliveredAt ? "actual delivery" : "projection"} ${afterLate ? "exceeded" : "met"} the delivery window.`,
    ],
  );
}

function projectedDelayImprovement(
  input: MeasureImpactInput,
): ImpactMetric {
  const key = "projectedDelayImprovement";
  const label = "Projected delay improvement";
  const { delivery, beforeEta } = input;
  if (!input.recovery.hasRecovery) {
    return insufficient(key, label, [
      "No recovery action was executed.",
    ]);
  }
  const windowEnd = delivery.deliveryWindowEnd;
  const afterEta = delivery.eta;
  if (!beforeEta || !afterEta || !windowEnd) {
    return insufficient(key, label, [
      "Both a pre-recovery and a current projected ETA plus a delivery window are required; at least one is not recorded.",
    ]);
  }
  const beforeDelay = delayBeyondWindow(beforeEta, windowEnd);
  const afterDelay = delayBeyondWindow(afterEta, windowEnd);
  if (beforeDelay === null || afterDelay === null) {
    return insufficient(key, label, [
      "Delay beyond the delivery window could not be calculated for both projections.",
    ]);
  }
  const improvementMinutes = beforeDelay - afterDelay;
  const display =
    improvementMinutes >= 0
      ? `${Math.round(improvementMinutes)} min`
      : `${Math.round(Math.abs(improvementMinutes))} min worse`;
  return metric(key, label, "estimated", display, [
    `Pre-recovery projected delay beyond window: ${Math.round(beforeDelay)} min.`,
    `Current projected delay beyond window: ${Math.round(afterDelay)} min.`,
  ]);
}

function avoidedMiles(input: MeasureImpactInput): ImpactMetric {
  const key = "avoidedMiles";
  const label = "Avoided miles";
  const mileage = input.mileage;
  if (!input.recovery.hasRecovery) {
    return insufficient(key, label, [
      "No recovery action was executed.",
    ]);
  }
  if (!mileage) {
    return insufficient(key, label, [
      "No recorded mileage or distance source exists in the operational data.",
    ]);
  }
  const avoided = mileage.before - mileage.after;
  return metric(
    key,
    label,
    "estimated",
    `${Math.round(avoided * 10) / 10} ${mileage.unit}`,
    [
      `Recorded distance before recovery: ${mileage.before} ${mileage.unit}.`,
      `Recorded distance after recovery: ${mileage.after} ${mileage.unit}.`,
    ],
  );
}

function driverTimeImpact(input: MeasureImpactInput): ImpactMetric {
  const key = "driverTimeImpact";
  const label = "Driver time impact";
  if (!input.recovery.hasRecovery) {
    return insufficient(key, label, [
      "No recovery action was executed.",
    ]);
  }
  if (!input.labor) {
    return insufficient(key, label, [
      "No recorded before/after driving or service duration comparison exists.",
    ]);
  }
  const delta = input.labor.minutesDelta;
  return metric(
    key,
    label,
    "estimated",
    `${Math.round(Math.abs(delta))} min ${delta >= 0 ? "saved" : "added"}`,
    [
      `Recorded duration delta across the recovery: ${Math.round(delta)} minutes.`,
    ],
  );
}

function fuelImpact(input: MeasureImpactInput): ImpactMetric {
  const key = "fuelImpact";
  const label = "Fuel impact";
  if (!input.recovery.hasRecovery) {
    return insufficient(key, label, [
      "No recovery action was executed.",
    ]);
  }
  const fuel = input.fuel;
  if (!fuel) {
    return insufficient(key, label, [
      "Fuel consumption rate, fuel price, and distance delta are not recorded; no fuel impact can be calculated.",
    ]);
  }
  const cost =
    fuel.consumptionPerMile *
    fuel.distanceDelta *
    fuel.pricePerUnit;
  return metric(
    key,
    label,
    "estimated",
    `${fuel.currency}${cost.toFixed(2)}`,
    [
      `Fuel consumption: ${fuel.consumptionPerMile} per mile (recorded).`,
      `Fuel price: ${fuel.currency}${fuel.pricePerUnit} per unit (recorded).`,
      `Distance delta: ${fuel.distanceDelta} miles (recorded).`,
    ],
  );
}

function operationalBenefit(input: MeasureImpactInput): ImpactMetric {
  const key = "operationalBenefit";
  const label = "Estimated operational benefit";
  if (!input.recovery.hasRecovery) {
    return insufficient(key, label, [
      "No recovery action was executed.",
    ]);
  }
  const components: { label: string; amount: number; currency: string; evidence: string[] }[] = [];
  const fuel = input.fuel;
  if (fuel) {
    components.push({
      label: "Fuel",
      amount:
        fuel.consumptionPerMile *
        fuel.distanceDelta *
        fuel.pricePerUnit,
      currency: fuel.currency,
      evidence: [
        "Fuel impact validated from recorded consumption, price, and distance inputs.",
      ],
    });
  }
  const labor = input.labor;
  if (labor && labor.minutesDelta > 0) {
    components.push({
      label: "Driver time",
      amount: (labor.minutesDelta / 60) * labor.ratePerHour,
      currency: labor.currency,
      evidence: [
        "Driver-time benefit validated from recorded duration delta and hourly rate.",
      ],
    });
  }
  if (components.length === 0) {
    return insufficient(key, label, [
      "No validated monetary components exist; fuel, mileage-cost, and labor-rate inputs are not recorded, and no monetary value is assigned to protected deliveries or reduced risk.",
    ]);
  }
  const currencies = new Set(components.map((item) => item.currency));
  if (currencies.size > 1) {
    return insufficient(key, label, [
      "Validated components use multiple currencies; a single benefit total cannot be reported.",
    ]);
  }
  const currency = components[0].currency;
  const total = components.reduce((sum, item) => sum + item.amount, 0);
  return metric(
    key,
    label,
    "estimated",
    `${currency}${total.toFixed(2)}`,
    [
      ...components.map(
        (item) => `${item.label}: ${item.currency}${item.amount.toFixed(2)}.`,
      ),
      "Only validated components are included; no value is assigned to unmeasured outcomes.",
    ],
  );
}

export function buildMeasureImpact(
  input: MeasureImpactInput,
): MeasureImpact {
  return {
    hasRecovery: input.recovery.hasRecovery,
    metrics: [
      deliveriesProtected(input),
      lateDeliveriesAvoided(input),
      projectedDelayImprovement(input),
      avoidedMiles(input),
      driverTimeImpact(input),
      fuelImpact(input),
      operationalBenefit(input),
    ],
  };
}
