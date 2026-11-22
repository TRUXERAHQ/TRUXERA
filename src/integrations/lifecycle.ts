import {
  INTEGRATION_STATUSES,
  type IntegrationStatus,
} from "./types.ts";

export const INTEGRATION_HEALTH_STATES = [
  "UNKNOWN",
  "HEALTHY",
  "DEGRADED",
  "ERROR",
] as const;
export type IntegrationHealth = (typeof INTEGRATION_HEALTH_STATES)[number];

const ALLOWED_TRANSITIONS: Record<IntegrationStatus, readonly IntegrationStatus[]> = {
  CONNECTING: ["CONNECTED", "ERROR", "DISCONNECTED"],
  CONNECTED: ["SYNCING", "DEGRADED", "ERROR", "DISCONNECTED"],
  SYNCING: ["CONNECTED", "DEGRADED", "ERROR", "DISCONNECTED"],
  DEGRADED: ["SYNCING", "CONNECTED", "ERROR", "DISCONNECTED"],
  ERROR: ["CONNECTING", "CONNECTED", "DISCONNECTED"],
  DISCONNECTED: ["CONNECTING"],
};

export function canTransitionIntegrationStatus(
  from: IntegrationStatus,
  to: IntegrationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function nextIntegrationStatus(
  current: IntegrationStatus,
  target: IntegrationStatus,
): IntegrationStatus {
  if (current === target) return current;
  if (!canTransitionIntegrationStatus(current, target)) {
    return current;
  }
  return target;
}

export function computeIntegrationHealth(input: {
  status: IntegrationStatus;
  lastSuccessfulSyncAt: Date | null;
  lastSyncError: string | null;
  consecutiveFailures: number;
}): IntegrationHealth {
  if (input.status === "DISCONNECTED") return "UNKNOWN";
  if (input.status === "ERROR") return "ERROR";
  if (input.consecutiveFailures >= 3 || input.lastSyncError) {
    return input.consecutiveFailures >= 3 ? "ERROR" : "DEGRADED";
  }
  if (input.status === "DEGRADED") return "DEGRADED";
  return input.lastSuccessfulSyncAt ? "HEALTHY" : "UNKNOWN";
}

export function isIntegrationStatusValue(
  value: unknown,
): value is IntegrationStatus {
  return INTEGRATION_STATUSES.includes(value as IntegrationStatus);
}
