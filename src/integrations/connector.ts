import type {
  ExternalEntityKind,
  IntegrationAuthKind,
  IntegrationType,
  SyncTrigger,
} from "./types.ts";
import type { IntegrationCredentialPayload } from "./auth.ts";
import type { NormalizedEntity } from "./normalize.ts";
import type { WebhookEnvelope } from "./webhooks.ts";
import type {
  SignalProvenance,
  SignalSubjectKind,
} from "./signals/types.ts";

export type ConnectorAuthScheme = {
  kinds: readonly IntegrationAuthKind[];
  requiresCredential: boolean;
};

export type ConnectorCapabilities = {
  entities: readonly ExternalEntityKind[];
  initialSync: boolean;
  incrementalSync: boolean;
  polling: boolean;
  webhooks: boolean;
};

export type ConnectorDescriptor = {
  key: string;
  displayName: string;
  type: IntegrationType;
  description?: string;
  auth: ConnectorAuthScheme;
  capabilities: ConnectorCapabilities;
};

export type ConnectionContext = {
  organizationId: string;
  integrationId: string;
  providerKey: string;
  config: Record<string, unknown>;
  credential: IntegrationCredentialPayload | null;
};

export type ConnectionCheck = {
  ok: boolean;
  detail?: string;
};

export type SyncContext = ConnectionContext & {
  trigger: SyncTrigger;
  cursor: string | null;
  signal?: AbortSignal;
};

/**
 * A vendor-neutral operational signal emitted by a connector during sync.
 * `subjectExternalId` is the provider-side identity; the sync pipeline
 * resolves it to a TRUXERA subject via linked ExternalRecords before
 * ingestion. Provider payload shapes never appear here.
 */
export type ConnectorSignal = {
  subjectKind: SignalSubjectKind;
  subjectExternalId: string;
  signalKind: string;
  value: unknown;
  provenance: SignalProvenance;
  sourceTimestamp: string;
  sequence?: number | null;
  eventId?: string | null;
  dedupeKey?: string | null;
};

/**
 * A non-fatal provider feed failure. The sync continues for all other
 * feeds; the warning is surfaced on the sync outcome so the run can be
 * recorded as partial rather than silently succeeding or failing whole.
 */
export type ConnectorFeedWarning = {
  feed: string;
  code: string;
  message: string;
};

export type FetchResult = {
  entities: NormalizedEntity[];
  signals?: ConnectorSignal[];
  warnings?: ConnectorFeedWarning[];
  nextCursor?: string | null;
};

export interface IntegrationConnector {
  readonly descriptor: ConnectorDescriptor;

  verifyConnection?(ctx: ConnectionContext): Promise<ConnectionCheck>;

  fetchChanges(ctx: SyncContext): Promise<FetchResult>;

  parseWebhook?(input: {
    rawBody: unknown;
    headers: Record<string, string>;
    ctx: ConnectionContext;
  }): WebhookEnvelope | null;
}
