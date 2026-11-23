import type { IntegrationConnector, SyncContext, ConnectorSignal } from "./connector.ts";
import type { IntegrationCredentialPayload } from "./auth.ts";
import type { SyncTrigger } from "./types.ts";
import { IntegrationError, toSafeIntegrationError } from "./errors.ts";
import { stableChecksum } from "./normalize.ts";

export type SyncRunRecord = {
  id: string;
  trigger: SyncTrigger;
  cursorBefore: string | null;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";
};

export type UpsertedRecord = {
  outcome: "created" | "updated" | "unchanged";
  previousPayload?: string | null;
};

export type ChangedRecordRef = {
  entityKind: string;
  externalId: string;
  recordId: string;
  previousPayload: string | null;
};

export interface SyncBackend {
  beginSyncRun(input: {
    organizationId: string;
    integrationId: string;
    trigger: SyncTrigger;
    cursorBefore: string | null;
    initiatedByUserId?: string | null;
  }): Promise<SyncRunRecord>;

  finishSyncRun(input: {
    runId: string;
    status: "SUCCEEDED" | "FAILED" | "PARTIAL";
    cursorAfter: string | null;
    recordsSeen: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    errorCode?: string | null;
    errorSummary?: string | null;
  }): Promise<void>;

  upsertExternalRecord(input: {
    organizationId: string;
    integrationId: string;
    providerKey: string;
    entityKind: string;
    externalId: string;
    checksum: string;
    payload: Record<string, unknown>;
    externalUpdatedAt?: string | null;
  }): Promise<UpsertedRecord & { recordId?: string }>;

  setSyncCursor(input: {
    organizationId: string;
    integrationId: string;
    cursor: string | null;
    lastSyncAt: Date;
    lastSuccessfulSyncAt: Date | null;
    lastSyncError: string | null;
    consecutiveFailures: number;
    status: "CONNECTED" | "DEGRADED" | "ERROR" | "SYNCING";
  }): Promise<void>;
}

export type SyncOutcome = {
  runId: string;
  status: "SUCCEEDED" | "FAILED" | "PARTIAL";
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  error: { code: string; message: string } | null;
  changedRecords?: ChangedRecordRef[];
  signals?: ConnectorSignal[];
};

export async function runIntegrationSync(input: {
  connector: IntegrationConnector;
  backend: SyncBackend;
  organizationId: string;
  integrationId: string;
  providerKey: string;
  config: Record<string, unknown>;
  credential: IntegrationCredentialPayload | null;
  trigger: SyncTrigger;
  cursor: string | null;
  initiatedByUserId?: string | null;
  signal?: AbortSignal;
}): Promise<SyncOutcome> {
  const { connector, backend } = input;
  const startedAt = new Date();

  const run = await backend.beginSyncRun({
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    trigger: input.trigger,
    cursorBefore: input.cursor,
    initiatedByUserId: input.initiatedByUserId ?? null,
  });

  const ctx: SyncContext = {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    providerKey: input.providerKey,
    config: input.config,
    credential: input.credential,
    trigger: input.trigger,
    cursor: input.cursor,
    signal: input.signal,
  };

  try {
    const result = await connector.fetchChanges(ctx);

    let created = 0;
    let updated = 0;
    let failed = 0;
    const changedRecords: ChangedRecordRef[] = [];

    for (const entity of result.entities) {
      if (input.signal?.aborted) {
        throw new IntegrationError(
          "NETWORK_FAILURE",
          "Sync was aborted before completion.",
        );
      }
      try {
        const checksum = stableChecksum(entity.data);
        const upserted = await backend.upsertExternalRecord({
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          providerKey: input.providerKey,
          entityKind: entity.kind,
          externalId: entity.externalId,
          checksum,
          payload: entity.data,
          externalUpdatedAt: entity.externalUpdatedAt ?? null,
        });
        if (upserted.outcome === "created") created += 1;
        else if (upserted.outcome === "updated") updated += 1;
        if (
          (upserted.outcome === "created" || upserted.outcome === "updated") &&
          upserted.recordId
        ) {
          changedRecords.push({
            entityKind: entity.kind,
            externalId: entity.externalId,
            recordId: upserted.recordId,
            previousPayload: upserted.previousPayload ?? null,
          });
        }
      } catch {
        failed += 1;
      }
    }

    const recordsSeen = result.entities.length;
    const status =
      failed === 0 ? "SUCCEEDED" : recordsSeen === failed ? "FAILED" : "PARTIAL";
    const finishedAt = new Date();

    await backend.finishSyncRun({
      runId: run.id,
      status,
      cursorAfter: result.nextCursor ?? input.cursor,
      recordsSeen,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsFailed: failed,
      errorCode: status === "SUCCEEDED" ? null : "RECORD_FAILURES",
      errorSummary:
        status === "SUCCEEDED"
          ? null
          : `${failed} of ${recordsSeen} records failed to persist.`,
    });

    const lastError =
      status === "SUCCEEDED"
        ? null
        : `${failed} record(s) failed during sync.`;
    await backend.setSyncCursor({
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      cursor: result.nextCursor ?? input.cursor,
      lastSyncAt: finishedAt,
      lastSuccessfulSyncAt: status === "FAILED" ? null : finishedAt,
      lastSyncError: lastError,
      consecutiveFailures: status === "SUCCEEDED" ? 0 : 1,
      status: status === "FAILED" ? "ERROR" : status === "PARTIAL" ? "DEGRADED" : "CONNECTED",
    });

    return {
      runId: run.id,
      status,
      recordsSeen,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsFailed: failed,
      error: lastError ? { code: "RECORD_FAILURES", message: lastError } : null,
      changedRecords,
      signals: result.signals ?? [],
    };
  } catch (error) {
    const safe = toSafeIntegrationError(error);
    const finishedAt = new Date();
    await backend.finishSyncRun({
      runId: run.id,
      status: "FAILED",
      cursorAfter: input.cursor,
      recordsSeen: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errorCode: safe.code,
      errorSummary: safe.message,
    });
    await backend.setSyncCursor({
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      cursor: input.cursor,
      lastSyncAt: finishedAt,
      lastSuccessfulSyncAt: null,
      lastSyncError: safe.message,
      consecutiveFailures: 1,
      status: "ERROR",
    });
    void startedAt;
    return {
      runId: run.id,
      status: "FAILED",
      recordsSeen: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      error: { code: safe.code, message: safe.message },
    };
  }
}
