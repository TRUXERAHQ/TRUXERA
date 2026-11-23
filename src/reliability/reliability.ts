/**
 * Reliability/observability classification — pure, deterministic.
 *
 * Separates four concerns that must not be collapsed into one status:
 *   1. Integration lifecycle status (CONNECTED/DEGRADED/ERROR/…)
 *   2. Sync health (latest IntegrationSyncRun outcome)
 *   3. Source freshness (existing Phase 1D classifier — reused, not duplicated)
 *   4. Derived failure indicators (explicit, documented thresholds)
 *
 * No health scores, percentages, or probabilities are produced.
 */

import { redactSecrets } from "../integrations/errors.ts";

/** Explicit, documented thresholds. */
export const RELIABILITY_THRESHOLDS = {
  /** Consecutive failed sync runs before an integration is reported FAILED. */
  consecutiveFailuresForError: 3,
  /** Maximum characters kept from a stored/provider error message. */
  maxErrorLength: 300,
  /** Bound on sync-run history scanned per organization read. */
  syncRunLookback: 200,
  /** Bound on sync events scanned for feed-warning detail. */
  syncEventLookback: 100,
} as const;

export type ReliabilityHealth =
  | "HEALTHY"
  | "DEGRADED"
  | "FAILED"
  | "NEVER_SYNCED"
  | "DISCONNECTED";

export type ReliabilityIndicatorCode =
  | "CONSECUTIVE_FAILURES"
  | "LAST_SYNC_FAILED"
  | "PARTIAL_SYNC"
  | "STALE_SOURCE"
  | "SYNC_FAILED_SOURCE"
  | "NEVER_SYNCED"
  | "AUTHENTICATION_FAILURE"
  | "AUTHORIZATION_FAILURE"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "RECORD_FAILURES";

export type ReliabilityIndicator = {
  code: ReliabilityIndicatorCode;
  label: string;
};

export type SyncRunSnapshot = {
  id: string;
  status: string;
  trigger: string;
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errorCode: string | null;
  errorSummary: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type SyncHealth = {
  latestStatus: string | null;
  latestStartedAt: Date | null;
  latestFinishedAt: Date | null;
  /** Milliseconds between startedAt and finishedAt; null when unfinished. */
  durationMs: number | null;
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errorCode: string | null;
  /** Sanitized, length-bounded error/warning text. */
  errorSummary: string | null;
  lastSuccessfulAt: Date | null;
  lastFailedAt: Date | null;
  /** Count of consecutive non-SUCCEEDED runs ending at the latest run. */
  consecutiveFailedRuns: number;
};

export type IntegrationReliabilityInput = {
  status: string;
  health: string;
  freshness: string;
  lastSuccessfulSyncAt: Date | null;
  consecutiveFailures: number;
  lastSyncError: string | null;
  sync: SyncHealth;
};

export type IntegrationReliability = {
  health: ReliabilityHealth;
  indicators: ReliabilityIndicator[];
};

const INDICATOR_LABELS: Record<ReliabilityIndicatorCode, string> = {
  CONSECUTIVE_FAILURES: "Repeated sync failures",
  LAST_SYNC_FAILED: "Latest sync failed",
  PARTIAL_SYNC: "Partial sync (feed warning)",
  STALE_SOURCE: "Source data is stale",
  SYNC_FAILED_SOURCE: "Source sync failing",
  NEVER_SYNCED: "Never synced successfully",
  AUTHENTICATION_FAILURE: "Provider authentication failing",
  AUTHORIZATION_FAILURE: "Provider authorization failing",
  RATE_LIMITED: "Provider rate limiting",
  PROVIDER_UNAVAILABLE: "Provider unavailable",
  RECORD_FAILURES: "Record-level failures",
};

/** Sanitize any stored/provider text before it reaches an operator. */
export function sanitizeForDisplay(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const clean = redactSecrets(text).trim();
  if (!clean) return null;
  return clean.length > RELIABILITY_THRESHOLDS.maxErrorLength
    ? `${clean.slice(0, RELIABILITY_THRESHOLDS.maxErrorLength)}…`
    : clean;
}

/**
 * Derives sync health for one integration from bounded run history
 * (newest first). `runs` must be pre-filtered to the integration and
 * ordered by startedAt descending.
 */
export function summarizeSyncRuns(
  runs: SyncRunSnapshot[],
): SyncHealth {
  const latest = runs[0] ?? null;
  let lastSuccessfulAt: Date | null = null;
  let lastFailedAt: Date | null = null;
  let consecutiveFailedRuns = 0;

  for (const run of runs) {
    if (run.status === "FAILED" && !lastFailedAt) {
      lastFailedAt = run.finishedAt ?? run.startedAt;
    }
    if (
      (run.status === "SUCCEEDED" || run.status === "PARTIAL") &&
      !lastSuccessfulAt
    ) {
      lastSuccessfulAt = run.finishedAt ?? run.startedAt;
    }
  }

  // Consecutive failures counted from the newest run backwards; a
  // SUCCEEDED or PARTIAL run resets the streak. RUNNING runs are ignored
  // for streak purposes but do not reset it.
  for (const run of runs) {
    if (run.status === "RUNNING") continue;
    if (run.status === "FAILED") {
      consecutiveFailedRuns += 1;
    } else {
      break;
    }
  }

  const durationMs =
    latest?.finishedAt && latest.startedAt
      ? Math.max(0, latest.finishedAt.getTime() - latest.startedAt.getTime())
      : null;

  return {
    latestStatus: latest?.status ?? null,
    latestStartedAt: latest?.startedAt ?? null,
    latestFinishedAt: latest?.finishedAt ?? null,
    durationMs,
    recordsSeen: latest?.recordsSeen ?? 0,
    recordsCreated: latest?.recordsCreated ?? 0,
    recordsUpdated: latest?.recordsUpdated ?? 0,
    recordsFailed: latest?.recordsFailed ?? 0,
    errorCode: latest?.errorCode ?? null,
    errorSummary: sanitizeForDisplay(latest?.errorSummary ?? null),
    lastSuccessfulAt,
    lastFailedAt,
    consecutiveFailedRuns,
  };
}

function indicator(
  code: ReliabilityIndicatorCode,
): ReliabilityIndicator {
  return { code, label: INDICATOR_LABELS[code] };
}

const ERROR_CODE_INDICATORS: Record<string, ReliabilityIndicatorCode> = {
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILURE",
  AUTHORIZATION_FAILED: "AUTHORIZATION_FAILURE",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  NETWORK_FAILURE: "PROVIDER_UNAVAILABLE",
  RECORD_FAILURES: "RECORD_FAILURES",
};

/**
 * Combines lifecycle status, derived integration health, source freshness,
 * and sync-run outcomes into one display health plus explicit indicators.
 * Deterministic — no scoring.
 */
export function computeIntegrationReliability(
  input: IntegrationReliabilityInput,
): IntegrationReliability {
  const indicators: ReliabilityIndicator[] = [];
  const { sync } = input;

  if (input.status === "DISCONNECTED") {
    return { health: "DISCONNECTED", indicators };
  }

  if (sync.consecutiveFailedRuns >= RELIABILITY_THRESHOLDS.consecutiveFailuresForError) {
    indicators.push(indicator("CONSECUTIVE_FAILURES"));
  }
  if (sync.latestStatus === "FAILED") {
    indicators.push(indicator("LAST_SYNC_FAILED"));
  }
  if (sync.latestStatus === "PARTIAL") {
    indicators.push(indicator("PARTIAL_SYNC"));
  }
  if (input.freshness === "STALE") {
    indicators.push(indicator("STALE_SOURCE"));
  }
  if (input.freshness === "SYNC_FAILED") {
    indicators.push(indicator("SYNC_FAILED_SOURCE"));
  }
  if (input.freshness === "NEVER_SYNCED" || (!input.lastSuccessfulSyncAt && !input.lastSyncError && sync.lastSuccessfulAt === null)) {
    indicators.push(indicator("NEVER_SYNCED"));
  }
  if (sync.errorCode && ERROR_CODE_INDICATORS[sync.errorCode]) {
    indicators.push(indicator(ERROR_CODE_INDICATORS[sync.errorCode]));
  }

  const health: ReliabilityHealth =
    input.health === "ERROR" ||
    sync.consecutiveFailedRuns >= RELIABILITY_THRESHOLDS.consecutiveFailuresForError
      ? "FAILED"
      : input.health === "DEGRADED" ||
          sync.latestStatus === "FAILED" ||
          sync.latestStatus === "PARTIAL" ||
          input.freshness === "STALE" ||
          input.freshness === "SYNC_FAILED"
        ? "DEGRADED"
        : input.lastSuccessfulSyncAt === null &&
            input.lastSyncError === null &&
            sync.lastSuccessfulAt === null &&
            sync.latestStatus === null
          ? "NEVER_SYNCED"
          : "HEALTHY";

  return { health, indicators };
}

export type ApplicationHealth = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export type ApplicationHealthResult = {
  status: ApplicationHealth;
  checks: {
    app: "UP";
    database: "HEALTHY" | "UNAVAILABLE";
  };
};

/**
 * Rolls dependency probe results into an application health status.
 * Only coarse states are exposed — never internals.
 */
export function computeApplicationHealth(input: {
  databaseReachable: boolean;
}): ApplicationHealthResult {
  if (!input.databaseReachable) {
    return {
      status: "UNAVAILABLE",
      checks: { app: "UP", database: "UNAVAILABLE" },
    };
  }
  return {
    status: "HEALTHY",
    checks: { app: "UP", database: "HEALTHY" },
  };
}
