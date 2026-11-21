import type {
  ImpactMetric,
  ImpactMetricState,
  MeasureImpact,
} from "@/src/dashboard/measure-impact";
import { Badge, dataQualityTone } from "../ui";

const stateBadgeLabel: Record<ImpactMetricState, string> = {
  actual: "Actual",
  estimated: "Estimated",
  insufficient: "Insufficient data",
};

function MetricCard({ metric }: { metric: ImpactMetric }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{metric.label}</p>
        <Badge tone={dataQualityTone(metric.state)} className="shrink-0">
          {stateBadgeLabel[metric.state]}
        </Badge>
      </div>
      <p
        className={`mt-1 break-words text-sm font-semibold ${
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
