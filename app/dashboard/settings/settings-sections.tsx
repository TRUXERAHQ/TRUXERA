"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateOrganizationSettingsAction } from "./actions";
import {
  Badge,
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
  Notice,
  Panel,
} from "../ui";

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
            {integrations.map((integration) => (
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
            ))}
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
