import type {
  ExternalEntityKind,
  IntegrationAuthKind,
  IntegrationType,
  SyncTrigger,
} from "./types.ts";
import type { IntegrationCredentialPayload } from "./auth.ts";
import type { NormalizedEntity } from "./normalize.ts";
import type { WebhookEnvelope } from "./webhooks.ts";
import type { OAuthTokens } from "./oauth.ts";
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

/**
 * Provider-neutral OAuth 2.0 handlers. A connector that supports the
 * authorization-code flow implements this contract; provider-specific
 * endpoints/credentials come from environment configuration inside the
 * adapter — never hardcoded.
 *
 * `isConfigured` must return false (rather than throw) when the provider's
 * OAuth app credentials are not present in the environment, so the UI can
 * show an honest "not configured" state.
 */
export type OAuthConnectorContext = {
  organizationId: string;
  integrationId: string;
  providerKey: string;
  config: Record<string, unknown>;
};

export type OAuthConnectorHandlers = {
  isConfigured(): boolean;
  buildAuthorizationUrl(input: {
    redirectUri: string;
    state: string;
    ctx: OAuthConnectorContext;
  }): string;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    ctx: OAuthConnectorContext;
    signal?: AbortSignal;
  }): Promise<OAuthTokens>;
  refreshToken(input: {
    refreshToken: string;
    ctx: OAuthConnectorContext;
    signal?: AbortSignal;
  }): Promise<OAuthTokens>;
  /** Best-effort provider-side revocation. Optional — local revocation always happens. */
  revokeToken?(input: {
    token: string;
    ctx: OAuthConnectorContext;
    signal?: AbortSignal;
  }): Promise<void>;
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

  oauth?: OAuthConnectorHandlers;
}
