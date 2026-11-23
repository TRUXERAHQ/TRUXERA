export type SourceFreshness =
  | "CURRENT"
  | "STALE"
  | "NEVER_SYNCED"
  | "SYNC_FAILED"
  | "DISCONNECTED";

export type DataQuality =
  | "COMPLETE"
  | "INCOMPLETE"
  | "MAPPING_FAILED"
  | "SOURCE_STALE"
  | "SOURCE_UNAVAILABLE"
  | "MANUAL";

export const DEFAULT_SYNC_INTERVAL_MINUTES = 24 * 60;

export type IntegrationFreshnessInput = {
  status: string;
  lastSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastSyncError: string | null;
  consecutiveFailures: number;
  latestRunStatus: string | null;
  latestRunFinishedAt: Date | null;
  expectedIntervalMinutes: number | null;
  now: Date;
};

export type SourceFreshnessResult = {
  freshness: SourceFreshness;
  intervalMinutes: number;
  intervalAssumed: boolean;
  lastSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
};

function ageMinutes(from: Date, now: Date): number {
  return Math.max(0, (now.getTime() - from.getTime()) / 60000);
}

export function computeSourceFreshness(
  input: IntegrationFreshnessInput,
): SourceFreshnessResult {
  const intervalMinutes =
    input.expectedIntervalMinutes && input.expectedIntervalMinutes > 0
      ? input.expectedIntervalMinutes
      : DEFAULT_SYNC_INTERVAL_MINUTES;
  const intervalAssumed = !(
    input.expectedIntervalMinutes && input.expectedIntervalMinutes > 0
  );

  const base = {
    intervalMinutes,
    intervalAssumed,
    lastSyncAt: input.lastSyncAt,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
  };

  if (input.status === "DISCONNECTED") {
    return { ...base, freshness: "DISCONNECTED" };
  }

  const runFailedAfterLastSuccess =
    input.latestRunStatus === "FAILED" &&
    input.latestRunFinishedAt !== null &&
    (input.lastSuccessfulSyncAt === null ||
      input.latestRunFinishedAt.getTime() >
        input.lastSuccessfulSyncAt.getTime());

  const hasFailureSignal =
    input.consecutiveFailures > 0 ||
    (input.lastSyncError !== null && input.lastSyncError.length > 0) ||
    runFailedAfterLastSuccess ||
    (input.status === "ERROR" && input.lastSuccessfulSyncAt === null);

  if (input.lastSuccessfulSyncAt === null) {
    if (hasFailureSignal) {
      return { ...base, freshness: "SYNC_FAILED" };
    }
    return { ...base, freshness: "NEVER_SYNCED" };
  }

  if (hasFailureSignal) {
    return { ...base, freshness: "SYNC_FAILED" };
  }

  const stale =
    ageMinutes(input.lastSuccessfulSyncAt, input.now) > intervalMinutes;
  return { ...base, freshness: stale ? "STALE" : "CURRENT" };
}

export function isSourceUnavailable(status: string): boolean {
  return (
    status === "DISCONNECTED" || status === "ERROR" || status === "DEGRADED"
  );
}

export function classifyDataQuality(input: {
  linked: boolean;
  sourceUnavailable: boolean;
  latestMappingOutcome: "MAPPED" | "MAPPING_FAILED" | null;
  recordLastSyncedAt: Date | null;
  requiredFieldsPresent: boolean;
  freshness: SourceFreshness | null;
  intervalMinutes: number;
  now: Date;
}): DataQuality {
  if (!input.linked) return "MANUAL";
  if (input.sourceUnavailable) return "SOURCE_UNAVAILABLE";
  if (input.latestMappingOutcome === "MAPPING_FAILED") return "MAPPING_FAILED";
  if (
    input.recordLastSyncedAt !== null &&
    ageMinutes(input.recordLastSyncedAt, input.now) > input.intervalMinutes
  ) {
    return "SOURCE_STALE";
  }
  if (!input.requiredFieldsPresent) return "INCOMPLETE";
  return "COMPLETE";
}

export type ConnectedRecordState = {
  internalKind: "Load" | "Delivery";
  internalId: string;
  providerKey: string;
  sourceName: string;
  freshness: SourceFreshness;
  quality: DataQuality;
  lastSyncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  intervalAssumed: boolean;
};
