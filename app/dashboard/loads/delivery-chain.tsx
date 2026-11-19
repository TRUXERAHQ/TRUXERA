import type { ChainNode, ImpactStage, RecoveryImpact } from "@/src/dashboard/delivery-chain";

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

const stageToneClasses: Record<ImpactStage["tone"], string> = {
  neutral: "border-slate-200 bg-white",
  warning: "border-amber-300 bg-amber-50",
  positive: "border-emerald-300 bg-emerald-50",
  muted: "border-slate-200 bg-slate-50",
};

export function DeliveryChain({ nodes }: { nodes: ChainNode[] }) {
  if (nodes.length === 0) return null;

  return (
    <section
      aria-label="Delivery chain"
      className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="font-semibold">Delivery chain</h2>
      <p className="mt-1 text-sm text-slate-500">
        Operational sequence for this load, in stop order.
      </p>
      <ol className="mt-5 flex flex-wrap items-stretch gap-2">
        {nodes.map((node, index) => (
          <li key={node.id} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-slate-400">
                →
              </span>
            )}
            <article
              className={`w-44 rounded-xl border p-3 ${
                node.attention
                  ? "border-amber-400 bg-amber-50"
                  : node.inProgress
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {node.label}
                </p>
                {node.attention && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    Attention
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-slate-600">
                {node.customer}
              </p>
              <dl className="mt-2 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Status</dt>
                  <dd className="font-medium capitalize">
                    {formatLabel(node.status)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Risk</dt>
                  <dd className="font-medium">
                    {node.riskLevel
                      ? `${formatLabel(node.riskLevel)} risk`
                      : "Insufficient data"}
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
      <h3 className="text-sm font-semibold text-slate-800">
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
