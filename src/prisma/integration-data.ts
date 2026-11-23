import { createHash, randomBytes } from "node:crypto";
import { connectDatabase, db } from "./db";
import { getMembershipForUserInOrganization } from "./organization-data";
import { isUuid } from "@/src/trucks/truck-policy";
import {
  canAdministerIntegrations,
  canReadIntegrations,
} from "@/src/integrations/policy";
import {
  IntegrationCredentialVault,
  createAesGcmCredentialCipher,
} from "@/src/integrations/vault";
import {
  parseIntegrationCredentialInput,
  type IntegrationCredentialPayload,
} from "@/src/integrations/auth";
import { getConnector, listConnectors } from "@/src/integrations/registry";
import { registerBuiltinConnectors } from "@/src/integrations/connectors";
import { runIntegrationSync, type SyncBackend } from "@/src/integrations/sync";
import {
  getOperationalMapper,
  registerOperationalMapper,
  registerProviderSyncInterval,
} from "@/src/integrations/materialize/registry";
import { mcleodOperationalMapper } from "@/src/integrations/materialize/mcleod";
import { materializeExternalRecords } from "@/src/integrations/materialize/materializer";
import {
  ingestConnectorSignals,
  ingestOperationalSignals,
  linkFleetEntities,
} from "./operational-signals";
import {
  SAMSARA_EXPECTED_SYNC_INTERVAL_MINUTES,
  SAMSARA_PROVIDER_KEY,
} from "@/src/integrations/connectors/samsara";
import { samsaraFleetEntityExtractor } from "@/src/integrations/connectors/samsara-normalize";
import { registerFleetEntityExtractor } from "@/src/integrations/signals/entity-link";
import { registerSignalPolicy } from "@/src/integrations/signals/policy";
import { createConnectedDataRepository } from "@/src/integrations/materialize/connected-data";
import { parseWebhookEnvelope, webhookPayloadHash } from "@/src/integrations/webhooks";
import { computeIntegrationHealth } from "@/src/integrations/lifecycle";
import { toSafeIntegrationError } from "@/src/integrations/errors";
import type { ConnectorDescriptor } from "@/src/integrations/connector";
import type { SyncTrigger } from "@/src/integrations/types";

registerBuiltinConnectors();
registerOperationalMapper("mcleod-track-and-trace", mcleodOperationalMapper);
registerProviderSyncInterval(
  SAMSARA_PROVIDER_KEY,
  SAMSARA_EXPECTED_SYNC_INTERVAL_MINUTES,
);
registerFleetEntityExtractor(SAMSARA_PROVIDER_KEY, samsaraFleetEntityExtractor);
for (const kind of [
  "VEHICLE_LOCATION",
  "VEHICLE_MOTION_STATE",
  "DRIVER_DUTY_STATUS",
]) {
  registerSignalPolicy(kind, {
    precedence: [SAMSARA_PROVIDER_KEY],
    maxSourceAgeMinutes: 60,
    preferFreshness: true,
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type OperationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const credentialVault = new IntegrationCredentialVault(
  {
    async saveCredential(input) {
      await connectDatabase();
      const existing = await db.orm.public.IntegrationCredential.where({
        integrationId: input.integrationId,
      }).first();
      if (existing) {
        await db.orm.public.IntegrationCredential.where({
          id: existing.id,
        }).update({
          authKind: input.authKind as never,
          ciphertext: input.ciphertext,
          keyVersion: input.keyVersion,
          hint: input.hint,
          expiresAt: input.expiresAt,
          revokedAt: null,
        });
        return;
      }
      await db.orm.public.IntegrationCredential.create({
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        authKind: input.authKind as never,
        ciphertext: input.ciphertext,
        keyVersion: input.keyVersion,
        hint: input.hint,
        expiresAt: input.expiresAt,
      });
    },
    async getCredential({ organizationId, integrationId }) {
      await connectDatabase();
      return db.orm.public.IntegrationCredential.where({
        organizationId,
        integrationId,
      }).first();
    },
    async revokeCredential({ organizationId, integrationId }) {
      await connectDatabase();
      await db.orm.public.IntegrationCredential.where({
        organizationId,
        integrationId,
      }).update({ revokedAt: new Date() });
    },
  },
  createAesGcmCredentialCipher(),
);

function parseJsonColumn(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function serializeJsonColumn(value: Record<string, unknown> | null | undefined) {
  return value && Object.keys(value).length > 0 ? JSON.stringify(value) : null;
}

async function recordIntegrationEvent(
  executor: Pick<Tx, "orm"> | typeof db,
  input: {
    organizationId: string;
    integrationId?: string | null;
    actorUserId?: string | null;
    kind: string;
    message?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  await executor.orm.public.IntegrationEvent.create({
    organizationId: input.organizationId,
    integrationId: input.integrationId ?? null,
    actorUserId: input.actorUserId ?? null,
    kind: input.kind as never,
    message: input.message ?? null,
    metadata: serializeJsonColumn(input.metadata ?? null),
  });
}

export type IntegrationSummary = {
  id: string;
  providerKey: string;
  displayName: string;
  type: string;
  status: string;
  authKind: string;
  health: string;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncError: string | null;
  recordsProcessed: number;
  recordsFailed: number;
  consecutiveFailures: number;
  linkedRecords: number;
  createdAt: string;
};

function toSummary(row: {
  id: string;
  providerKey: string;
  displayName: string;
  type: string;
  status: string;
  authKind: string;
  lastSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastSyncError: string | null;
  recordsProcessed: number;
  recordsFailed: number;
  consecutiveFailures: number;
  createdAt: Date;
}, linkedRecords = 0): IntegrationSummary {
  return {
    id: row.id,
    providerKey: row.providerKey,
    displayName: row.displayName,
    type: row.type,
    status: row.status,
    authKind: row.authKind,
    health: computeIntegrationHealth({
      status: row.status as never,
      lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
      lastSyncError: row.lastSyncError,
      consecutiveFailures: row.consecutiveFailures,
    }),
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastSyncError: row.lastSyncError,
    recordsProcessed: row.recordsProcessed,
    recordsFailed: row.recordsFailed,
    consecutiveFailures: row.consecutiveFailures,
    linkedRecords,
    createdAt: row.createdAt.toISOString(),
  };
}

async function countLinkedRecords(
  organizationId: string,
  integrationId: string,
): Promise<number> {
  await connectDatabase();
  const rows = await db.orm.public.ExternalRecord.where({
    organizationId,
    integrationId,
  })
    .select("internalId")
    .all();
  return rows.filter((row) => row.internalId !== null).length;
}

async function authorizeOrgRead(userId: string, organizationId: string) {
  if (!isUuid(organizationId)) return null;
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  if (!membership || !canReadIntegrations(membership.role)) return null;
  return membership;
}

async function authorizeOrgAdmin(userId: string, organizationId: string) {
  if (!isUuid(organizationId)) return null;
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  if (!membership || !canAdministerIntegrations(membership.role)) return null;
  return membership;
}

export async function listIntegrationsForOrganization(
  userId: string,
  organizationId: string,
): Promise<IntegrationSummary[]> {
  const membership = await authorizeOrgRead(userId, organizationId);
  if (!membership) return [];
  await connectDatabase();
  const rows = await db.orm.public.Integration.where({ organizationId })
    .orderBy((integration) => integration.createdAt.asc())
    .all();
  return Promise.all(
    rows.map(async (row) =>
      toSummary(row, await countLinkedRecords(organizationId, row.id)),
    ),
  );
}

export async function getIntegrationForOrganization(
  userId: string,
  organizationId: string,
  integrationId: string,
) {
  const membership = await authorizeOrgRead(userId, organizationId);
  if (!membership || !isUuid(integrationId)) return null;
  await connectDatabase();
  const row = await db.orm.public.Integration.where({
    organizationId,
    id: integrationId,
  }).first();
  return row
    ? toSummary(row, await countLinkedRecords(organizationId, row.id))
    : null;
}

export async function listConnectorCatalog() {
  return listConnectors().map((connector) => connector.descriptor);
}

export async function createIntegrationConnection(
  userId: string,
  organizationId: string,
  input: {
    providerKey: string;
    displayName?: string;
    config?: Record<string, unknown>;
    credential?: unknown;
  },
): Promise<OperationResult<IntegrationSummary>> {
  const membership = await authorizeOrgAdmin(userId, organizationId);
  if (!membership) {
    return {
      ok: false,
      error: "Only organization owners and admins can manage integrations.",
    };
  }

  const connector = getConnector(input.providerKey);
  if (!connector) {
    return {
      ok: false,
      error: `No connector is registered for provider "${input.providerKey}".`,
    };
  }
  const descriptor = connector.descriptor;

  let credential: IntegrationCredentialPayload | null = null;
  if (input.credential !== undefined && input.credential !== null) {
    const parsed = parseIntegrationCredentialInput(
      input.credential as Parameters<typeof parseIntegrationCredentialInput>[0],
    );
    if (!parsed.ok) return { ok: false, error: parsed.error };
    credential = parsed.credential;
    if (!descriptor.auth.kinds.includes(credential.kind)) {
      return {
        ok: false,
        error: `Provider "${descriptor.displayName}" does not support ${credential.kind} authentication.`,
      };
    }
  }
  if (descriptor.auth.requiresCredential && !credential) {
    return {
      ok: false,
      error: "This provider requires credentials before connecting.",
    };
  }

  await connectDatabase();

  const created = await db.transaction(async (tx) => {
    const organization = await tx.orm.public.Organization.where({
      id: organizationId,
    }).first();
    if (!organization) {
      return { ok: false as const, error: "The selected organization was not found." };
    }

    const displayName =
      typeof input.displayName === "string" && input.displayName.trim()
        ? input.displayName.trim().slice(0, 120)
        : descriptor.displayName;

    const row = await tx.orm.public.Integration.create({
      organizationId,
      providerKey: descriptor.key,
      displayName,
      type: descriptor.type as never,
      status: "CONNECTING",
      authKind: credential?.kind ?? (descriptor.auth.kinds[0] ?? "API_KEY"),
      config: serializeJsonColumn(input.config ?? null),
      capabilities: serializeJsonColumn({
        entities: descriptor.capabilities.entities,
        initialSync: descriptor.capabilities.initialSync,
        incrementalSync: descriptor.capabilities.incrementalSync,
        polling: descriptor.capabilities.polling,
        webhooks: descriptor.capabilities.webhooks,
      }),
      webhookTokenHash: descriptor.capabilities.webhooks
        ? createHash("sha256").update(randomBytes(32)).digest("hex")
        : null,
      createdByUserId: userId,
    });

    await recordIntegrationEvent(tx, {
      organizationId,
      integrationId: row.id,
      actorUserId: userId,
      kind: "CONNECTED",
      message: `Integration "${displayName}" connection initiated.`,
      metadata: { providerKey: descriptor.key, type: descriptor.type },
    });

    return {
      ok: true as const,
      value: toSummary(
        {
          ...row,
          lastSyncAt: null,
          lastSuccessfulSyncAt: null,
          lastSyncError: null,
          recordsProcessed: 0,
          recordsFailed: 0,
          consecutiveFailures: 0,
          createdAt: row.createdAt,
        },
        0,
      ),
    };
  });

  if (!created.ok) return created;

  if (credential) {
    try {
      await credentialVault.storeCredential({
        organizationId,
        integrationId: created.value.id,
        credential,
      });
      await recordIntegrationEvent(db, {
        organizationId,
        integrationId: created.value.id,
        actorUserId: userId,
        kind: "CREDENTIAL_STORED",
        message: "Integration credential stored.",
        metadata: { authKind: credential.kind },
      });
    } catch (error) {
      const safe = toSafeIntegrationError(error);
      await db.orm.public.Integration.where({ id: created.value.id }).update({
        status: "ERROR",
        lastSyncError: safe.message,
      });
      return { ok: false, error: safe.message };
    }
  }

  if (connector.verifyConnection) {
    try {
      const check = await connector.verifyConnection({
        organizationId,
        integrationId: created.value.id,
        providerKey: descriptor.key,
        config: input.config ?? {},
        credential,
      });
      await db.orm.public.Integration.where({ id: created.value.id }).update({
        status: check.ok ? "CONNECTED" : "ERROR",
        lastSyncError: check.ok ? null : (check.detail ?? "Connection check failed."),
      });
    } catch (error) {
      const safe = toSafeIntegrationError(error);
      await db.orm.public.Integration.where({ id: created.value.id }).update({
        status: "ERROR",
        lastSyncError: safe.message,
      });
    }
  } else {
    await db.orm.public.Integration.where({ id: created.value.id }).update({
      status: "CONNECTED",
    });
  }

  const refreshed = await getIntegrationForOrganization(
    userId,
    organizationId,
    created.value.id,
  );
  return { ok: true, value: refreshed ?? created.value };
}

export async function disconnectIntegration(
  userId: string,
  organizationId: string,
  integrationId: string,
): Promise<OperationResult<{ id: string }>> {
  const membership = await authorizeOrgAdmin(userId, organizationId);
  if (!membership || !isUuid(integrationId)) {
    return {
      ok: false,
      error: "Only organization owners and admins can manage integrations.",
    };
  }

  await connectDatabase();

  return db.transaction(async (tx) => {
    const integration = await tx.orm.public.Integration.where({
      organizationId,
      id: integrationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!integration) {
      return { ok: false, error: "Integration not found." };
    }
    if (integration.status === "DISCONNECTED") {
      return { ok: true, value: { id: integration.id } };
    }

    await tx.orm.public.Integration.where({ id: integration.id }).update({
      status: "DISCONNECTED",
      lastSyncError: null,
    });

    const credential = await tx.orm.public.IntegrationCredential.where({
      organizationId,
      integrationId: integration.id,
    }).first();
    if (credential) {
      await tx.orm.public.IntegrationCredential.where({ id: credential.id }).update({
        revokedAt: new Date(),
      });
      await recordIntegrationEvent(tx, {
        organizationId,
        integrationId: integration.id,
        actorUserId: userId,
        kind: "CREDENTIAL_REVOKED",
        message: "Integration credential revoked on disconnect.",
      });
    }

    await recordIntegrationEvent(tx, {
      organizationId,
      integrationId: integration.id,
      actorUserId: userId,
      kind: "DISCONNECTED",
      message: `Integration "${integration.displayName}" disconnected.`,
    });

    return { ok: true, value: { id: integration.id } };
  });
}

export async function storeIntegrationCredential(
  userId: string,
  organizationId: string,
  integrationId: string,
  credentialInput: unknown,
): Promise<OperationResult<{ hint: string | null }>> {
  const membership = await authorizeOrgAdmin(userId, organizationId);
  if (!membership || !isUuid(integrationId)) {
    return {
      ok: false,
      error: "Only organization owners and admins can manage integrations.",
    };
  }

  const parsed = parseIntegrationCredentialInput(
    credentialInput as Parameters<typeof parseIntegrationCredentialInput>[0],
  );
  if (!parsed.ok) return { ok: false, error: parsed.error };

  await connectDatabase();
  const integration = await db.orm.public.Integration.where({
    organizationId,
    id: integrationId,
  }).first();
  if (!integration || integration.status === "DISCONNECTED") {
    return { ok: false, error: "Integration not found or disconnected." };
  }

  const connector = getConnector(integration.providerKey);
  if (
    connector &&
    !connector.descriptor.auth.kinds.includes(parsed.credential.kind)
  ) {
    return {
      ok: false,
      error: `Provider "${connector.descriptor.displayName}" does not support ${parsed.credential.kind} authentication.`,
    };
  }

  try {
    const metadata = await credentialVault.storeCredential({
      organizationId,
      integrationId: integration.id,
      credential: parsed.credential,
    });
    await recordIntegrationEvent(db, {
      organizationId,
      integrationId: integration.id,
      actorUserId: userId,
      kind: "CREDENTIAL_ROTATED",
      message: "Integration credential stored.",
      metadata: { authKind: metadata.kind, hint: metadata.hint },
    });
    return { ok: true, value: { hint: metadata.hint } };
  } catch (error) {
    const safe = toSafeIntegrationError(error);
    return { ok: false, error: safe.message };
  }
}

const syncBackend: SyncBackend = {
  async beginSyncRun(input) {
    await connectDatabase();
    const run = await db.orm.public.IntegrationSyncRun.create({
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      trigger: input.trigger as never,
      status: "RUNNING",
      cursorBefore: input.cursorBefore,
      initiatedByUserId: input.initiatedByUserId ?? null,
    });
    return {
      id: run.id,
      trigger: run.trigger as SyncTrigger,
      cursorBefore: run.cursorBefore,
      status: "RUNNING",
    };
  },

  async finishSyncRun(input) {
    await connectDatabase();
    await db.orm.public.IntegrationSyncRun.where({ id: input.runId }).update({
      status: input.status as never,
      cursorAfter: input.cursorAfter,
      recordsSeen: input.recordsSeen,
      recordsCreated: input.recordsCreated,
      recordsUpdated: input.recordsUpdated,
      recordsFailed: input.recordsFailed,
      errorCode: input.errorCode ?? null,
      errorSummary: input.errorSummary ?? null,
      finishedAt: new Date(),
    });
  },

  async upsertExternalRecord(input) {
    await connectDatabase();
    const existing = await db.orm.public.ExternalRecord.where({
      organizationId: input.organizationId,
      providerKey: input.providerKey,
      entityKind: input.entityKind as never,
      externalId: input.externalId,
    }).first();

    if (!existing) {
      const created = await db.orm.public.ExternalRecord.create({
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        providerKey: input.providerKey,
        entityKind: input.entityKind as never,
        externalId: input.externalId,
        checksum: input.checksum,
        payload: JSON.stringify(input.payload),
        lastSyncedAt: new Date(),
      });
      return { outcome: "created", recordId: created.id, previousPayload: null };
    }

    if (existing.checksum === input.checksum) {
      await db.orm.public.ExternalRecord.where({ id: existing.id }).update({
        lastSyncedAt: new Date(),
      });
      return { outcome: "unchanged" };
    }

    await db.orm.public.ExternalRecord.where({ id: existing.id }).update({
      checksum: input.checksum,
      payload: JSON.stringify(input.payload),
      lastSyncedAt: new Date(),
    });
    return {
      outcome: "updated",
      recordId: existing.id,
      previousPayload: existing.payload,
    };
  },

  async setSyncCursor(input) {
    await connectDatabase();
    await db.orm.public.Integration.where({
      organizationId: input.organizationId,
      id: input.integrationId,
    }).update({
      syncCursor: input.cursor,
      lastSyncAt: input.lastSyncAt,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
      lastSyncError: input.lastSyncError,
      consecutiveFailures: input.consecutiveFailures,
      status: input.status as never,
    });
  },
};

export async function runSyncForIntegration(
  userId: string,
  organizationId: string,
  integrationId: string,
  trigger: SyncTrigger,
): Promise<OperationResult<{
  runId: string;
  status: string;
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
}>> {
  const membership = await authorizeOrgRead(userId, organizationId);
  if (!membership || !isUuid(integrationId)) {
    return { ok: false, error: "Integration not found." };
  }

  await connectDatabase();
  const integration = await db.orm.public.Integration.where({
    organizationId,
    id: integrationId,
  }).first();
  if (!integration || integration.status === "DISCONNECTED") {
    return { ok: false, error: "Integration not found or disconnected." };
  }

  const connector = getConnector(integration.providerKey);
  if (!connector) {
    return {
      ok: false,
      error: `No connector is registered for provider "${integration.providerKey}".`,
    };
  }

  let credential: IntegrationCredentialPayload | null = null;
  if (connector.descriptor.auth.requiresCredential) {
    try {
      credential = await credentialVault.retrieveCredential({
        organizationId,
        integrationId: integration.id,
      });
    } catch (error) {
      const safe = toSafeIntegrationError(error);
      return { ok: false, error: safe.message };
    }
  }

  const outcome = await runIntegrationSync({
    connector,
    backend: syncBackend,
    organizationId,
    integrationId: integration.id,
    providerKey: integration.providerKey,
    config: parseJsonColumn(integration.config),
    credential,
    trigger,
    cursor: integration.syncCursor,
    initiatedByUserId: userId,
  });

  const materialization = await materializeChangedRecords({
    organizationId,
    integrationId: integration.id,
    providerKey: integration.providerKey,
    changedRecords: outcome.changedRecords ?? [],
  });

  const fleetLinkRefs = (outcome.changedRecords ?? []).filter(
    (ref) =>
      (ref.entityKind === "TRUCK" || ref.entityKind === "DRIVER") &&
      typeof ref.recordId === "string",
  );
  const fleetLink =
    fleetLinkRefs.length > 0
      ? await linkFleetEntities({
          organizationId,
          integrationId: integration.id,
          providerKey: integration.providerKey,
          refs: fleetLinkRefs,
        }).catch((error) => ({
          error: toSafeIntegrationError(error).message,
        }))
      : null;

  // Connector-emitted operational signals resolve through the entity links
  // established above (new TRUCK/DRIVER records link in the same sync).
  let signalIngest = null;
  if (outcome.signals && outcome.signals.length > 0) {
    try {
      signalIngest = await ingestConnectorSignals({
        organizationId,
        integrationId: integration.id,
        providerKey: integration.providerKey,
        signals: outcome.signals,
      });
    } catch (error) {
      signalIngest = { error: toSafeIntegrationError(error).message };
    }
  }

  await db.orm.public.Integration.where({
    organizationId,
    id: integration.id,
  }).update({
    recordsProcessed: integration.recordsProcessed + outcome.recordsSeen,
    recordsFailed: integration.recordsFailed + outcome.recordsFailed,
  });

  await recordIntegrationEvent(db, {
    organizationId,
    integrationId: integration.id,
    actorUserId: userId,
    kind:
      outcome.status === "SUCCEEDED"
        ? "SYNC_COMPLETED"
        : "SYNC_FAILED",
    message: `Sync ${outcome.status.toLowerCase()}: ${outcome.recordsSeen} seen, ${outcome.recordsFailed} failed.`,
    metadata: {
      runId: outcome.runId,
      trigger,
      recordsSeen: outcome.recordsSeen,
      recordsCreated: outcome.recordsCreated,
      recordsUpdated: outcome.recordsUpdated,
      recordsFailed: outcome.recordsFailed,
      error: outcome.error,
      materialization,
      fleetLink,
      signalIngest,
    },
  });

  return { ok: true, value: outcome };
}

async function materializeChangedRecords(input: {
  organizationId: string;
  integrationId: string;
  providerKey: string;
  changedRecords: {
    entityKind: string;
    externalId: string;
    recordId: string;
    previousPayload: string | null;
  }[];
}): Promise<Record<string, unknown> | null> {
  if (input.changedRecords.length === 0) return null;
  const mapper = getOperationalMapper(input.providerKey);
  if (!mapper) return null;

  const refs = input.changedRecords
    .filter(
      (ref) =>
        (ref.entityKind === "LOAD" || ref.entityKind === "DELIVERY") &&
        typeof ref.recordId === "string",
    )
    .map((ref) => ({
      providerKey: input.providerKey,
      entityKind: ref.entityKind as "LOAD" | "DELIVERY",
      externalId: ref.externalId,
      recordId: ref.recordId,
      previousPayload: ref.previousPayload,
    }));

  if (refs.length === 0) return null;

  try {
    const result = await materializeExternalRecords({
      repository: createConnectedDataRepository(),
      mapper,
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      providerKey: input.providerKey,
      refs,
    });
    return { ...result };
  } catch (error) {
    const safe = toSafeIntegrationError(error);
    return { error: safe.message };
  }
}

export async function listSyncRunsForIntegration(
  userId: string,
  organizationId: string,
  integrationId: string,
  limit = 20,
) {
  const membership = await authorizeOrgRead(userId, organizationId);
  if (!membership || !isUuid(integrationId)) return [];
  await connectDatabase();
  const runs = await db.orm.public.IntegrationSyncRun.where({
    organizationId,
    integrationId,
  })
    .orderBy((run) => run.startedAt.desc())
    .limit(Math.min(Math.max(limit, 1), 100))
    .all();
  return runs.map((run) => ({
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    recordsSeen: run.recordsSeen,
    recordsCreated: run.recordsCreated,
    recordsUpdated: run.recordsUpdated,
    recordsFailed: run.recordsFailed,
    errorCode: run.errorCode,
    errorSummary: run.errorSummary,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  }));
}

export async function listIntegrationEventsForOrganization(
  userId: string,
  organizationId: string,
  integrationId?: string,
  limit = 50,
) {
  const membership = await authorizeOrgRead(userId, organizationId);
  if (!membership) return [];
  await connectDatabase();
  const base = db.orm.public.IntegrationEvent.where(
    integrationId && isUuid(integrationId)
      ? { organizationId, integrationId }
      : { organizationId },
  );
  const events = await base
    .orderBy((event) => event.createdAt.desc())
    .limit(Math.min(Math.max(limit, 1), 200))
    .all();
  return events.map((event) => ({
    id: event.id,
    integrationId: event.integrationId,
    actorUserId: event.actorUserId,
    kind: event.kind,
    message: event.message,
    metadata: parseJsonColumn(event.metadata),
    createdAt: event.createdAt.toISOString(),
  }));
}

export type WebhookIngestResult =
  | {
      ok: true;
      duplicate: boolean;
      status: string;
      signalsIngested?: {
        stored: number;
        duplicates: number;
        rejected: number;
      };
    }
  | { ok: false; status: number; error: string };

export async function ingestWebhookForIntegration(input: {
  integrationId: string;
  rawBody: unknown;
  headers: Record<string, string>;
}): Promise<WebhookIngestResult> {
  await connectDatabase();

  const integration = await db.orm.public.Integration.where({
    id: input.integrationId,
  }).first();
  if (!integration || integration.status === "DISCONNECTED") {
    return { ok: false, status: 404, error: "Unknown integration." };
  }

  const token = input.headers["x-truxera-webhook-token"] ?? "";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  if (
    !integration.webhookTokenHash ||
    tokenHash !== integration.webhookTokenHash
  ) {
    return { ok: false, status: 401, error: "Invalid webhook token." };
  }

  const parsed = parseWebhookEnvelope({
    providerKey: integration.providerKey,
    body: input.rawBody,
  });
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error };
  }
  const envelope = parsed.envelope;
  const payloadHash = webhookPayloadHash(envelope.payload);
  const serializedPayload = JSON.stringify(envelope.payload ?? null).slice(0, 65536);

  const existing = await db.orm.public.IntegrationWebhookEvent.where({
    organizationId: integration.organizationId,
    providerKey: integration.providerKey,
    externalEventId: envelope.externalEventId,
  }).first();

  if (existing) {
    return { ok: true, duplicate: true, status: existing.status };
  }

  const connector = getConnector(integration.providerKey);
  let eventStatus: import("@/src/integrations/types").WebhookStatus = "RECEIVED";
  let lastError: string | null = null;

  if (!connector?.parseWebhook) {
    eventStatus = "IGNORED";
    lastError = "No connector registered to process this event.";
  } else {
    try {
      const providerEnvelope = connector.parseWebhook({
        rawBody: input.rawBody,
        headers: input.headers,
        ctx: {
          organizationId: integration.organizationId,
          integrationId: integration.id,
          providerKey: integration.providerKey,
          config: parseJsonColumn(integration.config),
          credential: null,
        },
      });
      eventStatus = providerEnvelope ? "PROCESSED" : "IGNORED";
      if (!providerEnvelope) lastError = "Connector did not recognize the event.";
    } catch (error) {
      eventStatus = "FAILED";
      lastError = toSafeIntegrationError(error).message;
    }
  }

  await db.orm.public.IntegrationWebhookEvent.create({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    providerKey: integration.providerKey,
    eventType: envelope.eventType,
    externalEventId: envelope.externalEventId,
    payload: serializedPayload,
    payloadHash,
    status: eventStatus as never,
    attempts: 1,
    lastError,
    processedAt: new Date(),
  });


  await recordIntegrationEvent(db, {
    organizationId: integration.organizationId,
    integrationId: integration.id,
    kind:
      eventStatus === "PROCESSED"
        ? "WEBHOOK_PROCESSED"
        : eventStatus === "FAILED"
          ? "WEBHOOK_FAILED"
          : "WEBHOOK_RECEIVED",
    message: `Webhook event "${envelope.eventType}" ${eventStatus.toLowerCase()}.`,
    metadata: {
      externalEventId: envelope.externalEventId,
      entityKind: envelope.entityKind,
      entityExternalId: envelope.entityExternalId,
    },
  });

  // Vendor-neutral signal ingest: a webhook payload may carry a `signals`
  // array of operational signal inputs. No provider-specific parsing — each
  // entry is validated by the shared signal schema before storage.
  let signalsIngested: { stored: number; duplicates: number; rejected: number } | null = null;
  const payloadRecord =
    typeof envelope.payload === "object" && envelope.payload !== null
      ? (envelope.payload as Record<string, unknown>)
      : null;
  const nestedPayload =
    payloadRecord &&
    typeof payloadRecord["payload"] === "object" &&
    payloadRecord["payload"] !== null
      ? (payloadRecord["payload"] as Record<string, unknown>)
      : null;
  const signalBatch = Array.isArray(payloadRecord?.["signals"])
    ? payloadRecord["signals"]
    : Array.isArray(nestedPayload?.["signals"])
      ? nestedPayload["signals"]
      : null;
  if (signalBatch) {
    const outcomes = await ingestOperationalSignals({
      organizationId: integration.organizationId,
      integrationId: integration.id,
      providerKey: integration.providerKey,
      signals: signalBatch,
    });
    signalsIngested = {
      stored: outcomes.filter((o) => o.status === "stored").length,
      duplicates: outcomes.filter((o) => o.status === "duplicate").length,
      rejected: outcomes.filter((o) => o.status === "rejected").length,
    };
    if (signalsIngested.stored > 0 || signalsIngested.rejected > 0) {
      await recordIntegrationEvent(db, {
        organizationId: integration.organizationId,
        integrationId: integration.id,
        kind: "WEBHOOK_PROCESSED",
        message: `Ingested ${signalsIngested.stored} operational signal(s) from webhook.`,
        metadata: { signalsIngested },
      });
    }
  }

  return {
    ok: true,
    duplicate: false,
    status: eventStatus,
    ...(signalsIngested ? { signalsIngested } : {}),
  } as WebhookIngestResult;
}

export { listConnectors, type ConnectorDescriptor };
