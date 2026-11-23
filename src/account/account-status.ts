/**
 * Account lifecycle for the existing Organization tenant boundary.
 *
 * Pure, deterministic helpers — no database access. Account status is an
 * organizational lifecycle state, not a destructive operation: suspending an
 * account never deletes operational data.
 */

import { canAdministerOrganizationSettings } from "../settings/organization-settings.ts";

export type AccountStatus = "ACTIVE" | "SUSPENDED";

export const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  "ACTIVE",
  "SUSPENDED",
];

export const ACCOUNT_SUSPENDED_ERROR =
  "This organization's account is suspended. An owner or admin can reactivate it from Settings.";

/** Account lifecycle changes are restricted to OWNER/ADMIN, matching the
 * existing organization-settings authorization. No new role is introduced. */
export function canManageAccountStatus(
  role: string | null | undefined,
): boolean {
  return canAdministerOrganizationSettings(role);
}

export function isAccountStatus(value: unknown): value is AccountStatus {
  return value === "ACTIVE" || value === "SUSPENDED";
}

/** Only an explicitly ACTIVE account permits operational mutations.
 * Fails closed for any unexpected or missing status value. */
export function isAccountWritable(status: string | null | undefined): boolean {
  return status === "ACTIVE";
}

export type AccountStatusChangeResult =
  | { ok: true; target: AccountStatus }
  | { ok: false; error: string };

/**
 * Validates a requested status transition. Suspension requires an explicit
 * confirmation value; reactivation does not. Transitioning to the current
 * state is accepted as a no-op so retries are idempotent.
 */
export function parseAccountStatusChange(values: {
  status?: unknown;
  confirm?: unknown;
}): AccountStatusChangeResult {
  const status = typeof values.status === "string" ? values.status : "";
  if (!isAccountStatus(status)) {
    return { ok: false, error: "Select a valid account status." };
  }

  if (status === "SUSPENDED" && values.confirm !== "SUSPEND") {
    return {
      ok: false,
      error: "Suspending an account requires explicit confirmation.",
    };
  }

  return { ok: true, target: status };
}
