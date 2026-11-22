import type {
  ExternalEntityKind,
  IntegrationAuthKind,
  IntegrationType,
  SyncTrigger,
} from "./types.ts";
import type { IntegrationCredentialPayload } from "./auth.ts";
import type { NormalizedEntity } from "./normalize.ts";
import type { WebhookEnvelope } from "./webhooks.ts";

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

export type FetchResult = {
  entities: NormalizedEntity[];
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
