import { connectDatabase, db } from "./db";
import { getMembershipForUserInOrganization } from "./organization-data";
// Side-effect import: registers provider sync intervals and operational
// mappers used by getProviderSyncIntervalMinutes below.
import "./integration-data";
import { canReadIntegrations } from "@/src/integrations/policy";
import { computeIntegrationHealth } from "@/src/integrations/lifecycle";
import {
  computeSourceFreshness,
  type SourceFreshness,
} from "@/src/integrations/connected-signals";
import { getProviderSyncIntervalMinutes } from "@/src/integrations/materialize/registry";
import {
  computeApplicationHealth,
  computeIntegrationReliability,
  summarizeSyncRuns,
  RELIABILITY_THRESHOLDS,
  type ApplicationHealthResult,
  type ReliabilityHealth,
  type ReliabilityIndicator,
  type SyncHealth,
} from "@/src/reliability/reliability";

export type FeedWarningView = {
  feed: string;
  code: string;
  message: string;
};

export type IntegrationReliabilityView = {
  integrationId: string;
  providerKey: string;
  displayName: string;
  type: string;
  /** Integration lifecycle status (CONNECTED/DEGRADED/ERROR/…). */
  status: string;
  /** Derived integration health (HEALTHY/DEGRADED/ERROR/UNKNOWN). */
  health: string;
  /** Combined reliability display state. */
  reliability: ReliabilityHealth;
  indicators: ReliabilityIndicator[];
  /** Phase 1D source freshness — reported separately, never collapsed. */
  freshness: SourceFreshness;
  intervalAssumed: boolean;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  consecutiveFailures: number;
  lastSyncError: string | null;
  sync: {
    latestStatus: string | null;
    latestStartedAt: string | null;
    latestFinishedAt: string | null;
    durationMs: number | null;
    recordsSeen: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    errorCode: string | null;
    errorSummary: string | null;
    lastSuccessfulAt: string | null;
    lastFailedAt: string | null;
    consecutiveFailedRuns: number;
  };
  feedWarnings: FeedWarningView[];
};

export type ReliabilityOverview = {
  application: ApplicationHealthResult;
  integrations: IntegrationReliabilityView[];
};

function parseFeedWarnings(metadata: string | null): FeedWarningView[] {
  if (!metadata) return [];
  try {
    const parsed = JSON.parse(metadata) as {
      feedWarnings?: { feed?: unknown; code?: unknown; message?: unknown }[];
    };
    if (!Array.isArray(parsed.feedWarnings)) return [];
    return parsed.feedWarnings
      .filter(
        (w): w is { feed: string; code: string; message: string } =>
          typeof w?.feed === "string" &&
          typeof w?.message === "string",
      )
      .map((w) => ({
        feed: w.feed,
        code: typeof w.code === "string" ? w.code : "FEED_WARNING",
        message: w.message.slice(0, 200),
      }));
  } catch {
    return [];
  }
}

function toSyncView(sync: SyncHealth) {
  return {
    latestStatus: sync.latestStatus,
    latestStartedAt: sync.latestStartedAt?.toISOString() ?? null,
    latestFinishedAt: sync.latestFinishedAt?.toISOString() ?? null,
    durationMs: sync.durationMs,
    recordsSeen: sync.recordsSeen,
    recordsCreated: sync.recordsCreated,
    recordsUpdated: sync.recordsUpdated,
    recordsFailed: sync.recordsFailed,
    errorCode: sync.errorCode,
    errorSummary: sync.errorSummary,
    lastSuccessfulAt: sync.lastSuccessfulAt?.toISOString() ?? null,
    lastFailedAt: sync.lastFailedAt?.toISOString() ?? null,
    consecutiveFailedRuns: sync.consecutiveFailedRuns,
  };
}

/** Cheap dependency probe — a single primary-key lookup, no scans. */
async function probeDatabase(organizationId: string): Promise<boolean> {
  try {
    const row = await db.orm.public.Organization.where({
      id: organizationId,
    })
      .select("id")
      .first();
    return row !== null;
  } catch {
    return false;
  }
}

/**
 * Organization-scoped reliability overview for the Settings surface.
 * Read-only, batched (integrations + bounded sync runs + bounded sync
 * events), gated by the existing integration read authorization.
 * Returns null when the user cannot read the organization.
 */
export async function getReliabilityOverviewForUser(
  userId: string,
  organizationId: string,
  now: Date = new Date(),
): Promise<ReliabilityOverview | null> {
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  if (!membership || !canReadIntegrations(membership.role)) return null;

  await connectDatabase();

  const [integrations, syncRuns, completedEvents, failedEvents, databaseReachable] =
    await Promise.all([
      db.orm.public.Integration.where({ organizationId }).all(),
      db.orm.public.IntegrationSyncRun.where({ organizationId })
        .orderBy((run) => run.startedAt.desc())
        .limit(RELIABILITY_THRESHOLDS.syncRunLookback)
        .all(),
      db.orm.public.IntegrationEvent.where({
        organizationId,
        kind: "SYNC_COMPLETED",
      })
        .orderBy((event) => event.createdAt.desc())
        .limit(RELIABILITY_THRESHOLDS.syncEventLookback)
        .all(),
      db.orm.public.IntegrationEvent.where({
        organizationId,
        kind: "SYNC_FAILED",
      })
        .orderBy((event) => event.createdAt.desc())
        .limit(RELIABILITY_THRESHOLDS.syncEventLookback)
        .all(),
      probeDatabase(organizationId),
    ]);

  // Merge sync events newest-first; first occurrence per integration wins.
  const syncEvents = [...completedEvents, ...failedEvents].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const runsByIntegration = new Map<string, typeof syncRuns>();
  for (const run of syncRuns) {
    const list = runsByIntegration.get(run.integrationId) ?? [];
    list.push(run);
    runsByIntegration.set(run.integrationId, list);
  }

  const feedWarningsByIntegration = new Map<
    string,
    FeedWarningView[]
  >();
  for (const event of syncEvents) {
    if (!event.integrationId) continue;
    if (feedWarningsByIntegration.has(event.integrationId)) continue;
    feedWarningsByIntegration.set(
      event.integrationId,
      parseFeedWarnings(event.metadata),
    );
  }

  const views: IntegrationReliabilityView[] = integrations.map(
    (integration) => {
      const runs = (runsByIntegration.get(integration.id) ?? []).map((run) => ({
        id: run.id,
        status: run.status,
        trigger: run.trigger,
        recordsSeen: run.recordsSeen,
        recordsCreated: run.recordsCreated,
        recordsUpdated: run.recordsUpdated,
        recordsFailed: run.recordsFailed,
        errorCode: run.errorCode,
        errorSummary: run.errorSummary,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      }));
      const sync = summarizeSyncRuns(runs);
      const latestRun = runs[0] ?? null;

      const expectedInterval = getProviderSyncIntervalMinutes(
        integration.providerKey,
      );
      const freshness = computeSourceFreshness({
        status: integration.status,
        lastSyncAt: integration.lastSyncAt,
        lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
        lastSyncError: integration.lastSyncError,
        consecutiveFailures: integration.consecutiveFailures,
        latestRunStatus: latestRun?.status ?? null,
        latestRunFinishedAt: latestRun?.finishedAt ?? null,
        expectedIntervalMinutes: expectedInterval,
        now,
      });

      const health = computeIntegrationHealth({
        status: integration.status as never,
        lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
        lastSyncError: integration.lastSyncError,
        consecutiveFailures: integration.consecutiveFailures,
      });

      const reliability = computeIntegrationReliability({
        status: integration.status,
        health,
        freshness: freshness.freshness,
        lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
        consecutiveFailures: integration.consecutiveFailures,
        lastSyncError: integration.lastSyncError,
        sync,
      });

      return {
        integrationId: integration.id,
        providerKey: integration.providerKey,
        displayName: integration.displayName,
        type: integration.type,
        status: integration.status,
        health,
        reliability: reliability.health,
        indicators: reliability.indicators,
        freshness: freshness.freshness,
        intervalAssumed: freshness.intervalAssumed,
        lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
        lastSuccessfulSyncAt:
          integration.lastSuccessfulSyncAt?.toISOString() ?? null,
        consecutiveFailures: integration.consecutiveFailures,
        lastSyncError: integration.lastSyncError,
        sync: toSyncView(sync),
        feedWarnings: feedWarningsByIntegration.get(integration.id) ?? [],
      };
    },
  );

  return {
    application: computeApplicationHealth({ databaseReachable }),
    integrations: views,
  };
}
