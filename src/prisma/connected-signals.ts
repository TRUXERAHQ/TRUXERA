import { connectDatabase, db } from "./db";
import { getMembershipForUserInOrganization } from "./organization-data";
import { canReadIntegrations } from "@/src/integrations/policy";
import {
  classifyDataQuality,
  computeSourceFreshness,
  isSourceUnavailable,
  type ConnectedRecordState,
  type DataQuality,
  type SourceFreshness,
} from "@/src/integrations/connected-signals";
import { getProviderSyncIntervalMinutes } from "@/src/integrations/materialize/registry";

export type IntegrationSignalSummary = {
  integrationId: string;
  providerKey: string;
  displayName: string;
  status: string;
  freshness: SourceFreshness;
  intervalAssumed: boolean;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  linkedRecords: number;
  mappingFailedRecords: number;
  staleRecords: number;
};

export type ConnectedSignalsOverview = {
  records: Record<string, ConnectedRecordState>;
  integrations: IntegrationSignalSummary[];
};

type MappingOutcome = "MAPPED" | "MAPPING_FAILED";

function parseEventMetadata(
  metadata: string | null,
): { entityKind?: string; externalId?: string } {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function getConnectedSignalsOverview(
  userId: string,
  organizationId: string,
  now: Date = new Date(),
): Promise<ConnectedSignalsOverview | null> {
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  if (!membership || !canReadIntegrations(membership.role)) return null;

  await connectDatabase();

  const [integrations, syncRuns, externalRecords, mappedEvents, failedEvents, loads, deliveries] =
    await Promise.all([
      db.orm.public.Integration.where({ organizationId }).all(),
      db.orm.public.IntegrationSyncRun.where({ organizationId })
        .orderBy((run) => run.startedAt.desc())
        .limit(200)
        .all(),
      db.orm.public.ExternalRecord.where({ organizationId })
        .select(
          "id",
          "integrationId",
          "providerKey",
          "entityKind",
          "externalId",
          "internalKind",
          "internalId",
          "lastSyncedAt",
        )
        .all(),
      db.orm.public.IntegrationEvent.where({
        organizationId,
        kind: "EXTERNAL_RECORD_MAPPED",
      })
        .orderBy((event) => event.createdAt.desc())
        .limit(300)
        .all(),
      db.orm.public.IntegrationEvent.where({
        organizationId,
        kind: "EXTERNAL_RECORD_MAPPING_FAILED",
      })
        .orderBy((event) => event.createdAt.desc())
        .limit(300)
        .all(),
      db.orm.public.Load.where({ organizationId })
        .select("id", "customerName", "pickupAddress")
        .all(),
      db.orm.public.Delivery.where({ organizationId })
        .select("id", "destinationAddress")
        .all(),
    ]);

  const latestRunByIntegration = new Map<string, (typeof syncRuns)[number]>();
  for (const run of syncRuns) {
    if (!latestRunByIntegration.has(run.integrationId)) {
      latestRunByIntegration.set(run.integrationId, run);
    }
  }

  const integrationById = new Map(integrations.map((i) => [i.id, i]));

  // Latest mapping outcome per external record identity. Events arrive in
  // descending createdAt order, so the first occurrence wins.
  const mappingOutcomeByKey = new Map<string, MappingOutcome>();
  for (const event of [...mappedEvents, ...failedEvents].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )) {
    const meta = parseEventMetadata(event.metadata);
    if (!meta.externalId || !meta.entityKind || !event.integrationId) continue;
    const key = `${event.integrationId}|${meta.entityKind}|${meta.externalId}`;
    if (!mappingOutcomeByKey.has(key)) {
      mappingOutcomeByKey.set(
        key,
        event.kind === "EXTERNAL_RECORD_MAPPED" ? "MAPPED" : "MAPPING_FAILED",
      );
    }
  }

  const loadFields = new Map(
    loads.map((l) => [
      l.id,
      Boolean(l.customerName?.trim()) && Boolean(l.pickupAddress?.trim()),
    ]),
  );
  const deliveryFields = new Map(
    deliveries.map((d) => [d.id, Boolean(d.destinationAddress?.trim())]),
  );

  const records: Record<string, ConnectedRecordState> = {};
  const perIntegration = new Map<
    string,
    { linked: number; mappingFailed: number; stale: number; providerKey: string; displayName: string }
  >();

  for (const rec of externalRecords) {
    if (!rec.internalId || !rec.internalKind) continue;
    if (rec.internalKind !== "Load" && rec.internalKind !== "Delivery") continue;
    const integration = integrationById.get(rec.integrationId);
    if (!integration) continue; // cross-tenant / dangling link defense

    const expectedInterval = getProviderSyncIntervalMinutes(rec.providerKey);
    const latestRun = latestRunByIntegration.get(integration.id);
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

    const mappingKey = `${integration.id}|${rec.entityKind}|${rec.externalId}`;
    const latestMappingOutcome =
      mappingOutcomeByKey.get(mappingKey) ?? null;

    const requiredFieldsPresent =
      rec.internalKind === "Load"
        ? (loadFields.get(rec.internalId) ?? false)
        : (deliveryFields.get(rec.internalId) ?? false);

    const recordStale =
      rec.lastSyncedAt !== null &&
      now.getTime() - rec.lastSyncedAt.getTime() >
        freshness.intervalMinutes * 60000;

    const quality: DataQuality = classifyDataQuality({
      linked: true,
      sourceUnavailable: isSourceUnavailable(integration.status),
      latestMappingOutcome,
      recordLastSyncedAt: rec.lastSyncedAt,
      requiredFieldsPresent,
      freshness: freshness.freshness,
      intervalMinutes: freshness.intervalMinutes,
      now,
    });

    records[rec.internalId] = {
      internalKind: rec.internalKind,
      internalId: rec.internalId,
      providerKey: rec.providerKey,
      sourceName: integration.displayName,
      freshness: freshness.freshness,
      quality,
      lastSyncedAt: rec.lastSyncedAt?.toISOString() ?? null,
      lastSuccessfulSyncAt:
        integration.lastSuccessfulSyncAt?.toISOString() ?? null,
      intervalAssumed: freshness.intervalAssumed,
    };

    const agg = perIntegration.get(integration.id) ?? {
      linked: 0,
      mappingFailed: 0,
      stale: 0,
      providerKey: rec.providerKey,
      displayName: integration.displayName,
    };
    agg.linked += 1;
    if (quality === "MAPPING_FAILED") agg.mappingFailed += 1;
    if (recordStale || quality === "SOURCE_STALE") agg.stale += 1;
    perIntegration.set(integration.id, agg);
  }

  const integrationSummaries: IntegrationSignalSummary[] = integrations.map(
    (integration) => {
      const expectedInterval = getProviderSyncIntervalMinutes(
        integration.providerKey,
      );
      const latestRun = latestRunByIntegration.get(integration.id);
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
      const agg = perIntegration.get(integration.id);
      return {
        integrationId: integration.id,
        providerKey: integration.providerKey,
        displayName: integration.displayName,
        status: integration.status,
        freshness: freshness.freshness,
        intervalAssumed: freshness.intervalAssumed,
        lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
        lastSuccessfulSyncAt:
          integration.lastSuccessfulSyncAt?.toISOString() ?? null,
        linkedRecords: agg?.linked ?? 0,
        mappingFailedRecords: agg?.mappingFailed ?? 0,
        staleRecords: agg?.stale ?? 0,
      };
    },
  );

  return { records, integrations: integrationSummaries };
}
