import type { ChainNode, ImpactStage, RecoveryImpact } from "@/src/dashboard/delivery-chain";
import { Badge, riskTone } from "../ui";

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

const stageToneClasses: Record<ImpactStage["tone"], string> = {
  neutral: "border-indigo-200 bg-indigo-50/60",
  warning: "border-amber-300 bg-amber-50",
  positive: "border-emerald-300 bg-emerald-50",
  muted: "border-slate-200 bg-slate-50",
};

export function DeliveryChain({ nodes }: { nodes: ChainNode[] }) {
  if (nodes.length === 0) return null;

  return (
    <section
      aria-label="Delivery chain"
      className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500" />
        Delivery chain
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Operational sequence for this load, in stop order.
      </p>
      <ol className="mt-5 flex flex-wrap items-stretch gap-2">
        {nodes.map((node, index) => (
          <li key={node.id} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-slate-300">
                →
              </span>
            )}
            <article
              className={`w-44 rounded-lg border p-3 ${
                node.attention
                  ? "border-amber-300 bg-amber-50"
                  : node.inProgress
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {node.label}
                </p>
                {node.attention && <Badge tone="warning">Attention</Badge>}
              </div>
              <p className="mt-1 break-words text-xs text-slate-600">
                {node.customer}
              </p>
              <dl className="mt-2 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Status</dt>
                  <dd className="font-medium capitalize">
                    {formatLabel(node.status)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Risk</dt>
                  <dd>
                    {node.riskLevel ? (
                      <Badge tone={riskTone(node.riskLevel)}>
                        {formatLabel(node.riskLevel)} risk
                      </Badge>
                    ) : (
                      <span className="font-medium">Insufficient data</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">ETA</dt>
                  <dd className="text-right font-medium">
                    {node.etaLabel ?? "Not recorded"}
                  </dd>
                </div>
                {node.projectedDelayLabel && (
                  <p className="text-[11px] text-amber-800">
                    {node.projectedDelayLabel}
                  </p>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Truck</dt>
                  <dd className="text-right font-medium">
                    {node.truckLabel ?? "Unassigned"}
                  </dd>
                </div>
              </dl>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RecoveryImpactPanel({ impact }: { impact: RecoveryImpact }) {
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500"
        />
        Recovery impact
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Before → disruption → recovery → after, built only from recorded
        operational data.
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {impact.stages.map((stage, index) => (
          <li key={stage.key} className="relative">
            {index > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-3 left-1/2 hidden -translate-x-1/2 text-slate-300 lg:block"
              >
                →
              </span>
            )}
            <div
              className={`h-full rounded-lg border p-3 ${stageToneClasses[stage.tone]}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {index + 1}. {stage.title}
              </p>
              <ul className="mt-2 space-y-1">
                {stage.lines.map((line) => (
                  <li key={line} className="text-xs text-slate-700">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-600">{impact.outcomeLabel}</p>
    </div>
  );
}
