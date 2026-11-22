# TRUXERA Integration Framework (V2 — Phase 1A)

TRUXERA is the intelligent fleet operations and recovery layer. External TMS,
ELD, GPS/telematics, and custom systems remain the customer's systems of
record. This framework connects to them, normalizes their operational data,
and feeds TRUXERA intelligence:

```
External System → Connector → Integration Framework → Normalized TRUXERA Data
→ TRUXERA Intelligence → TRUXERA API
```

Phase 1A ships the reusable framework only. No vendor connector is included.

## Architecture

```
src/integrations/           Pure framework (no vendor code, no DB imports)
  types.ts                  Enums-as-const: types, statuses, auth kinds, entity kinds
  errors.ts                 Structured error codes, classification, secret redaction
  auth.ts                   Credential payload parsing + non-secret metadata
  vault.ts                  CredentialCipher + IntegrationCredentialVault (AES-256-GCM)
  connector.ts              IntegrationConnector contract + contexts
  registry.ts               Connector registration/lookup (provider-keyed)
  normalize.ts              EntityMapper, normalizeBatch, checksums
  identity.ts               ExternalRef + stable external keys
  lifecycle.ts              Status transitions + health computation
  sync.ts                   runIntegrationSync orchestration (injectable backend)
  webhooks.ts               Webhook envelope validation, hashing, status rules
  policy.ts                 Role checks (OWNER/ADMIN administer, members read)

src/prisma/integration-data.ts   Org-scoped persistence + service functions
app/api/integrations/webhooks/[integrationId]/route.ts   Webhook boundary
```

## Connector contract

A connector implements `IntegrationConnector` (`src/integrations/connector.ts`):

- `descriptor` — `ConnectorDescriptor`: `key` (stable provider id, e.g.
  `motive-eld`), `displayName`, `type` (`TMS | ELD | GPS_TELEMATICS | OTHER`),
  `auth` scheme (`kinds`, `requiresCredential`), `capabilities`
  (`entities`, `initialSync`, `incrementalSync`, `polling`, `webhooks`).
- `verifyConnection(ctx)` — optional auth/health probe.
- `fetchChanges(ctx)` — returns `{ entities: NormalizedEntity[], nextCursor? }`.
  Receives `SyncContext` (org, integration, provider, config, credential,
  trigger, cursor, AbortSignal).
- `parseWebhook({rawBody, headers, ctx})` — optional; returns a
  `WebhookEnvelope` or `null`.

Register with `registerConnector(connector)` at server startup. Provider
specifics (payload shapes, auth flows, pagination) stay inside the connector
and its mappers — the core never sees vendor payloads.

## Normalized data model

`NormalizedEntity` (`normalize.ts`):

```ts
{ kind: ExternalEntityKind, externalId: string, data: Record<string, unknown>,
  externalUpdatedAt?: string | null }
```

`ExternalEntityKind`: `LOAD | DELIVERY | TRUCK | DRIVER | ASSIGNMENT | CUSTOMER`.

External identity is `providerKey + entityKind + externalId`, stored on
`ExternalRecord` with `@@unique([organizationId, providerKey, entityKind,
externalId])` — the idempotency anchor. `internalKind`/`internalId` link an
external record to a TRUXERA entity only when a connector maps it; nothing
overwrites V1 operational records automatically.

## Data ownership

- External systems own operational facts (loads, trucks, drivers, deliveries).
- TRUXERA owns intelligence: risk, recommendations, recovery decisions,
  impact, summaries. Connectors must never write those.

## Authentication & credentials

`IntegrationCredentialPayload` union: `API_KEY | OAUTH2 | BEARER_TOKEN | BASIC`.
`parseIntegrationCredentialInput` validates server-side input; secrets exist
only as plaintext transiently during store/retrieve.

Storage: `IntegrationCredential` holds `ciphertext` + `keyVersion` + `hint`
(last 4 chars) + `expiresAt` + `revokedAt`. The `IntegrationCredentialVault`
encrypts with AES-256-GCM via `INTEGRATION_CREDENTIALS_KEY` (32-byte base64;
any other length is SHA-256-derived). **Without that env var the vault
refuses to store secrets** — it never fake-encrypts. Production should move
to a managed KMS behind the same `CredentialCipher` interface.

Rules: credentials never appear in API responses, summaries, logs, or
client-visible data; `toSafeIntegrationError`/`redactSecrets` strip
bearer tokens and key-looking strings from error text.

## Sync model

`runIntegrationSync` (`sync.ts`) orchestrates over an injectable `SyncBackend`:

1. `beginSyncRun` → `IntegrationSyncRun` row (`RUNNING`, trigger, cursorBefore)
2. `connector.fetchChanges(ctx)` → normalized entities
3. per entity: `upsertExternalRecord` — create / update-on-checksum-change /
   unchanged (idempotent; safe to retry)
4. `finishSyncRun` → `SUCCEEDED | FAILED | PARTIAL` + counts + safe error
5. `setSyncCursor` → cursor, lastSyncAt, lastSuccessfulSyncAt, lastSyncError,
   consecutiveFailures, status (`CONNECTED | DEGRADED | ERROR`)

Triggers: `INITIAL | INCREMENTAL | MANUAL | SCHEDULED | WEBHOOK`. Provider
scheduling is connector-specific and not part of Phase 1A.

## Lifecycle & health

`IntegrationStatus`: `CONNECTING → CONNECTED → SYNCING → (DEGRADED | ERROR)`,
`DISCONNECTED` terminal-ish (reconnect via `CONNECTING`).
`computeIntegrationHealth` derives `UNKNOWN | HEALTHY | DEGRADED | ERROR`
from status, last successful sync, last error, and consecutive failures —
never a fake "connected" state.

## Webhooks

`POST /api/integrations/webhooks/{integrationId}` with header
`x-truxera-webhook-token` (compared to the integration's stored SHA-256 hash).
Body must contain a stable event id + type. `ingestWebhookForIntegration`
dedupes on `@@unique([organizationId, providerKey, externalEventId])`,
stores payload + SHA-256 hash, marks `PROCESSED | FAILED | IGNORED`, and
writes an `IntegrationEvent` audit row. Duplicates return 200 without
reprocessing.

## Auditability

`IntegrationEvent` records CONNECTED, DISCONNECTED, CONFIG_UPDATED,
CREDENTIAL_STORED/ROTATED/REVOKED, SYNC_STARTED/COMPLETED/FAILED,
WEBHOOK_RECEIVED/PROCESSED/FAILED with actor user id where applicable.

## Organization isolation

Every service function in `integration-data.ts` resolves the caller's
`Membership` for the target organization server-side; admin mutations
(`createIntegrationConnection`, `disconnectIntegration`,
`storeIntegrationCredential`) require OWNER/ADMIN. `organizationId` is never
authoritative from the client. Composite FKs
(`organizationId, integrationId`) make cross-tenant references impossible at
the schema level.

## Error model

`IntegrationErrorCode`: AUTHENTICATION_FAILED, AUTHORIZATION_FAILED,
RATE_LIMITED, NETWORK_FAILURE, PROVIDER_UNAVAILABLE, INVALID_PAYLOAD,
MAPPING_FAILURE, VALIDATION_FAILURE, DUPLICATE_CONFLICT, PROVIDER_ERROR,
NOT_CONNECTED, CONNECTOR_UNAVAILABLE, CREDENTIAL_UNAVAILABLE,
INTEGRATION_DISABLED. `classifyIntegrationError` maps HTTP statuses and
message patterns; `toSafeIntegrationError` redacts secrets and truncates.

## Adding the first real connector

1. Create `src/integrations/connectors/<provider>.ts` implementing
   `IntegrationConnector` with provider-specific auth, fetch, and mappers
   (`EntityMapper` + `normalizeBatch`).
2. `registerConnector(...)` during server startup (e.g. instrumentation or a
   server-only module imported by the data layer).
3. The connector emits `NormalizedEntity[]`; `runIntegrationSync` and the
   webhook route handle persistence, idempotency, cursors, and audit
   automatically.
4. Add connector-specific tests with mocked HTTP — no live provider needed.

## Current limitations (honest)

- No connector ships in Phase 1A; Settings → Integrations shows the honest
  empty state until one registers.
- `INTEGRATION_CREDENTIALS_KEY` must be set before credentials can be stored.
- Webhook processing marks events but does not yet apply entity changes —
  that arrives with the first connector.
- No scheduled sync runner yet; `runSyncForIntegration` supports MANUAL and
  is ready for SCHEDULED/WEBHOOK triggers.
