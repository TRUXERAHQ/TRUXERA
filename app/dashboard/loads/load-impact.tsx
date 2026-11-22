import type {
  DownstreamImpactEntry,
  DownstreamImpactState,
} from "@/src/dashboard/load-impact";
import { Badge, type BadgeTone, riskTone } from "../ui";

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

const stateMeta: Record<DownstreamImpactState, { label: string; tone: BadgeTone }> = {
  current: {
    label: "Current impact",
    tone: "warning",
  },
  projected: {
    label: "Projected impact",
    tone: "info",
  },
  resolved: {
    label: "Resolved",
    tone: "success",
  },
};

export function WhatHappenedPanel({ statements }: { statements: string[] }) {
  return (
    <section
      aria-label="What happened"
      className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500" />
        What happened
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Operational events recorded for this load, in stop order.
      </p>
      {statements.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          No significant operational disruption is recorded for this load.
        </p>
      ) : (
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          {statements.map((statement) => (
            <li key={statement}>{statement}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DownstreamEntryCard({ entry }: { entry: DownstreamImpactEntry }) {
  const meta = stateMeta[entry.state];
  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="break-words text-sm font-semibold text-slate-900">
            {entry.label}
          </p>
          <span className="shrink-0 text-xs text-slate-500">
            Stop {entry.stopNumber}
          </span>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <p className="mt-1 break-words text-xs text-slate-600">{entry.customer}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-3">
        <div>
          <dt className="text-slate-400">Status</dt>
          <dd className="font-medium capitalize">
            {formatLabel(entry.status)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Risk</dt>
          <dd className="font-medium">
            {entry.riskLevel ? (
              <Badge tone={riskTone(entry.riskLevel)}>
                {formatLabel(entry.riskLevel)} risk
              </Badge>
            ) : (
              "Insufficient data"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Truck</dt>
          <dd className="break-words font-medium">
            {entry.truck ?? "Unassigned"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Driver</dt>
          <dd className="break-words font-medium">
            {entry.driver ?? "Unassigned"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">ETA</dt>
          <dd className="font-medium">{entry.etaLabel ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Projected delay</dt>
          <dd className="font-medium">
            {entry.projectedDelayLabel ?? "None recorded"}
          </dd>
        </div>
      </dl>
      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-600">
        {entry.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </li>
  );
}

export function DownstreamImpactPanel({
  entries,
  hasOperationalDisruption,
}: {
  entries: DownstreamImpactEntry[];
  hasOperationalDisruption: boolean;
}) {
  const groups: { state: DownstreamImpactState; title: string }[] = [
    { state: "current", title: "Current impact" },
    { state: "projected", title: "Projected / potential impact" },
    { state: "resolved", title: "Resolved impact" },
  ];

  return (
    <section
      aria-label="Downstream impact"
      className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500" />
        Downstream impact
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Later stops on this load route that are affected or potentially
        affected by the recorded disruptions.
      </p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          {hasOperationalDisruption
            ? "No downstream deliveries are affected by the recorded disruptions."
            : "No significant operational disruption is recorded for this load."}
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {groups.map(({ state, title }) => {
            const groupEntries = entries.filter(
              (entry) => entry.state === state,
            );
            if (groupEntries.length === 0) return null;
            return (
              <div key={state}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {title}
                </h3>
                <ul className="mt-2 grid gap-3 lg:grid-cols-2">
                  {groupEntries.map((entry) => (
                    <DownstreamEntryCard key={entry.deliveryId} entry={entry} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
