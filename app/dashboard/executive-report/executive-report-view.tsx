import Link from "next/link";
import type { ReactNode } from "react";
import type { ExecutiveReport } from "@/src/dashboard/executive-report";

type Props = {
  report: ExecutiveReport;
  organizationId: string;
  kind: "week" | "month";
  anchor: string;
  previousAnchor: string | null;
  periodBoundsValid: boolean;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

const statusLabel = (status: string) =>
  status.toLowerCase().replaceAll("_", " ");

export default function ExecutiveReportView({
  report,
  organizationId,
  kind,
  anchor,
  previousAnchor,
  periodBoundsValid,
}: Props) {
  const orgQuery = `organizationId=${encodeURIComponent(organizationId)}`;
  const empty = report.scopeCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Fleet operations · Executive report
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {report.periodLabel}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Timezone: {report.timezone}
            {report.timezoneAvailable
              ? ""
              : " (invalid — UTC fallback used)"}
          </p>
          {!periodBoundsValid && (
            <p className="mt-1 text-xs text-amber-700">
              The selected period could not be resolved in the operational
              timezone; a fallback window is shown.
            </p>
          )}
          {report.recordsWithoutTimestamps > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              {report.recordsWithoutTimestamps}{" "}
              {report.recordsWithoutTimestamps === 1
                ? "delivery has"
                : "deliveries have"}{" "}
              no recorded timestamps and cannot be assigned to a period.
            </p>
          )}
        </div>
        <form
          method="get"
          action="/dashboard/executive-report"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="organizationId" value={organizationId} />
          <div>
            <label
              htmlFor="report-period"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Period
            </label>
            <select
              id="report-period"
              name="period"
              defaultValue={kind}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="report-anchor"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              {kind === "week" ? "Any date in week" : "Month"}
            </label>
            <input
              id="report-anchor"
              type={kind === "week" ? "date" : "month"}
              name="anchor"
              defaultValue={anchor}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            View
          </button>
          {previousAnchor && (
            <Link
              href={`/dashboard/executive-report?organizationId=${encodeURIComponent(organizationId)}&period=${kind}&anchor=${previousAnchor}`}
              className="self-center text-sm font-medium text-slate-600 underline hover:text-slate-900"
            >
              View previous period
            </Link>
          )}
        </form>
      </div>

      {empty ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">
            No operational activity recorded for this period.
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {report.periodLabel} ({report.timezone}).
          </p>
        </section>
      ) : (
        <>
          <Section title="Executive Overview">
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Deliveries in scope" value={report.scopeCount} />
              <Stat label="Completed" value={report.snapshot.completed} />
              <Stat
                label="Currently assigned"
                value={report.snapshot.currentlyAssigned}
              />
              <Stat label="Failed" value={report.snapshot.failed} />
              <Stat label="Cancelled" value={report.snapshot.cancelled} />
              <Stat
                label="Recovery actions"
                value={report.recovery.actionsExecuted}
              />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Current state of deliveries with recorded activity in the
              period. {report.snapshot.withoutRecoveryAction}{" "}
              {report.snapshot.withoutRecoveryAction === 1
                ? "delivery has"
                : "deliveries have"}{" "}
              no recorded recovery action.
            </p>
          </Section>

          <Section title="Operational Performance">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  ["Successful", report.outcomes.successful],
                  ["Monitoring", report.outcomes.monitoring],
                  ["Unresolved", report.outcomes.unresolved],
                  [
                    "Insufficient outcome data",
                    report.outcomes.insufficientData,
                  ],
                  ["No recovery action", report.outcomes.noRecoveryAction],
                ] as const
              ).map(([label, items]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <h3 className="text-sm font-semibold text-slate-800">
                    {label}{" "}
                    <span className="text-slate-500">({items.length})</span>
                  </h3>
                  {items.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {items.slice(0, 4).join(", ")}
                      {items.length > 4 ? ` +${items.length - 4} more` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Outcomes use Recovery Result semantics; a reassignment alone is
              not counted as successful.
            </p>
          </Section>

          <Section title="Risk & Disruption">
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <Stat label="Low risk (current)" value={report.riskSummary.low} />
              <Stat
                label="Medium risk (current)"
                value={report.riskSummary.medium}
              />
              <Stat label="High risk (current)" value={report.riskSummary.high} />
              <Stat
                label="Risk unassessed"
                value={report.riskSummary.unassessed}
              />
              <Stat label="Failed events" value={report.riskSummary.failed} />
              <Stat
                label="Cancelled"
                value={report.riskSummary.cancelled}
              />
              <Stat
                label="Projected delay"
                value={report.riskSummary.projectedDelay}
              />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Current risk levels from the existing risk engine. Historical
              reassignment does not raise current risk; recorded disruption
              activity appears under Notable Events.
            </p>
            {report.downstreamAffected.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-800">
                  Downstream deliveries affected (
                  {report.downstreamAffected.length})
                </h3>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {report.downstreamAffected.map((entry) => (
                    <li key={entry.label}>
                      {entry.label} — {entry.state} impact
                      {entry.sourceLabels.length > 0 &&
                        ` (attributed to ${entry.sourceLabels.join(", ")})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Recovery Performance">
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat
                label="Actions executed"
                value={report.recovery.actionsExecuted}
              />
              <Stat
                label="Deliveries with recovery"
                value={report.recovery.deliveriesWithRecovery}
              />
              <Stat
                label="Successful"
                value={report.recovery.outcomes.successful}
              />
              <Stat
                label="Monitoring"
                value={report.recovery.outcomes.monitoring}
              />
              <Stat
                label="Unresolved"
                value={report.recovery.outcomes.unresolved}
              />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Insufficient-outcome deliveries:{" "}
              {report.recovery.outcomes.insufficientData}. Outcomes come from
              Recovery Result only.
            </p>
          </Section>

          <Section title="Assignment & Vehicle Activity">
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <Stat
                label="Assignments created"
                value={report.assignmentActivity.assignmentsCreated}
              />
              <Stat
                label="Changes recorded"
                value={report.assignmentActivity.transitions}
              />
              <Stat
                label="Deliveries changed"
                value={report.assignmentActivity.deliveriesWithChanges}
              />
              <Stat
                label="Truck changes"
                value={report.assignmentActivity.truckChanges}
              />
              <Stat
                label="Driver changes"
                value={report.assignmentActivity.driverChanges}
              />
              <Stat
                label="Truck + driver"
                value={report.assignmentActivity.truckAndDriverChanges}
              />
              <Stat label="Unchanged" value={report.assignmentActivity.unchanged} />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Factual assignment history only — no performance scoring or
              ranking. Assignments spanning the period without a transition are
              not counted as changes.
            </p>
          </Section>

          <Section title="Measured Impact">
            {report.impact.metrics.every(
              (metric) => metric.state === "insufficient",
            ) ? (
              <p className="text-sm text-slate-600">
                No measurable impact data recorded for this period.
              </p>
            ) : (
              <ul className="space-y-2">
                {report.impact.metrics
                  .filter((metric) => metric.state !== "insufficient")
                  .map((metric) => (
                    <li
                      key={metric.key}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {metric.label}
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-600">
                          {metric.state}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {metric.display}
                        {metric.coverage && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {metric.coverage}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Aggregated from Measure Impact outputs only. Missing mileage,
              fuel, labor, or financial inputs remain insufficient — never
              zero.
            </p>
          </Section>

          <Section
            title={`Previous Period Comparison${report.comparison.previousLabel ? ` — ${report.comparison.previousLabel}` : ""}`}
          >
            {!report.comparison.available ? (
              <p className="text-sm text-slate-600">
                Previous-period comparison unavailable.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-4">Metric</th>
                        <th className="py-2 pr-4">Current</th>
                        <th className="py-2 pr-4">Previous</th>
                        <th className="py-2">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.comparison.rows.map((row) => (
                        <tr
                          key={row.label}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-2 pr-4 font-medium text-slate-800">
                            {row.label}
                          </td>
                          <td className="py-2 pr-4 text-slate-700">
                            {row.current}
                          </td>
                          <td className="py-2 pr-4 text-slate-700">
                            {row.previous}
                          </td>
                          <td className="py-2 text-slate-700">
                            {row.delta > 0
                              ? `+${row.delta}`
                              : row.delta < 0
                                ? `${row.delta}`
                                : "0"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {report.comparison.impact.length > 0 && (
                  <ul className="mt-4 space-y-1 text-sm text-slate-700">
                    {report.comparison.impact.map((metric) => (
                      <li key={metric.key}>
                        {metric.label}: {metric.currentDisplay} vs{" "}
                        {metric.previousDisplay}
                        {metric.delta !== null && metric.unit
                          ? ` (${metric.delta > 0 ? "+" : ""}${metric.delta} ${metric.unit})`
                          : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Section>

          <Section title="Notable Events">
            {report.events.length === 0 ? (
              <p className="text-sm text-slate-500">
                No notable events recorded for this period.
              </p>
            ) : (
              <ul className="space-y-2">
                {report.events.slice(0, 60).map((event, index) => (
                  <li
                    key={`${event.deliveryLabel}-${event.kind}-${index}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-slate-100 px-4 py-2 text-sm"
                  >
                    <span className="w-36 shrink-0 text-xs text-slate-500">
                      {event.timeLabel ?? "Current state"}
                    </span>
                    <span className="font-medium text-slate-800">
                      {event.deliveryLabel}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                      {event.kind}
                    </span>
                    <span className="text-slate-600">{event.description}</span>
                  </li>
                ))}
                {report.events.length > 60 && (
                  <li className="text-xs text-slate-500">
                    Showing 60 of {report.events.length} events; full detail is
                    available in load history.
                  </li>
                )}
              </ul>
            )}
          </Section>

          <Section title="Deliveries in Scope">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Delivery</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Risk</th>
                    <th className="py-2 pr-4">Recovery</th>
                    <th className="py-2 pr-4">Assignment</th>
                    <th className="py-2">Load</th>
                  </tr>
                </thead>
                <tbody>
                  {report.deliveries.map((row) => (
                    <tr
                      key={row.deliveryId}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        <Link
                          href={`/dashboard/loads/${encodeURIComponent(row.loadId)}?${orgQuery}`}
                          className="hover:underline"
                        >
                          {row.label}
                        </Link>
                        {row.attention && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            attention
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {statusLabel(row.status)}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {row.riskLevel ?? "unassessed"}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {row.recoveryState === "none"
                          ? "No recovery action"
                          : statusLabel(row.recoveryState)}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {row.currentAssignmentLabel ?? "Not recorded"}
                      </td>
                      <td className="py-2 text-slate-500">
                        {row.loadReference}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Executive Summary">
            <p className="text-sm leading-6 text-slate-700">
              {report.narrative}
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
