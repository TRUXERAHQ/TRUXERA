import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyIntegrationError,
  IntegrationError,
  redactSecrets,
  toSafeIntegrationError,
} from "../src/integrations/errors.ts";
import {
  credentialHint,
  credentialMetadata,
  parseIntegrationCredentialInput,
  parseStoredCredential,
  serializeCredentialForStorage,
} from "../src/integrations/auth.ts";
import {
  createAesGcmCredentialCipher,
  IntegrationCredentialVault,
} from "../src/integrations/vault.ts";
import {
  getConnector,
  listConnectors,
  registerConnector,
  resetConnectorRegistry,
} from "../src/integrations/registry.ts";
import {
  normalizeBatch,
  normalizeEntityKind,
  requireExternalId,
  stableChecksum,
} from "../src/integrations/normalize.ts";
import { buildExternalKey, parseExternalKey } from "../src/integrations/identity.ts";
import {
  canTransitionIntegrationStatus,
  computeIntegrationHealth,
  nextIntegrationStatus,
} from "../src/integrations/lifecycle.ts";
import {
  assertWebhookStatusTransition,
  parseWebhookEnvelope,
  webhookPayloadHash,
} from "../src/integrations/webhooks.ts";
import { runIntegrationSync } from "../src/integrations/sync.ts";
import {
  canAdministerIntegrations,
  canReadIntegrations,
} from "../src/integrations/policy.ts";

const testCipher = () =>
  createAesGcmCredentialCipher(() => Buffer.alloc(32, 7));

test("integration errors classify provider failures into structured codes", () => {
  assert.equal(classifyIntegrationError({ status: 401, message: "no" }), "AUTHENTICATION_FAILED");
  assert.equal(classifyIntegrationError({ status: 403 }), "AUTHORIZATION_FAILED");
  assert.equal(classifyIntegrationError({ status: 429 }), "RATE_LIMITED");
  assert.equal(classifyIntegrationError({ status: 503 }), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyIntegrationError(new Error("socket hang up")), "NETWORK_FAILURE");
  assert.equal(classifyIntegrationError(new Error("duplicate key value")), "DUPLICATE_CONFLICT");
  assert.equal(classifyIntegrationError(new IntegrationError("MAPPING_FAILURE", "x")), "MAPPING_FAILURE");
  assert.equal(classifyIntegrationError(new Error("something odd")), "PROVIDER_ERROR");
});

test("error messages redact secrets before surfacing", () => {
  const redacted = redactSecrets("call failed with Bearer abcdef123456 and api_key=sk-live-99998888");
  assert.ok(!redacted.includes("abcdef123456"));
  assert.ok(!redacted.includes("sk-live-99998888"));
  const safe = toSafeIntegrationError(new Error("token=supersecretvalue123 failed"));
  assert.ok(!safe.message.includes("supersecretvalue123"));
});

test("credential input parsing validates each auth kind without leaking secrets", () => {
  assert.equal(parseIntegrationCredentialInput({ authKind: "API_KEY", apiKey: "short" }).ok, false);
  const apiKey = parseIntegrationCredentialInput({ authKind: "API_KEY", apiKey: "sk-test-abcdefghij" });
  assert.equal(apiKey.ok, true);
  assert.equal(apiKey.credential.kind, "API_KEY");

  const oauth = parseIntegrationCredentialInput({
    authKind: "OAUTH2",
    accessToken: "ya29.access-token-value",
    refreshToken: "refresh-value-here",
  });
  assert.equal(oauth.ok, true);

  const basic = parseIntegrationCredentialInput({
    authKind: "BASIC",
    username: "truxera",
    password: "correct-horse",
  });
  assert.equal(basic.ok, true);

  assert.equal(parseIntegrationCredentialInput({ authKind: "MAGIC" }).ok, false);
  assert.equal(parseIntegrationCredentialInput({ authKind: "BEARER_TOKEN", token: "tiny" }).ok, false);
});

test("credential metadata exposes only a hint, never the secret", () => {
  const credential = {
    kind: "API_KEY",
    apiKey: "sk-live-abcdef123456",
  };
  const metadata = credentialMetadata(credential);
  assert.equal(metadata.kind, "API_KEY");
  assert.equal(metadata.hint, "…3456");
  assert.ok(!JSON.stringify(metadata).includes("sk-live-abcdef123456"));
  assert.equal(credentialHint({ kind: "BEARER_TOKEN", token: "tok-xyz987" }), "…z987");
});

test("credential vault encrypts at rest and decrypts only server-side", async () => {
  const records = new Map();
  const repository = {
    async saveCredential(input) {
      records.set(input.integrationId, input);
    },
    async getCredential({ integrationId }) {
      return records.get(integrationId) ?? null;
    },
    async revokeCredential({ integrationId }) {
      const record = records.get(integrationId);
      if (record) records.set(integrationId, { ...record, revokedAt: new Date() });
    },
  };
  const vault = new IntegrationCredentialVault(repository, testCipher());
  const payload = { kind: "API_KEY", apiKey: "sk-super-secret-1234" };

  const metadata = await vault.storeCredential({
    organizationId: "org-1",
    integrationId: "int-1",
    credential: payload,
  });
  assert.equal(metadata.hint, "…1234");

  const stored = records.get("int-1");
  assert.ok(stored.ciphertext.startsWith("v1:"));
  assert.ok(!stored.ciphertext.includes("sk-super-secret-1234"));

  const retrieved = await vault.retrieveCredential({
    organizationId: "org-1",
    integrationId: "int-1",
  });
  assert.deepEqual(retrieved, payload);

  await vault.revokeCredential({ organizationId: "org-1", integrationId: "int-1" });
  await assert.rejects(
    vault.retrieveCredential({ organizationId: "org-1", integrationId: "int-1" }),
    (error) => error.code === "CREDENTIAL_UNAVAILABLE",
  );
});

test("stored credential serialization round-trips and rejects tampering", () => {
  const payload = { kind: "OAUTH2", accessToken: "token-abc-123", refreshToken: "ref-456" };
  const plaintext = serializeCredentialForStorage(payload);
  assert.deepEqual(parseStoredCredential(plaintext), payload);
  assert.throws(() => parseStoredCredential("not-json"), /could not be decoded/);
});

test("connector registry enforces unique provider keys", () => {
  resetConnectorRegistry();
  const connector = {
    descriptor: {
      key: "demo-tms",
      displayName: "Demo TMS",
      type: "TMS",
      auth: { kinds: ["API_KEY"], requiresCredential: true },
      capabilities: {
        entities: ["LOAD", "DELIVERY"],
        initialSync: true,
        incrementalSync: true,
        polling: true,
        webhooks: false,
      },
    },
    async fetchChanges() {
      return { entities: [] };
    },
  };
  registerConnector(connector);
  assert.equal(getConnector("demo-tms"), connector);
  assert.equal(listConnectors().length, 1);
  assert.throws(() => registerConnector(connector), /already registered/);
  assert.throws(
    () => registerConnector({ descriptor: { ...connector.descriptor, key: "Bad Key!" }, fetchChanges: connector.fetchChanges }),
    /lowercase alphanumeric/,
  );
  resetConnectorRegistry();
});

test("normalization maps provider payloads and captures per-record issues", () => {
  assert.equal(normalizeEntityKind("LOAD"), "LOAD");
  assert.throws(() => normalizeEntityKind("SPACESHIP"), /not a supported/);
  assert.equal(requireExternalId(" abc ", "LOAD"), "abc");
  assert.throws(() => requireExternalId("", "LOAD"), /missing a stable external id/);

  const mapper = {
    map(raw) {
      if (!raw.id) throw new IntegrationError("MAPPING_FAILURE", "no id");
      return {
        kind: "LOAD",
        externalId: String(raw.id),
        data: { reference: raw.reference },
      };
    },
  };
  const result = normalizeBatch("LOAD", [{ id: "L1", reference: "PO-1" }, { bad: true }, { id: "L2" }], mapper);
  assert.equal(result.entities.length, 2);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].index, 1);
});

test("external identity keys round-trip provider, kind, and id", () => {
  const key = buildExternalKey({ providerKey: "demo-tms", entityKind: "TRUCK", externalId: "T-9" });
  assert.deepEqual(parseExternalKey(key), {
    providerKey: "demo-tms",
    entityKind: "TRUCK",
    externalId: "T-9",
  });
  assert.throws(() => parseExternalKey("broken"), /malformed/);
  assert.throws(() => parseExternalKey("p::SPACESHIP::x"), /unsupported entity kind/);
});

test("lifecycle transitions and health computation stay honest", () => {
  assert.equal(canTransitionIntegrationStatus("DISCONNECTED", "CONNECTING"), true);
  assert.equal(canTransitionIntegrationStatus("DISCONNECTED", "CONNECTED"), false);
  assert.equal(nextIntegrationStatus("CONNECTED", "SYNCING"), "SYNCING");
  assert.equal(nextIntegrationStatus("DISCONNECTED", "CONNECTED"), "DISCONNECTED");

  const now = new Date();
  assert.equal(
    computeIntegrationHealth({ status: "CONNECTED", lastSuccessfulSyncAt: now, lastSyncError: null, consecutiveFailures: 0 }),
    "HEALTHY",
  );
  assert.equal(
    computeIntegrationHealth({ status: "CONNECTED", lastSuccessfulSyncAt: null, lastSyncError: "boom", consecutiveFailures: 1 }),
    "DEGRADED",
  );
  assert.equal(
    computeIntegrationHealth({ status: "CONNECTED", lastSuccessfulSyncAt: now, lastSyncError: null, consecutiveFailures: 5 }),
    "ERROR",
  );
  assert.equal(
    computeIntegrationHealth({ status: "DISCONNECTED", lastSuccessfulSyncAt: now, lastSyncError: null, consecutiveFailures: 0 }),
    "UNKNOWN",
  );
});

test("webhook envelopes validate identity fields and hash payloads deterministically", () => {
  const parsed = parseWebhookEnvelope({
    providerKey: "demo-tms",
    body: { id: "evt-1", type: "load.updated", entityId: "L-1" },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.envelope.externalEventId, "evt-1");
  assert.equal(parsed.envelope.eventType, "load.updated");
  assert.equal(webhookPayloadHash({ a: 1 }), webhookPayloadHash({ a: 1 }));
  assert.notEqual(webhookPayloadHash({ a: 1 }), webhookPayloadHash({ a: 2 }));

  assert.equal(parseWebhookEnvelope({ providerKey: "p", body: "str" }).ok, false);
  assert.equal(parseWebhookEnvelope({ providerKey: "p", body: { type: "x" } }).ok, false);

  assert.doesNotThrow(() => assertWebhookStatusTransition("RECEIVED", "PROCESSED"));
  assert.throws(() => assertWebhookStatusTransition("PROCESSED", "RECEIVED"), /cannot transition/);
});

function createMockBackend() {
  const runs = [];
  const records = new Map();
  const cursors = [];
  return {
    runs,
    records,
    cursors,
    backend: {
      async beginSyncRun(input) {
        const run = { id: `run-${runs.length + 1}`, ...input, status: "RUNNING" };
        runs.push(run);
        return run;
      },
      async finishSyncRun(input) {
        const run = runs.find((r) => r.id === input.runId);
        Object.assign(run, input, { status: input.status });
      },
      async upsertExternalRecord(input) {
        const key = `${input.providerKey}::${input.entityKind}::${input.externalId}`;
        const existing = records.get(key);
        if (!existing) {
          records.set(key, input);
          return { outcome: "created" };
        }
        if (existing.checksum === input.checksum) {
          return { outcome: "unchanged" };
        }
        records.set(key, input);
        return { outcome: "updated" };
      },
      async setSyncCursor(input) {
        cursors.push(input);
      },
    },
  };
}

test("sync orchestration upserts idempotently and records run state", async () => {
  resetConnectorRegistry();
  const { backend, runs, records, cursors } = createMockBackend();
  const connector = {
    descriptor: {
      key: "demo-tms",
      displayName: "Demo TMS",
      type: "TMS",
      auth: { kinds: ["API_KEY"], requiresCredential: false },
      capabilities: {
        entities: ["LOAD"],
        initialSync: true,
        incrementalSync: true,
        polling: true,
        webhooks: false,
      },
    },
    async fetchChanges() {
      return {
        entities: [
          { kind: "LOAD", externalId: "L-1", data: { reference: "PO-1" } },
          { kind: "LOAD", externalId: "L-2", data: { reference: "PO-2" } },
        ],
        nextCursor: "cursor-2",
      };
    },
  };

  const base = {
    connector,
    backend,
    organizationId: "org-1",
    integrationId: "int-1",
    providerKey: "demo-tms",
    config: {},
    credential: null,
    trigger: "INITIAL",
    cursor: null,
  };

  const first = await runIntegrationSync(base);
  assert.equal(first.status, "SUCCEEDED");
  assert.equal(first.recordsCreated, 2);
  assert.equal(records.size, 2);
  assert.equal(cursors.at(-1).cursor, "cursor-2");
  assert.equal(cursors.at(-1).status, "CONNECTED");

  const second = await runIntegrationSync({ ...base, cursor: "cursor-2" });
  assert.equal(second.recordsCreated, 0);
  assert.equal(second.recordsUpdated, 0);
  assert.equal(records.size, 2);
  assert.equal(runs.length, 2);
});

test("sync records partial failure without losing successful records", async () => {
  const { backend, records } = createMockBackend();
  const flakyBackend = {
    ...backend,
    async upsertExternalRecord(input) {
      if (input.externalId === "BAD") throw new Error("db exploded");
      return backend.upsertExternalRecord(input);
    },
  };
  const connector = {
    descriptor: {
      key: "flaky-tms",
      displayName: "Flaky",
      type: "TMS",
      auth: { kinds: [], requiresCredential: false },
      capabilities: {
        entities: ["LOAD"],
        initialSync: true,
        incrementalSync: false,
        polling: true,
        webhooks: false,
      },
    },
    async fetchChanges() {
      return {
        entities: [
          { kind: "LOAD", externalId: "OK-1", data: {} },
          { kind: "LOAD", externalId: "BAD", data: {} },
        ],
      };
    },
  };

  const outcome = await runIntegrationSync({
    connector,
    backend: flakyBackend,
    organizationId: "org-1",
    integrationId: "int-1",
    providerKey: "flaky-tms",
    config: {},
    credential: null,
    trigger: "MANUAL",
    cursor: null,
  });

  assert.equal(outcome.status, "PARTIAL");
  assert.equal(outcome.recordsCreated, 1);
  assert.equal(outcome.recordsFailed, 1);
  assert.equal(records.size, 1);
});

test("sync failure marks integration error state with a safe message", async () => {
  const { backend, runs, cursors } = createMockBackend();
  const connector = {
    descriptor: {
      key: "down-tms",
      displayName: "Down",
      type: "TMS",
      auth: { kinds: [], requiresCredential: false },
      capabilities: {
        entities: ["LOAD"],
        initialSync: true,
        incrementalSync: false,
        polling: true,
        webhooks: false,
      },
    },
    async fetchChanges() {
      throw new IntegrationError("AUTHENTICATION_FAILED", "bad api_key=sekrit123");
    },
  };

  const outcome = await runIntegrationSync({
    connector,
    backend,
    organizationId: "org-1",
    integrationId: "int-1",
    providerKey: "down-tms",
    config: {},
    credential: null,
    trigger: "SCHEDULED",
    cursor: null,
  });

  assert.equal(outcome.status, "FAILED");
  assert.equal(outcome.error.code, "AUTHENTICATION_FAILED");
  assert.ok(!outcome.error.message.includes("sekrit123"));
  assert.equal(runs[0].status, "FAILED");
  assert.equal(cursors.at(-1).status, "ERROR");
  assert.equal(cursors.at(-1).consecutiveFailures, 1);
});

test("sync records feed warnings as PARTIAL without failing the run", async () => {
  const { backend, runs, cursors } = createMockBackend();
  const connector = {
    descriptor: {
      key: "warn-tms",
      displayName: "Warn",
      type: "TMS",
      auth: { kinds: [], requiresCredential: false },
      capabilities: {
        entities: ["LOAD"],
        initialSync: true,
        incrementalSync: true,
        polling: true,
        webhooks: false,
      },
    },
    async fetchChanges() {
      return {
        entities: [{ kind: "LOAD", externalId: "OK-1", data: {} }],
        signals: [],
        warnings: [
          {
            feed: "hos-clocks",
            code: "AUTHORIZATION_FAILED",
            message: "Samsara denied access for HOS clocks (403).",
          },
        ],
        nextCursor: "cursor-9",
      };
    },
  };

  const outcome = await runIntegrationSync({
    connector,
    backend,
    organizationId: "org-1",
    integrationId: "int-1",
    providerKey: "warn-tms",
    config: {},
    credential: null,
    trigger: "SCHEDULED",
    cursor: null,
  });

  assert.equal(outcome.status, "PARTIAL");
  assert.equal(outcome.recordsCreated, 1);
  assert.equal(outcome.recordsFailed, 0);
  assert.equal(outcome.warnings.length, 1);
  assert.equal(outcome.warnings[0].feed, "hos-clocks");
  assert.equal(runs[0].status, "PARTIAL");
  assert.equal(runs[0].errorCode, "PARTIAL_FEED");
  // Cursor still advances: the stats feed itself succeeded.
  assert.equal(cursors.at(-1).cursor, "cursor-9");
  assert.equal(cursors.at(-1).status, "DEGRADED");
  assert.ok(cursors.at(-1).lastSyncError.includes("hos-clocks"));
});

test("integration administration is restricted to owner and admin roles", () => {
  assert.equal(canAdministerIntegrations("OWNER"), true);
  assert.equal(canAdministerIntegrations("ADMIN"), true);
  assert.equal(canAdministerIntegrations("DISPATCHER"), false);
  assert.equal(canAdministerIntegrations("DRIVER"), false);
  assert.equal(canAdministerIntegrations("VIEWER"), false);
  assert.equal(canAdministerIntegrations(null), false);
  assert.equal(canReadIntegrations("VIEWER"), true);
  assert.equal(canReadIntegrations(null), false);
});

test("stable checksums are deterministic regardless of key order", () => {
  assert.equal(
    stableChecksum({ a: 1, b: { x: 1, y: 2 } }),
    stableChecksum({ b: { y: 2, x: 1 }, a: 1 }),
  );
  assert.notEqual(stableChecksum({ a: 1 }), stableChecksum({ a: 2 }));
});
