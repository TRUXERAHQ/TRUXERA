import Link from "next/link";
import type { ReactNode } from "react";
import type {
  OperationalHistory,
  OperationalHistoryEntry,
  OperationalHistoryFilters,
} from "@/src/dashboard/operational-history";
import type { RecoveryOutcome } from "@/src/dashboard/recovery-result";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
  recoveryTone,
} from "../ui";

type Props = {
  history: OperationalHistory;
  organizationId: string;
  filters: OperationalHistoryFilters;
};

const outcomeLabels: Record<RecoveryOutcome, string> = {
  successful: "Successful",
  monitoring: "Monitoring",
  unresolved: "Unresolved",
  insufficientData: "Insufficient data",
};

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

function EntryCard({ entry }: { entry: OperationalHistoryEntry }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-500">
          {entry.timeLabel}
        </span>
        <Badge tone="neutral">{entry.typeLabel}</Badge>
        {entry.outcome && (
          <Badge tone={recoveryTone(entry.outcome)}>
            {outcomeLabels[entry.outcome]}
          </Badge>
        )}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-slate-900">
        {entry.title}
      </h3>
      <p className="mt-1 text-sm text-slate-600">{entry.description}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {entry.loadReference && <span>Load {entry.loadReference}</span>}
        {entry.deliveryLabel && <span>Delivery {entry.deliveryLabel}</span>}
        {entry.truckLabel && <span>Truck {entry.truckLabel}</span>}
        {entry.driverLabel && <span>Driver {entry.driverLabel}</span>}
      </div>
      {entry.impactMetrics && (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {entry.impactMetrics.map((metric) => (
            <li
              key={metric.label}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs"
            >
              <span className="text-slate-600">{metric.label}</span>
              <span className="font-medium text-slate-800">
                {metric.state === "insufficient"
                  ? "Insufficient data"
                  : metric.display}
                {metric.state === "estimated" ? " (estimated)" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OperationalHistoryView({
  history,
  organizationId,
  filters,
}: Props) {
  const orgQuery = `organizationId=${encodeURIComponent(organizationId)}`;
  const ascending = filters.order === "asc";
  const toggleOrder = (() => {
    const params = new URLSearchParams();
    params.set("organizationId", organizationId);
    for (const [key, value] of Object.entries(filters)) {
      if (key === "order" || value === null || value === undefined || value === "")
        continue;
      params.set(key, String(value));
    }
    params.set("order", ascending ? "desc" : "asc");
    return `/dashboard/operational-history?${params.toString()}`;
  })();
  const hasActiveFilters = Boolean(
    filters.q ||
      filters.from ||
      filters.to ||
      filters.loadId ||
      filters.deliveryId ||
      filters.truckId ||
      filters.driverId ||
      filters.type ||
      filters.outcome,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fleet operations · Operational history"
        title="Complete Operational History"
        description={
          <>
            Timezone: {history.timezone}
            {history.timezoneAvailable ? "" : " (invalid — UTC fallback used)"}
            <span className="mt-1 block text-xs text-slate-500">
              {history.entries.length} of {history.totalEntries} recorded
              {history.totalEntries === 1 ? " entry" : " entries"}
            </span>
          </>
        }
      />

      <Panel>
        <form
          method="get"
          action="/dashboard/operational-history"
        >
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="history-q">
            <input
              id="history-q"
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Load, delivery, truck, driver, text"
              className={inputClass}
            />
          </Field>
          <Field label="From" htmlFor="history-from">
            <input
              id="history-from"
              type="date"
              name="from"
              defaultValue={filters.from ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="To" htmlFor="history-to">
            <input
              id="history-to"
              type="date"
              name="to"
              defaultValue={filters.to ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Event type" htmlFor="history-type">
            <select
              id="history-type"
              name="type"
              defaultValue={filters.type ?? ""}
              className={inputClass}
            >
              <option value="">All types</option>
              {history.facets.types.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Load" htmlFor="history-load">
            <select
              id="history-load"
              name="loadId"
              defaultValue={filters.loadId ?? ""}
              className={inputClass}
            >
              <option value="">All loads</option>
              {history.facets.loads.map((load) => (
                <option key={load.id} value={load.id}>
                  {load.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Delivery" htmlFor="history-delivery">
            <select
              id="history-delivery"
              name="deliveryId"
              defaultValue={filters.deliveryId ?? ""}
              className={inputClass}
            >
              <option value="">All deliveries</option>
              {history.facets.deliveries.map((delivery) => (
                <option key={delivery.id} value={delivery.id}>
                  {delivery.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Truck" htmlFor="history-truck">
            <select
              id="history-truck"
              name="truckId"
              defaultValue={filters.truckId ?? ""}
              className={inputClass}
            >
              <option value="">All trucks</option>
              {history.facets.trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Driver" htmlFor="history-driver">
            <select
              id="history-driver"
              name="driverId"
              defaultValue={filters.driverId ?? ""}
              className={inputClass}
            >
              <option value="">All drivers</option>
              {history.facets.drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Outcome" htmlFor="history-outcome">
            <select
              id="history-outcome"
              name="outcome"
              defaultValue={filters.outcome ?? ""}
              className={inputClass}
            >
              <option value="">All outcomes</option>
              {history.facets.outcomes.map((outcome) => (
                <option key={outcome.value} value={outcome.value}>
                  {outcome.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={buttonPrimaryClass}>
            Apply filters
          </button>
          {hasActiveFilters && (
            <Link
              href={`/dashboard/operational-history?${orgQuery}`}
              className={buttonSecondaryClass}
            >
              Clear filters
            </Link>
          )}
          <Link
            href={toggleOrder}
            className="self-center text-sm font-medium text-slate-600 underline hover:text-slate-900"
          >
            {ascending ? "Newest first" : "Oldest first"}
          </Link>
        </div>
        </form>
      </Panel>

      {history.entries.length === 0 ? (
        <EmptyState
          title={
            history.totalEntries === 0
              ? "No operational history recorded."
              : "No operational history found for the selected filters."
          }
          description={
            history.totalEntries === 0
              ? "Recorded loads, deliveries, assignments, recovery actions, and measured impact will appear here as they occur."
              : "Adjust or clear the filters to see more entries."
          }
        />
      ) : (
        <ol className="space-y-3">
          {history.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </div>
  );
}
