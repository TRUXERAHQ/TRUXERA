import Link from "next/link";
import type { ReactNode } from "react";
import type { DailyOperationsSummary } from "@/src/dashboard/daily-summary";

type Props = {
  summary: DailyOperationsSummary;
  organizationId: string;
  selectedDate: string;
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

export default function DailySummaryView({
  summary,
  organizationId,
  selectedDate,
}: Props) {
  const orgQuery = `organizationId=${encodeURIComponent(organizationId)}`;
  const dateQuery = `date=${encodeURIComponent(selectedDate)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Fleet operations
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Daily Operations Summary
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {summary.dateLabel}
            {summary.timezoneAvailable
              ? ` · ${summary.timezone}`
              : " · operational timezone unavailable; UTC day boundary used"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.scopeCount === 0
              ? "No deliveries recorded activity in this operational day."
              : `${summary.scopeCount} ${summary.scopeCount === 1 ? "delivery" : "deliveries"} with recorded activity in this operational day.`}
          </p>
        </div>
        <form method="get" action="/dashboard/daily-summary" className="flex items-end gap-2">
          <input type="hidden" name="organizationId" value={organizationId} />
          <div>
            <label
              htmlFor="daily-summary-date"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Operational date
            </label>
            <input
              id="daily-summary-date"
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            View
          </button>
        </form>
      </div>

      {summary.scopeCount === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">
            No deliveries recorded for this operational day.
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {summary.dateLabel}
            {summary.timezoneAvailable ? ` (${summary.timezone})` : ""}. No
            deliveries, assignments, or events fall within the operational day
            boundary, so there is nothing to summarize.
          </p>
        </section>
      ) : (
        <>
          <Section title="Operations Snapshot">
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="In scope" value={summary.scopeCount} />
              <Stat label="Completed" value={summary.snapshot.completed} />
              <Stat label="Currently assigned" value={summary.snapshot.currentlyAssigned} />
              <Stat label="Cancelled" value={summary.snapshot.cancelled} />
              <Stat label="Failed" value={summary.snapshot.failed} />
              <Stat
                label="With recovery action"
                value={summary.snapshot.withRecoveryAction}
              />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              {summary.snapshot.withoutRecoveryAction} {summary.snapshot.withoutRecoveryAction === 1 ? "delivery has" : "deliveries have"} no recorded recovery action. Counts reflect current state of deliveries with recorded activity in this day.
            </p>
          </Section>

          <Section title="Risk & Disruption Summary">
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <Stat label="Low risk" value={summary.riskSummary.low} />
              <Stat label="Medium risk" value={summary.riskSummary.medium} />
              <Stat label="High risk" value={summary.riskSummary.high} />
              <Stat label="Risk unassessed" value={summary.riskSummary.unassessed} />
              <Stat label="Failed" value={summary.riskSummary.failed} />
              <Stat label="Cancelled" value={summary.riskSummary.cancelled} />
              <Stat label="Projected delay" value={summary.riskSummary.projectedDelay} />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Current risk levels from the existing risk engine. Historical
              reassignment does not raise current risk.
            </p>
          </Section>

          <Section title="Recovery Activity">
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Recovery actions executed" value={summary.recovery.actionsExecuted} />
              <Stat label="Deliveries with recovery" value={summary.recovery.deliveriesWithRecovery} />
              <Stat label="Successful" value={summary.recovery.outcomes.successful} />
              <Stat label="Monitoring" value={summary.recovery.outcomes.monitoring} />
              <Stat label="Unresolved" value={summary.recovery.outcomes.unresolved} />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Outcomes use Recovery Result semantics; insufficient-data outcomes:{" "}
              {summary.recovery.outcomes.insufficientData}. A reassignment alone
              is not counted as a successful recovery.
            </p>
          </Section>

          <Section title="Assignment & Vehicle Activity">
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <Stat label="Assignments created" value={summary.assignmentActivity.assignmentsCreated} />
              <Stat label="Changes recorded" value={summary.assignmentActivity.transitions} />
              <Stat label="Deliveries changed" value={summary.assignmentActivity.deliveriesWithChanges} />
              <Stat label="Truck changes" value={summary.assignmentActivity.truckChanges} />
              <Stat label="Driver changes" value={summary.assignmentActivity.driverChanges} />
              <Stat label="Truck + driver" value={summary.assignmentActivity.truckAndDriverChanges} />
              <Stat label="Unchanged" value={summary.assignmentActivity.unchanged} />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Factual assignment history only; changes are not interpreted as
              disruption, recovery, or risk.
            </p>
          </Section>

          <Section title="Measured Impact">
            {summary.impact.metrics.every(
              (metric) => metric.state === "insufficient",
            ) ? (
              <p className="text-sm text-slate-600">
                Impact data insufficient for this period.
              </p>
            ) : (
              <ul className="space-y-2">
                {summary.impact.metrics
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

          <Section title="Operational Outcomes">
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Successfully recovered", summary.outcomes.successful],
                  ["Still monitoring", summary.outcomes.monitoring],
                  ["Unresolved", summary.outcomes.unresolved],
                  ["Insufficient outcome data", summary.outcomes.insufficientData],
                  ["No recovery action", summary.outcomes.noRecoveryAction],
                ] as const
              ).map(([label, items]) => (
                <div key={label}>
                  <h3 className="text-sm font-semibold text-slate-800">
                    {label}{" "}
                    <span className="text-slate-500">({items.length})</span>
                  </h3>
                  {items.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-500">None</p>
                  ) : (
                    <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-800">
                Downstream deliveries affected ({summary.downstreamAffected.length})
              </h3>
              {summary.downstreamAffected.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">
                  No downstream deliveries recorded as affected.
                </p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {summary.downstreamAffected.map((entry) => (
                    <li key={entry.label}>
                      {entry.label} — {entry.state} impact
                      {entry.sourceLabels.length > 0 &&
                        ` (attributed to ${entry.sourceLabels.join(", ")})`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <Section title="Notable Operational Events">
            {summary.events.length === 0 ? (
              <p className="text-sm text-slate-500">
                No notable events recorded for this operational day.
              </p>
            ) : (
              <ul className="space-y-2">
                {summary.events.map((event, index) => (
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
              </ul>
            )}
          </Section>

          <Section title="Delivery Detail">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Delivery</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Risk</th>
                    <th className="py-2 pr-4">Recovery</th>
                    <th className="py-2 pr-4">Assignment</th>
                    <th className="py-2 pr-4">Impact</th>
                    <th className="py-2">Load</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.deliveries.map((row) => (
                    <tr
                      key={row.deliveryId}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        <Link
                          href={`/dashboard/loads/${encodeURIComponent(row.loadId)}?${orgQuery}&${dateQuery}`}
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
                      <td className="py-2 pr-4 text-slate-700">
                        {row.impactState === "notApplicable"
                          ? "Not applicable"
                          : row.impactState === "insufficient"
                            ? "Insufficient data"
                            : "Measured"}
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

          <Section title="Daily Automatic Summary">
            <p className="text-sm leading-6 text-slate-700">
              {summary.narrative}
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
