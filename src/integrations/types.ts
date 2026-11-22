export const INTEGRATION_TYPES = [
  "TMS",
  "ELD",
  "GPS_TELEMATICS",
  "OTHER",
] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

export const INTEGRATION_STATUSES = [
  "CONNECTING",
  "CONNECTED",
  "SYNCING",
  "DEGRADED",
  "ERROR",
  "DISCONNECTED",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const INTEGRATION_AUTH_KINDS = [
  "API_KEY",
  "OAUTH2",
  "BEARER_TOKEN",
  "BASIC",
] as const;
export type IntegrationAuthKind = (typeof INTEGRATION_AUTH_KINDS)[number];

export const EXTERNAL_ENTITY_KINDS = [
  "LOAD",
  "DELIVERY",
  "TRUCK",
  "DRIVER",
  "ASSIGNMENT",
  "CUSTOMER",
] as const;
export type ExternalEntityKind = (typeof EXTERNAL_ENTITY_KINDS)[number];

export const SYNC_STATUSES = [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL",
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_TRIGGERS = [
  "INITIAL",
  "INCREMENTAL",
  "MANUAL",
  "SCHEDULED",
  "WEBHOOK",
] as const;
export type SyncTrigger = (typeof SYNC_TRIGGERS)[number];

export const INTEGRATION_EVENT_KINDS = [
  "CONNECTED",
  "DISCONNECTED",
  "CONFIG_UPDATED",
  "CREDENTIAL_STORED",
  "CREDENTIAL_ROTATED",
  "CREDENTIAL_REVOKED",
  "SYNC_STARTED",
  "SYNC_COMPLETED",
  "SYNC_FAILED",
  "WEBHOOK_RECEIVED",
  "WEBHOOK_PROCESSED",
  "WEBHOOK_FAILED",
] as const;
export type IntegrationEventKind = (typeof INTEGRATION_EVENT_KINDS)[number];

export const WEBHOOK_STATUSES = [
  "RECEIVED",
  "PROCESSED",
  "FAILED",
  "IGNORED",
] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export function isIntegrationType(value: unknown): value is IntegrationType {
  return INTEGRATION_TYPES.includes(value as IntegrationType);
}

export function isIntegrationStatus(
  value: unknown,
): value is IntegrationStatus {
  return INTEGRATION_STATUSES.includes(value as IntegrationStatus);
}

export function isIntegrationAuthKind(
  value: unknown,
): value is IntegrationAuthKind {
  return INTEGRATION_AUTH_KINDS.includes(value as IntegrationAuthKind);
}

export function isExternalEntityKind(
  value: unknown,
): value is ExternalEntityKind {
  return EXTERNAL_ENTITY_KINDS.includes(value as ExternalEntityKind);
}

export function isSyncTrigger(value: unknown): value is SyncTrigger {
  return SYNC_TRIGGERS.includes(value as SyncTrigger);
}
