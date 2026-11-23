import { db } from "./db";
import {
  checkUsageWithinLimit,
  integrationLimitErrorMessage,
  resolveBillingState,
  vehicleLimitErrorMessage,
  type BillingState,
} from "../billing/billing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BillingStore = { orm: Tx["orm"] };

export type LimitGateResult = { ok: true } | { ok: false; error: string };

/**
 * Resolves effective billing state (plan, terms, limits, entitlements)
 * for an organization inside any executor — pass `tx` inside a
 * transaction or `db` for reads. Organization-scoped by definition.
 */
export async function resolveOrgBillingState(
  store: BillingStore,
  organizationId: string,
): Promise<BillingState> {
  const subscription = await store.orm.public.BillingSubscription.where({
    organizationId,
  }).first();
  return resolveBillingState(subscription);
}

/**
 * Vehicle entitlement gate. Call INSIDE the write transaction after the
 * organization row is locked so concurrent creates serialize. Only
 * concrete numeric limits enforce; "unlimited"/"custom"/null pass.
 */
export async function assertVehicleSlotAvailable(
  store: BillingStore,
  organizationId: string,
): Promise<LimitGateResult> {
  const state = await resolveOrgBillingState(store, organizationId);
  const limit = state.limits.vehicles;
  if (typeof limit !== "number") return { ok: true };

  const usage = await store.orm.public.Truck.where({
    organizationId,
    deactivatedAt: null,
  }).aggregate((aggregate) => ({ total: aggregate.count() }));

  // Prospective check: adding one more active vehicle must stay within
  // the limit, so current usage at the limit already rejects.
  if (checkUsageWithinLimit(limit, usage.total + 1) === "EXCEEDED") {
    return {
      ok: false,
      error: vehicleLimitErrorMessage(state.planLabel, limit),
    };
  }
  return { ok: true };
}

/**
 * Integration entitlement gate. Counts integrations occupying an active
 * slot — every lifecycle status except DISCONNECTED. Call inside the
 * connection transaction after the organization row is locked.
 */
export async function assertIntegrationSlotAvailable(
  store: BillingStore,
  organizationId: string,
): Promise<LimitGateResult> {
  const state = await resolveOrgBillingState(store, organizationId);
  const limit = state.limits.integrations;
  if (typeof limit !== "number") return { ok: true };

  const rows = await store.orm.public.Integration.where({ organizationId })
    .select("status")
    .all();
  const active = rows.filter((row) => row.status !== "DISCONNECTED").length;

  if (checkUsageWithinLimit(limit, active + 1) === "EXCEEDED") {
    return {
      ok: false,
      error: integrationLimitErrorMessage(state.planLabel, limit),
    };
  }
  return { ok: true };
}
