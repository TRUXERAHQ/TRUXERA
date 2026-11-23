"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  updateAccountStatusAction,
  updateOrganizationSettingsAction,
} from "./actions";
import {
  startBillingCheckoutAction,
  type CheckoutActionState,
} from "./billing-actions";
import {
  Badge,
  buttonDangerClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
  Notice,
  Panel,
} from "../ui";
import type { OnboardingView } from "@/src/onboarding/onboarding";
import type { AccountStatus } from "@/src/account/account-status";
import type { ReliabilityOverview } from "@/src/prisma/reliability-data";
import type { BillingOverview } from "@/src/prisma/billing-data";
import {
  BILLING_PLANS,
  ENTITLEMENT_LABELS,
  USAGE_LIMIT_LABELS,
} from "@/src/billing/billing";

const membershipRoles = [
  {
    role: "OWNER",
    description:
      "Full control of the organization, including workspace settings and administration.",
  },
  {
    role: "ADMIN",
    description:
      "Organization and fleet management, including workspace settings.",
  },
  {
    role: "DISPATCHER",
    description:
      "Day-to-day dispatch, loads, and fleet operations.",
  },
  {
    role: "DRIVER",
    description: "Driver-level access for assigned work.",
  },
  {
    role: "VIEWER",
    description: "Read-only access to organization data.",
  },
] as const;

type IntegrationListItem = {
  id: string;
  providerKey: string;
  displayName: string;
  type: string;
  status: string;
  health: string;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncError: string | null;
  recordsProcessed: number;
  recordsFailed: number;
  linkedRecords: number;
};

type ConnectorCatalogItem = {
  key: string;
  displayName: string;
  type: string;
  description?: string;
};

type AccountOverviewView = {
  owner: { name: string; email: string } | null;
  adminCount: number;
  memberCount: number;
  counts: {
    activeTrucks: number;
    drivers: number;
    loads: number;
    deliveries: number;
  };
  createdAt: string | null;
};

type SignalSummaryItem = {
  integrationId: string;
  providerKey: string;
  displayName: string;
  status: string;
  freshness: string;
  intervalAssumed: boolean;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  linkedRecords: number;
  linkedFleetEntities: number;
  mappingFailedRecords: number;
  staleRecords: number;
};

const plannedIntegrations = [
  "TMS Integration",
  "ELD Integration",
  "GPS & Telematics",
  "Automated Data Ingestion",
  "Real-Time Vehicle & Delivery Signals",
  "ETA & Delay Updates",
];

function formatRole(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm font-medium text-slate-800">
        {children}
      </dd>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-slate-500">
        {children}
      </dd>
    </div>
  );
}

function formatDurationMs(ms: number | null) {
  if (ms === null) return "In progress";
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem === 0 ? `${minutes}m` : `${minutes}m ${rem}s`;
}

function reliabilityTone(
  health: string,
): "success" | "warning" | "danger" | "neutral" {
  switch (health) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warning";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

function reliabilityLabel(health: string) {
  switch (health) {
    case "HEALTHY":
      return "Healthy";
    case "DEGRADED":
      return "Degraded";
    case "FAILED":
      return "Failed";
    case "NEVER_SYNCED":
      return "Never synced";
    case "DISCONNECTED":
      return "Disconnected";
    default:
      return formatRole(health);
  }
}

function freshnessTone(
  freshness: string,
): "success" | "warning" | "danger" | "neutral" {
  switch (freshness) {
    case "CURRENT":
      return "success";
    case "STALE":
      return "warning";
    case "SYNC_FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

function freshnessLabel(freshness: string) {
  switch (freshness) {
    case "CURRENT":
      return "Fresh";
    case "STALE":
      return "Stale";
    case "NEVER_SYNCED":
      return "Never synced";
    case "SYNC_FAILED":
      return "Sync failing";
    case "DISCONNECTED":
      return "Disconnected";
    default:
      return formatRole(freshness);
  }
}

function ReliabilitySection({
  reliability,
}: {
  reliability: ReliabilityOverview | null;
}) {
  return (
    <Panel
      title="System & Integrations Health"
      description="Operational reliability derived from live integration and sync records. Lifecycle status, sync health, and source freshness are reported separately."
    >
      {reliability ? (
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Application
            </p>
            <dl className="mt-2 space-y-2">
              <MetaRow label="Application">
                <Badge
                  tone={
                    reliability.application.status === "HEALTHY"
                      ? "success"
                      : reliability.application.status === "DEGRADED"
                        ? "warning"
                        : "danger"
                  }
                >
                  {reliability.application.status === "HEALTHY"
                    ? "Healthy"
                    : reliability.application.status === "DEGRADED"
                      ? "Degraded"
                      : "Unavailable"}
                </Badge>
              </MetaRow>
              <MetaRow label="Database">
                <Badge
                  tone={
                    reliability.application.checks.database === "HEALTHY"
                      ? "success"
                      : "danger"
                  }
                >
                  {reliability.application.checks.database === "HEALTHY"
                    ? "Healthy"
                    : "Unavailable"}
                </Badge>
              </MetaRow>
            </dl>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Integrations
            </p>
            {reliability.integrations.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No integrations connected.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {reliability.integrations.map((integration) => (
                  <li
                    key={integration.integrationId}
                    className="py-3 first:pt-2 last:pb-0"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {integration.displayName}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">
                          {integration.providerKey} ·{" "}
                          {formatRole(integration.type)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">
                          {formatRole(integration.status)}
                        </Badge>
                        <Badge tone={reliabilityTone(integration.reliability)}>
                          {reliabilityLabel(integration.reliability)}
                        </Badge>
                        <Badge tone={freshnessTone(integration.freshness)}>
                          {freshnessLabel(integration.freshness)}
                          {integration.intervalAssumed ? "*" : ""}
                        </Badge>
                      </div>
                    </div>

                    <dl className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                      <MetaRow label="Last successful sync">
                        {formatDate(integration.lastSuccessfulSyncAt)}
                      </MetaRow>
                      <MetaRow label="Latest sync">
                        {integration.sync.latestStatus
                          ? `${formatRole(integration.sync.latestStatus)} · ${formatDurationMs(integration.sync.durationMs)}`
                          : "No sync runs"}
                        {integration.sync.latestFinishedAt
                          ? ` · ${formatDate(integration.sync.latestFinishedAt)}`
                          : ""}
                      </MetaRow>
                      {integration.sync.latestStatus && (
                        <MetaRow label="Records">
                          {integration.sync.recordsSeen} seen ·{" "}
                          {integration.sync.recordsCreated} created ·{" "}
                          {integration.sync.recordsUpdated} updated
                          {integration.sync.recordsFailed > 0
                            ? ` · ${integration.sync.recordsFailed} failed`
                            : ""}
                        </MetaRow>
                      )}
                      {integration.consecutiveFailures > 0 && (
                        <MetaRow label="Consecutive failures">
                          {integration.consecutiveFailures}
                        </MetaRow>
                      )}
                    </dl>

                    {integration.indicators.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {integration.indicators.map((item) => (
                          <Badge key={item.code} tone="warning">
                            {item.label}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {integration.feedWarnings.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {integration.feedWarnings.map((warning, index) => (
                          <li
                            key={`${warning.feed}-${index}`}
                            className="text-xs text-amber-700"
                          >
                            {formatRole(warning.feed)} feed: {warning.message}
                          </li>
                        ))}
                      </ul>
                    )}

                    {(integration.sync.errorSummary ||
                      integration.lastSyncError) && (
                      <p className="mt-2 text-xs text-rose-700">
                        {integration.sync.errorSummary ??
                          integration.lastSyncError}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              * Freshness uses the provider&apos;s registered sync interval, or
              a 24-hour default when none is configured.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Reliability information is not available for this workspace.
        </p>
      )}
    </Panel>
  );
}

function formatPriceCents(cents: number | null): string | null {
  if (cents === null) return null;
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function usageLimitSuffix(limit: unknown): string {
  if (typeof limit === "number") return ` / ${limit}`;
  if (limit === "custom") return " / Custom";
  if (limit === "unlimited") return " · Unlimited";
  return "";
}

function CheckoutPlanOptions({
  organizationId,
  currentPlan,
}: {
  organizationId: string;
  currentPlan: string;
}) {
  const [state, action, pending] = useActionState<
    CheckoutActionState,
    FormData
  >(startBillingCheckoutAction, {});

  useEffect(() => {
    if (state.url) window.location.assign(state.url);
  }, [state.url]);

  return (
    <div className="space-y-3">
      {(["STARTER", "PROFESSIONAL"] as const).map((planKey) => {
        const plan = BILLING_PLANS[planKey];
        const isCurrent = currentPlan === planKey;
        return (
          <div
            key={planKey}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-slate-800">
                {plan.label}
                {isCurrent && (
                  <span className="ml-2 text-xs text-slate-400">
                    current plan
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500">{plan.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {(["MONTHLY", "ANNUAL"] as const).map((interval) => (
                <form key={interval} action={action}>
                  <input
                    type="hidden"
                    name="organizationId"
                    value={organizationId}
                  />
                  <input type="hidden" name="plan" value={planKey} />
                  <input type="hidden" name="interval" value={interval} />
                  <button
                    type="submit"
                    disabled={pending || isCurrent}
                    className={buttonSecondaryClass}
                  >
                    {interval === "MONTHLY" ? "Monthly" : "Annual"}
                  </button>
                </form>
              ))}
            </div>
          </div>
        );
      })}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <p className="text-xs text-slate-500">
        Checkout is processed securely by Stripe. Your subscription activates
        after payment is confirmed.
      </p>
    </div>
  );
}

function BillingSection({
  billing,
  organizationId,
  canAdminister,
  accountStatus,
  billingReturn,
}: {
  billing: BillingOverview | null;
  organizationId: string;
  canAdminister: boolean;
  accountStatus: AccountStatus;
  billingReturn: string | null;
}) {
  const monthly = billing ? formatPriceCents(billing.prices.monthlyCents) : null;
  const annual = billing ? formatPriceCents(billing.prices.annualCents) : null;
  const priceLabel = !billing
    ? null
    : billing.prices.custom
      ? billing.plan === "TRIAL"
        ? "Trial — no charge"
        : "Custom"
      : [
          monthly ? `${monthly}/month` : null,
          annual ? `${annual}/year billed annually` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <Panel
      title="Billing & Plan"
      description="Commercial plan, pricing, and entitlement state for this organization. Billing is informational in this release — no payment method is stored, no charges are made, and no billing provider is connected. Plan changes will be available in a future billing release."
    >
      {billing ? (
        <div className="space-y-5">
          {billingReturn === "checkout_success" && (
            <Notice tone="success">
              Checkout complete. Your subscription will update once Stripe
              confirms the payment — this usually takes a few seconds.
            </Notice>
          )}
          {billingReturn === "checkout_canceled" && (
            <Notice tone="info">
              Checkout was canceled. No changes were made to your plan.
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{billing.planLabel}</Badge>
            {billing.subscriptionStatusLabel && (
              <Badge
                tone={
                  billing.subscriptionStatus === "ACTIVE" ||
                  billing.subscriptionStatus === "TRIAL"
                    ? "success"
                    : billing.subscriptionStatus === "PAUSED"
                      ? "warning"
                      : "neutral"
                }
              >
                {billing.subscriptionStatusLabel}
              </Badge>
            )}
            {!billing.configured && (
              <Badge tone="neutral">Not configured</Badge>
            )}
          </div>

          <dl className="space-y-2.5">
            <MetaRow label="Plan">{billing.planLabel}</MetaRow>
            <MetaRow label="Price">{priceLabel ?? "Custom"}</MetaRow>
            <MetaRow label="Subscription">
              {billing.subscriptionStatusLabel ?? "Not configured"}
            </MetaRow>
            <MetaRow label="Trial">
              {billing.trialStartAt || billing.trialEndAt
                ? `${formatDate(billing.trialStartAt)} → ${formatDate(billing.trialEndAt)}`
                : "Not configured"}
            </MetaRow>
            <MetaRow label="Billing provider">
              {billing.providerConnected
                ? billing.providerKey ?? "Connected"
                : "None connected"}
            </MetaRow>
          </dl>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Features
            </p>
            <ul className="mt-2 space-y-1">
              {billing.entitlements.map((key) => (
                <li
                  key={key}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <span className="text-emerald-600" aria-hidden="true">
                    ✓
                  </span>
                  {ENTITLEMENT_LABELS[key]}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Usage
            </p>
            <dl className="mt-2 space-y-2">
              {(Object.keys(USAGE_LIMIT_LABELS) as (keyof typeof USAGE_LIMIT_LABELS)[]).map(
                (key) => (
                  <MetaRow key={key} label={USAGE_LIMIT_LABELS[key]}>
                    {billing.usage[key]}
                    {usageLimitSuffix(billing.limits[key])}
                  </MetaRow>
                ),
              )}
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              Active vehicle and integration limits are enforced by your
              plan. Other usage is informational.
            </p>
          </div>

          {billing.providerConnected &&
            canAdminister &&
            accountStatus === "ACTIVE" && (
              <div className="border-t border-slate-100 pt-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Plans
                </p>
                <div className="mt-2">
                  <CheckoutPlanOptions
                    organizationId={organizationId}
                    currentPlan={billing.plan}
                  />
                </div>
              </div>
            )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Billing information is not available for this workspace.
        </p>
      )}
    </Panel>
  );
}

function AccountStatusSection({
  organizationId,
  organizationName,
  accountStatus,
  account,
  canAdminister,
}: {
  organizationId: string;
  organizationName: string;
  accountStatus: AccountStatus;
  account: AccountOverviewView | null;
  canAdminister: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateAccountStatusAction,
    {},
  );
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const suspended = accountStatus === "SUSPENDED";

  return (
    <Panel
      title="Account status"
      description="Lifecycle state for this TRUXERA organization. Suspension is non-destructive — no fleet, load, delivery, integration, or history data is removed."
    >
      <div className="space-y-5">
        {suspended && (
          <Notice tone="danger">
            This account is suspended. Operational changes are blocked for
            all members. Read access to fleet and operational history is
            preserved.
          </Notice>
        )}

        <dl className="space-y-2.5">
          <MetaRow label="Organization">{organizationName}</MetaRow>
          <MetaRow label="Account status">
            <Badge tone={suspended ? "danger" : "success"}>
              {suspended ? "Suspended" : "Active"}
            </Badge>
          </MetaRow>
          {account && (
            <>
              <MetaRow label="Created">
                {formatDate(account.createdAt)}
              </MetaRow>
              <MetaRow label="Primary owner">
                {account.owner
                  ? `${account.owner.name} · ${account.owner.email}`
                  : "Not available"}
              </MetaRow>
              <MetaRow label="Administrative access">
                {account.adminCount} of {account.memberCount}{" "}
                {account.memberCount === 1 ? "member" : "members"} can
                administer this workspace
              </MetaRow>
              <MetaRow label="Fleet baseline">
                {account.counts.activeTrucks} active{" "}
                {account.counts.activeTrucks === 1 ? "truck" : "trucks"} ·{" "}
                {account.counts.drivers}{" "}
                {account.counts.drivers === 1 ? "driver" : "drivers"}
              </MetaRow>
              <MetaRow label="Operations">
                {account.counts.loads}{" "}
                {account.counts.loads === 1 ? "load" : "loads"} ·{" "}
                {account.counts.deliveries}{" "}
                {account.counts.deliveries === 1 ? "delivery" : "deliveries"}
              </MetaRow>
            </>
          )}
        </dl>

        {canAdminister ? (
          suspended ? (
            <form action={action}>
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
              <input type="hidden" name="status" value="ACTIVE" />
              <button
                type="submit"
                disabled={pending}
                className={buttonPrimaryClass}
              >
                {pending ? "Reactivating…" : "Reactivate account"}
              </button>
            </form>
          ) : confirmingSuspend ? (
            <form action={action} className="space-y-3">
              <input
                type="hidden"
                name="organizationId"
                value={organizationId}
              />
              <input type="hidden" name="status" value="SUSPENDED" />
              <input type="hidden" name="confirm" value="SUSPEND" />
              <Notice tone="warning">
                Suspending this account blocks operational changes for all
                members until it is reactivated. All trucks, drivers, loads,
                deliveries, integrations, and history are preserved.
              </Notice>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={pending}
                  className={buttonDangerClass}
                >
                  {pending ? "Suspending…" : "Confirm suspension"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingSuspend(false)}
                  className={buttonSecondaryClass}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setConfirmingSuspend(true)}
                className={buttonSecondaryClass}
              >
                Suspend account
              </button>
            </div>
          )
        ) : (
          <p className="text-xs text-slate-500">
            Only organization owners and admins can change the account status.
          </p>
        )}

        {state.error && <Notice tone="danger">{state.error}</Notice>}
      </div>
    </Panel>
  );
}

export default function SettingsSections({
  organizationId,
  organizationName,
  organizationSlug,
  organizationIdValue,
  timezone,
  timeZones,
  canAdminister,
  membershipRole,
  memberSince,
  userName,
  userEmail,
  integrations,
  signalSummaries,
  connectorCatalog,
  onboarding,
  canManageFleet,
  accountStatus,
  account,
  reliability,
  billing,
  billingReturn,
}: {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationIdValue: string;
  timezone: string;
  timeZones: string[];
  canAdminister: boolean;
  membershipRole: string;
  memberSince: string | null;
  userName: string | null;
  userEmail: string | null;
  integrations: IntegrationListItem[];
  signalSummaries: SignalSummaryItem[];
  connectorCatalog: ConnectorCatalogItem[];
  onboarding: OnboardingView | null;
  canManageFleet: boolean;
  accountStatus: AccountStatus;
  account: AccountOverviewView | null;
  reliability: ReliabilityOverview | null;
  billing: BillingOverview | null;
  billingReturn: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateOrganizationSettingsAction,
    {},
  );

  const organizationPanel = (
    <Panel
      title="Organization & Workspace"
      description="Core details for the TRUXERA workspace you are currently managing."
    >
      <div className="space-y-5">
        {canAdminister ? (
          <div>
            <label htmlFor="settings-org-name" className={labelClass}>
              Organization name
            </label>
            <input
              id="settings-org-name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              defaultValue={organizationName}
              className={inputClass}
            />
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Organization name
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              {organizationName}
            </p>
          </div>
        )}

        <dl className="space-y-2.5 border-t border-slate-100 pt-4">
          <MetaRow label="Workspace slug">
            <span className="font-mono text-xs">{organizationSlug}</span>
          </MetaRow>
          <MetaRow label="Organization ID">
            <span className="font-mono text-xs break-all">
              {organizationIdValue}
            </span>
          </MetaRow>
          <MetaRow label="Member since">{formatDate(memberSince)}</MetaRow>
          <MetaRow label="Your role">
            <span className="inline-flex items-center gap-2">
              <span className="font-medium text-slate-700">
                {formatRole(membershipRole)}
              </span>
              <Badge tone="info">Current</Badge>
            </span>
          </MetaRow>
        </dl>

        {!canAdminister && (
          <p className="text-xs text-slate-500">
            Only organization owners and admins can edit workspace settings.
          </p>
        )}
      </div>
    </Panel>
  );

  const preferencesPanel = (
    <Panel
      title="Operational Preferences"
      description="The operational timezone used by Daily Summary, Executive Report, and Operational History for day, week, and month boundaries."
    >
      {canAdminister ? (
        <div>
          <label htmlFor="settings-timezone" className={labelClass}>
            Operational timezone
          </label>
          <select
            id="settings-timezone"
            name="timezone"
            required
            defaultValue={timezone}
            className={inputClass}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Changes apply to all operational reporting for this organization.
          </p>
        </div>
      ) : (
        <dl>
          <DetailRow label="Operational timezone">{timezone}</DetailRow>
        </dl>
      )}
    </Panel>
  );

  return (
    <div className="mt-6 space-y-5">
      {canAdminister ? (
        <form action={action} className="space-y-5">
          <input type="hidden" name="organizationId" value={organizationId} />
          {organizationPanel}
          {preferencesPanel}

          {state.error && (
            <Notice tone="danger">{state.error}</Notice>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className={buttonPrimaryClass}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            <Link
              href={`/dashboard/settings?organizationId=${encodeURIComponent(organizationId)}`}
              className={buttonSecondaryClass}
            >
              Cancel
            </Link>
          </div>
        </form>
      ) : (
        <>
          {organizationPanel}
          {preferencesPanel}
        </>
      )}

      <AccountStatusSection
        organizationId={organizationId}
        organizationName={organizationName}
        accountStatus={accountStatus}
        account={account}
        canAdminister={canAdminister}
      />

      {onboarding && (
        <Panel
          title="Organization setup"
          description="Workspace readiness checklist. Derived from your organization's actual records — integrations are optional and never required for operations."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  onboarding.state === "READY"
                    ? "success"
                    : onboarding.state === "IN_PROGRESS"
                      ? "info"
                      : "neutral"
                }
              >
                {onboarding.state === "READY"
                  ? "Ready for operations"
                  : onboarding.state === "IN_PROGRESS"
                    ? "Setup in progress"
                    : "Not started"}
              </Badge>
              {onboarding.nextAction && canManageFleet && (
                <Link
                  href={onboarding.nextAction.href}
                  className={buttonPrimaryClass}
                >
                  {onboarding.nextAction.label}
                </Link>
              )}
            </div>

            <ul className="divide-y divide-slate-100">
              {onboarding.checks.map((check) => (
                <li
                  key={check.key}
                  className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      check.complete
                        ? "bg-emerald-100 text-emerald-700"
                        : check.required
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {check.complete ? "✓" : "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {check.label}
                      </p>
                      {!check.required && (
                        <Badge tone="neutral">Optional</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {check.description}
                    </p>
                    {check.category === "INTEGRATION_READINESS" &&
                      integrations.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {integrations.map((integration) => (
                            <li
                              key={integration.id}
                              className="text-xs text-slate-500"
                            >
                              {integration.displayName} ·{" "}
                              {formatRole(integration.status)} · health{" "}
                              {formatRole(integration.health)}
                              {integration.lastSyncAt
                                ? ` · last sync ${formatDate(integration.lastSyncAt)}`
                                : " · never synced"}
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                </li>
              ))}
            </ul>

            {onboarding.state === "READY" ? (
              <p className="border-t border-slate-100 pt-3 text-sm text-slate-600">
                All required setup checks are complete. TRUXERA is ready for
                day-to-day fleet operations.
              </p>
            ) : onboarding.nextAction ? (
              <p className="border-t border-slate-100 pt-3 text-sm text-slate-600">
                Next step:{" "}
                {canManageFleet ? (
                  <Link
                    href={onboarding.nextAction.href}
                    className="font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {onboarding.nextAction.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-700">
                    {onboarding.nextAction.label}
                  </span>
                )}{" "}
                — your role can view this checklist; fleet changes require a
                dispatcher, admin, or owner role.
              </p>
            ) : null}
          </div>
        </Panel>
      )}

      <Panel
        title="Roles & Permissions"
        description="Membership roles currently supported by TRUXERA."
      >
        <ul className="divide-y divide-slate-100">
          {membershipRoles.map((item) => (
            <li
              key={item.role}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {formatRole(item.role)}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">
                  {item.description}
                </p>
              </div>
              {item.role === membershipRole && (
                <Badge tone="info" className="mt-2 shrink-0 sm:mt-0">
                  Your role
                </Badge>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Member invitations and role management are not yet available in V1.
        </p>
      </Panel>

      <Panel
        title="Integrations"
        description="Connect your fleet systems. TRUXERA connects to external TMS, ELD, and telematics providers and normalizes their data for fleet intelligence — your existing systems remain the source of record."
      >
        {integrations.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {integrations.map((integration) => {
              const signal = signalSummaries.find(
                (entry) => entry.integrationId === integration.id,
              );
              return (
              <li
                key={integration.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {integration.displayName}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    {integration.providerKey} · {formatRole(integration.type)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {integration.recordsProcessed} records processed
                    {integration.recordsFailed > 0
                      ? ` · ${integration.recordsFailed} failed`
                      : ""}
                    {integration.linkedRecords > 0
                      ? ` · ${integration.linkedRecords} operational records linked`
                      : ""}
                    {" · "}Last sync {formatDate(integration.lastSyncAt)}
                  </p>
                  {signal && (
                    <p className="mt-1 text-xs text-slate-500">
                      Data source: {formatRole(signal.freshness)}
                      {signal.intervalAssumed ? " (default interval)" : ""}
                      {signal.linkedFleetEntities > 0
                        ? ` · ${signal.linkedFleetEntities} fleet ${signal.linkedFleetEntities === 1 ? "entity" : "entities"} linked`
                        : ""}
                      {signal.mappingFailedRecords > 0
                        ? ` · ${signal.mappingFailedRecords} mapping failure${signal.mappingFailedRecords === 1 ? "" : "s"}`
                        : ""}
                      {signal.staleRecords > 0
                        ? ` · ${signal.staleRecords} stale record${signal.staleRecords === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  )}
                  {integration.lastSyncError && (
                    <p className="mt-1 text-xs text-amber-700">
                      {integration.lastSyncError}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={integration.health === "HEALTHY" ? "success" : integration.health === "ERROR" ? "danger" : "neutral"}>
                    {formatRole(integration.health)}
                  </Badge>
                  <Badge tone="neutral">{formatRole(integration.status)}</Badge>
                </div>
              </li>
              );
            })}
          </ul>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-800">
              Connect your fleet systems
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              The TRUXERA integration framework is in place. TMS, ELD, GPS &amp;
              telematics, and custom-system connectors are being prepared — no
              provider connections are available yet.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {plannedIntegrations.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-600"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              No integrations are connected yet. When a connector is released,
              credentials are stored encrypted server-side and never exposed to
              the browser.
            </p>
          </div>
        )}
        {connectorCatalog.length > 0 && integrations.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Available connectors: {connectorCatalog.map((c) => c.displayName).join(", ")}
          </p>
        )}
      </Panel>

      <ReliabilitySection reliability={reliability} />

      <BillingSection
        billing={billing}
        organizationId={organizationId}
        canAdminister={canAdminister}
        accountStatus={accountStatus}
        billingReturn={billingReturn}
      />

      <Panel
        title="Notifications"
        description="Operational alerting preferences."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Coming soon</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Notification preferences will be introduced as TRUXERA&apos;s
          operational alerting capabilities expand. No notification settings
          are stored yet.
        </p>
      </Panel>

      <Panel
        title="Account"
        description="Your personal TRUXERA account, separate from organization settings."
      >
        <dl className="space-y-3">
          <DetailRow label="Name">{userName ?? "Not available"}</DetailRow>
          <DetailRow label="Email">{userEmail ?? "Not available"}</DetailRow>
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Link
            href={`/dashboard/account?organizationId=${encodeURIComponent(organizationId)}`}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Manage account →
          </Link>
        </div>
      </Panel>
    </div>
  );
}
