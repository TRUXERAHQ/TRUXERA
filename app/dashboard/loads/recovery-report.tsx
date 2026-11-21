import type { RecoveryReport } from "@/src/dashboard/recovery-report";
import type { ImpactMetricState } from "@/src/dashboard/measure-impact";
import { Badge, dataQualityTone, recoveryTone } from "../ui";

const outcomeTitle: Record<string, string> = {
  successful: "Successful",
  monitoring: "Monitoring",
  unresolved: "Unresolved",
  insufficientData: "Insufficient data",
};

const metricBadgeLabel: Record<ImpactMetricState, string> = {
  actual: "Actual",
  estimated: "Estimated",
  insufficient: "Insufficient data",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h4>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function RecoveryReportPanel({ report }: { report: RecoveryReport }) {
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Automatic recovery report
        </h3>
        {report.header.outcome && (
          <Badge tone={recoveryTone(report.header.outcome)}>
            {outcomeTitle[report.header.outcome] ?? report.header.outcome}
          </Badge>
        )}
      </div>

      <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
        <p>
          Load: <span className="font-medium">{report.header.loadReference}</span>
        </p>
        <p>
          Customer:{" "}
          <span className="font-medium">{report.header.customerName}</span>
        </p>
        <p>
          Delivery:{" "}
          <span className="font-medium">{report.header.deliveryLabel}</span>
        </p>
        <p>
          Recovery:{" "}
          <span className="font-medium">
            {report.header.recoveryAtLabel ?? "Not recorded"}
          </span>
        </p>
      </div>

      {!report.hasRecovery ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          No recovery action executed. This delivery has no recorded
          reassignment, so there is no recovery incident to report.
        </p>
      ) : (
        <>
          <Section title="What happened">
            {report.whatHappened.length === 0 ? (
              <p className="text-xs text-slate-500">
                No disruption evidence is recorded for this delivery.
              </p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                {report.whatHappened.map((statement) => (
                  <li key={statement}>{statement}</li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Why it mattered — downstream impact">
            {report.downstream.hasAffected ? (
              <ul className="space-y-1.5">
                {report.downstream.entries.map((entry) => (
                  <li
                    key={entry.deliveryId}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    <span className="font-medium text-slate-700">
                      {entry.label}
                    </span>{" "}
                    — {entry.state} impact, status{" "}
                    {entry.status.toLowerCase().replaceAll("_", " ")}
                    {entry.riskLevel
                      ? `, ${entry.riskLevel.toLowerCase()} risk`
                      : ""}
                    {entry.projectedDelayLabel
                      ? `, ${entry.projectedDelayLabel}`
                      : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-600">
                No downstream deliveries were affected by the recorded
                disruptions.
              </p>
            )}
          </Section>

          <Section title="TRUXERA recommendation">
            <p className="text-xs text-slate-600">
              Recommendation at time of recovery:{" "}
              <span className="font-medium">
                {report.recommendation.historical}
              </span>
            </p>
            {report.recommendation.current && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Current TRUXERA recommendation — computed now, not the
                  historical recommendation
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  {report.recommendation.current.truckUnitNumber} ·{" "}
                  {report.recommendation.current.driverName}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-500">
                  {report.recommendation.current.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {report.action && report.result && (
            <>
              <Section title="Recovery action">
                <p className="text-xs text-slate-700">
                  {report.action.fromLabel} → {report.action.toLabel}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {report.action.occurredAtLabel}
                  {report.action.dispatcherReason
                    ? ` · ${report.action.dispatcherReason}`
                    : ""}
                </p>
              </Section>

              <Section title="Recovery result">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Before
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-700">
                      {report.result.before.truck} ·{" "}
                      {report.result.before.driver}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Status: {report.result.before.status}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      After
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-700">
                      {report.result.after.truck ?? "Not recorded"}
                      {report.result.after.driver
                        ? ` · ${report.result.after.driver}`
                        : ""}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Status: {report.result.after.status}
                      {report.result.after.riskLabel
                        ? ` · ${report.result.after.riskLabel} risk`
                        : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs font-medium text-slate-700">
                  {report.result.outcomeLabel}
                </p>
                <table className="mt-2 w-full text-left text-[11px]">
                  <tbody>
                    {report.result.comparison.map((row) => (
                      <tr
                        key={row.metric}
                        className="border-b border-slate-100"
                      >
                        <td className="py-1 pr-3 font-medium text-slate-500">
                          {row.metric}
                        </td>
                        <td className="py-1 pr-3 text-slate-600">
                          {row.before}
                        </td>
                        <td className="py-1 text-slate-700">
                          {row.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </>
          )}

          <Section title="Measured impact">
            <div className="grid gap-2 sm:grid-cols-2">
              {report.impact.map((metric) => (
                <div
                  key={metric.key}
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-slate-600">
                      {metric.label}
                    </p>
                    <Badge
                      tone={dataQualityTone(metric.state)}
                      className="shrink-0"
                    >
                      {metricBadgeLabel[metric.state]}
                    </Badge>
                  </div>
                  <p
                    className={`mt-0.5 text-xs font-semibold ${
                      metric.state === "insufficient"
                        ? "text-slate-400"
                        : "text-slate-800"
                    }`}
                  >
                    {metric.display}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Summary">
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
              {report.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
