import Link from "next/link";
import type { ExecutiveReport } from "@/src/dashboard/executive-report";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Stat,
  StatGrid,
  buttonPrimaryClass,
  dataQualityTone,
  inputClass,
  labelClass,
  tableCellClass,
  tableClass,
  tableHeadClass,
  tableRowClass,
} from "../ui";

type Props = {
  report: ExecutiveReport;
  organizationId: string;
  kind: "week" | "month";
  anchor: string;
  previousAnchor: string | null;
  periodBoundsValid: boolean;
};

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
      <PageHeader
        eyebrow="Fleet operations · Executive report"
        title={report.periodLabel}
        description={`Timezone: ${report.timezone}${report.timezoneAvailable ? "" : " (invalid — UTC fallback used)"}`}
        meta={
          <>
            {!periodBoundsValid && (
              <p className="mt-1 text-amber-700">
                The selected period could not be resolved in the operational
                timezone; a fallback window is shown.
              </p>
            )}
            {report.recordsWithoutTimestamps > 0 && (
              <p className="mt-1 text-amber-700">
                {report.recordsWithoutTimestamps}{" "}
                {report.recordsWithoutTimestamps === 1
                  ? "delivery has"
                  : "deliveries have"}{" "}
                no recorded timestamps and cannot be assigned to a period.
              </p>
            )}
          </>
        }
        actions={
          <form
            method="get"
            action="/dashboard/executive-report"
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="organizationId" value={organizationId} />
            <div>
              <label htmlFor="report-period" className={labelClass}>
                Period
              </label>
              <select
                id="report-period"
                name="period"
                defaultValue={kind}
                className={inputClass}
              >
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </div>
            <div>
              <label htmlFor="report-anchor" className={labelClass}>
                {kind === "week" ? "Any date in week" : "Month"}
              </label>
              <input
                id="report-anchor"
                type={kind === "week" ? "date" : "month"}
                name="anchor"
                defaultValue={anchor}
                className={inputClass}
              />
            </div>
            <button className={buttonPrimaryClass}>View</button>
            {previousAnchor && (
              <Link
                href={`/dashboard/executive-report?organizationId=${encodeURIComponent(organizationId)}&period=${kind}&anchor=${previousAnchor}`}
                className="self-center text-sm font-medium text-slate-600 underline hover:text-slate-900"
              >
                View previous period
              </Link>
            )}
          </form>
        }
      />

      {empty ? (
        <div className="mt-6">
          <EmptyState
            title="No operational activity recorded for this period."
            description={`${report.periodLabel} (${report.timezone}).`}
          />
        </div>
      ) : (
        <>
          <Panel title="Executive Overview">
            <StatGrid columns="lg:grid-cols-6">
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
            </StatGrid>
            <p className="mt-3 text-xs text-slate-500">
              Current state of deliveries with recorded activity in the
              period. {report.snapshot.withoutRecoveryAction}{" "}
              {report.snapshot.withoutRecoveryAction === 1
                ? "delivery has"
                : "deliveries have"}{" "}
              no recorded recovery action.
            </p>
          </Panel>

          <Panel title="Operational Performance">
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
          </Panel>

          <Panel title="Risk & Disruption">
            <StatGrid columns="lg:grid-cols-7">
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
            </StatGrid>
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
          </Panel>

          <Panel title="Recovery Performance">
            <StatGrid columns="lg:grid-cols-5">
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
            </StatGrid>
            <p className="mt-3 text-xs text-slate-500">
              Insufficient-outcome deliveries:{" "}
              {report.recovery.outcomes.insufficientData}. Outcomes come from
              Recovery Result only.
            </p>
          </Panel>

          <Panel title="Assignment & Vehicle Activity">
            <StatGrid columns="lg:grid-cols-7">
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
            </StatGrid>
            <p className="mt-3 text-xs text-slate-500">
              Factual assignment history only — no performance scoring or
              ranking. Assignments spanning the period without a transition are
              not counted as changes.
            </p>
          </Panel>

          <Panel title="Measured Impact">
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
                        <Badge
                          tone={dataQualityTone(metric.state)}
                          className="ml-2"
                        >
                          {metric.state}
                        </Badge>
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
          </Panel>

          <Panel
            title={`Previous Period Comparison${report.comparison.previousLabel ? ` — ${report.comparison.previousLabel}` : ""}`}
          >
            {!report.comparison.available ? (
              <p className="text-sm text-slate-600">
                Previous-period comparison unavailable.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className={tableClass}>
                    <thead>
                      <tr className={tableHeadClass}>
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
                          className={tableRowClass}
                        >
                          <td className="py-2.5 pr-4 font-medium text-slate-800">
                            {row.label}
                          </td>
                          <td className={tableCellClass}>
                            {row.current}
                          </td>
                          <td className={tableCellClass}>
                            {row.previous}
                          </td>
                          <td className="py-2.5 text-slate-700">
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
          </Panel>

          <Panel title="Notable Events">
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
                    <Badge tone="neutral" className="px-2 py-0 text-[11px]">
                      {event.kind}
                    </Badge>
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
          </Panel>

          <Panel title="Deliveries in Scope">
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr className={tableHeadClass}>
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
                      className={tableRowClass}
                    >
                      <td className="py-2.5 pr-4 font-medium text-slate-900">
                        <Link
                          href={`/dashboard/loads/${encodeURIComponent(row.loadId)}?${orgQuery}`}
                          className="hover:underline"
                        >
                          {row.label}
                        </Link>
                        {row.attention && (
                          <Badge tone="warning" className="ml-2">
                            attention
                          </Badge>
                        )}
                      </td>
                      <td className={tableCellClass}>
                        {statusLabel(row.status)}
                      </td>
                      <td className={tableCellClass}>
                        {row.riskLevel ?? "unassessed"}
                      </td>
                      <td className={tableCellClass}>
                        {row.recoveryState === "none"
                          ? "No recovery action"
                          : statusLabel(row.recoveryState)}
                      </td>
                      <td className={tableCellClass}>
                        {row.currentAssignmentLabel ?? "Not recorded"}
                      </td>
                      <td className="py-2.5 text-slate-500">
                        {row.loadReference}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Executive Summary">
            <p className="text-sm leading-6 text-slate-700">
              {report.narrative}
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
