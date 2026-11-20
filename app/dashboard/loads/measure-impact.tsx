import type {
  ImpactMetric,
  ImpactMetricState,
  MeasureImpact,
} from "@/src/dashboard/measure-impact";

const stateBadge: Record<ImpactMetricState, { label: string; className: string }> = {
  actual: {
    label: "Actual",
    className: "border-slate-300 bg-slate-100 text-slate-600",
  },
  estimated: {
    label: "Estimated",
    className: "border-sky-300 bg-sky-50 text-sky-800",
  },
  insufficient: {
    label: "Insufficient data",
    className: "border-slate-300 bg-slate-50 text-slate-500",
  },
};

function MetricCard({ metric }: { metric: ImpactMetric }) {
  const badge = stateBadge[metric.state];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{metric.label}</p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <p
        className={`mt-1 text-sm font-semibold ${
          metric.state === "insufficient"
            ? "text-slate-400"
            : "text-slate-800"
        }`}
      >
        {metric.display}
      </p>
      {metric.evidence.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600">
            Evidence
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-500">
            {metric.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function MeasureImpactPanel({ impact }: { impact: MeasureImpact }) {
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-800">
        Measure impact
      </h3>
      {!impact.hasRecovery ? (
        <p className="mt-1 text-xs text-slate-600">
          No recovery action has been executed for this delivery, so there is
          no before/after boundary to measure impact against.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-600">
          Operational impact measured from recorded data. Metrics without
          reliable inputs are shown as insufficient data rather than estimated.
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {impact.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>
    </div>
  );
}
