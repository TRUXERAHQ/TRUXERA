"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  updateAccountStatusAction,
  updateOrganizationSettingsAction,
} from "./actions";
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
import ThemeSelector from "./theme-selector";
import type { OnboardingView } from "@/src/onboarding/onboarding";
import type { AccountStatus } from "@/src/account/account-status";
import type { ReliabilityOverview } from "@/src/prisma/reliability-data";

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
  oauthAvailable?: boolean;
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

function integrationPurposeLabel(type: string) {
  switch (type) {
    case "TMS":
      return "TMS / Track & Trace";
    case "GPS_TELEMATICS":
      return "ELD / Telematics";
    default:
      return formatRole(type);
  }
}

function connectionStatusBadge(status: string | null) {
  switch (status) {
    case "CONNECTED":
      return { tone: "success" as const, label: "Connected" };
    case "CONNECTING":
      return { tone: "info" as const, label: "Connecting" };
    case "SYNCING":
      return { tone: "info" as const, label: "Syncing" };
    case "DEGRADED":
      return { tone: "warning" as const, label: "Degraded" };
    case "ERROR":
      return { tone: "danger" as const, label: "Error" };
    case "DISCONNECTED":
      return { tone: "neutral" as const, label: "Disconnected" };
    default:
      return { tone: "warning" as const, label: "Pending" };
  }
}

function syncHealthBadge(health: string) {
  switch (health) {
    case "HEALTHY":
      return { tone: "success" as const, label: "Healthy" };
    case "DEGRADED":
      return { tone: "warning" as const, label: "Degraded" };
    case "ERROR":
      return { tone: "danger" as const, label: "Error" };
    default:
      return { tone: "neutral" as const, label: formatRole(health) };
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
  connectorCatalog,
  onboarding,
  canManageFleet,
  accountStatus,
  account,
  reliability,
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
  connectorCatalog: ConnectorCatalogItem[];
  onboarding: OnboardingView | null;
  canManageFleet: boolean;
  accountStatus: AccountStatus;
  account: AccountOverviewView | null;
  reliability: ReliabilityOverview | null;
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

      <Panel
        title="Appearance"
        description="Choose the TRUXERA visual theme. Your selection applies instantly and is remembered on this device."
      >
        <ThemeSelector />
      </Panel>

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
        title="Connections"
        description="External provider connections for this workspace. TRUXERA connects to TMS, ELD, and telematics providers and normalizes their data for fleet intelligence — your existing systems remain the source of record. Credentials are stored encrypted server-side and never exposed here."
      >
        {connectorCatalog.length > 0 ? (
          <ul className="space-y-3">
            {connectorCatalog.map((connector) => {
              const integration = integrations.find(
                (item) => item.providerKey === connector.key,
              );
              const connection = connectionStatusBadge(
                integration?.status ?? null,
              );
              const syncHealth = integration
                ? syncHealthBadge(integration.health)
                : null;
              return (
                <li
                  key={connector.key}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {connector.displayName}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-slate-600">
                        {integrationPurposeLabel(connector.type)}
                      </p>
                      {connector.description && (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {connector.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={connection.tone}>
                        {connection.label}
                      </Badge>
                      {syncHealth && (
                        <Badge tone={syncHealth.tone}>
                          Sync: {syncHealth.label}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {integration ? (
                    <>
                      <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
                        <MetaRow label="Last successful sync">
                          {formatDate(integration.lastSuccessfulSyncAt)}
                        </MetaRow>
                        <MetaRow label="Last sync">
                          {formatDate(integration.lastSyncAt)}
                        </MetaRow>
                        <MetaRow label="Records">
                          {integration.recordsProcessed} processed
                          {integration.recordsFailed > 0
                            ? ` · ${integration.recordsFailed} failed`
                            : ""}
                          {integration.linkedRecords > 0
                            ? ` · ${integration.linkedRecords} operational records linked`
                            : ""}
                        </MetaRow>
                        <MetaRow label="Connection">
                          {formatRole(integration.status)}
                        </MetaRow>
                      </dl>
                      {integration.lastSyncError && (
                        <p className="mt-2 text-xs text-rose-700">
                          Last sync error: {integration.lastSyncError}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                      Pending — no active connection. Provider credentials and
                      approval are required before TRUXERA can sync. Status will
                      update here once the connection is established.
                    </p>
                  )}

                  {canAdminister &&
                    connector.oauthAvailable &&
                    (!integration ||
                      integration.status === "DISCONNECTED" ||
                      integration.status === "ERROR") && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <Link
                          href={`/api/integrations/oauth/${connector.key}/start?organizationId=${encodeURIComponent(organizationId)}`}
                          className={buttonSecondaryClass}
                        >
                          {integration
                            ? "Reconnect"
                            : `Connect with ${connector.displayName}`}
                        </Link>
                      </div>
                    )}
                </li>
              );
            })}
          </ul>
        ) : integrations.length === 0 ? (
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
          </div>
        ) : null}

        {(() => {
          const catalogKeys = new Set(
            connectorCatalog.map((connector) => connector.key),
          );
          const otherIntegrations = integrations.filter(
            (integration) => !catalogKeys.has(integration.providerKey),
          );
          return otherIntegrations.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {otherIntegrations.map((integration) => (
                <li
                  key={integration.id}
                  className="flex flex-col gap-2 py-3 first:pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {integration.displayName}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      {integration.providerKey} ·{" "}
                      {formatRole(integration.type)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {integration.recordsProcessed} records processed
                      {integration.recordsFailed > 0
                        ? ` · ${integration.recordsFailed} failed`
                        : ""}
                      {" · "}Last sync {formatDate(integration.lastSyncAt)}
                    </p>
                    {integration.lastSyncError && (
                      <p className="mt-1 text-xs text-amber-700">
                        {integration.lastSyncError}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      tone={
                        integration.health === "HEALTHY"
                          ? "success"
                          : integration.health === "ERROR"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {formatRole(integration.health)}
                    </Badge>
                    <Badge tone="neutral">
                      {formatRole(integration.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : null;
        })()}
      </Panel>

      <ReliabilitySection reliability={reliability} />

      <Panel
        title="Billing & Plans"
        description="Plan, subscription, usage, and checkout are managed on the dedicated billing page."
      >
        <Link
          href={`/dashboard/billing?organizationId=${encodeURIComponent(organizationId)}`}
          className={buttonSecondaryClass}
        >
          Go to Billing & Plans
        </Link>
      </Panel>

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
