import type { RecoveryResult } from "@/src/dashboard/recovery-result";
import { Badge, recoveryTone } from "../ui";

const outcomeTitles: Record<
  NonNullable<RecoveryResult["recovery"]>["outcome"],
  string
> = {
  successful: "Recovery successful",
  monitoring: "Recovery executed — monitoring",
  unresolved: "Recovery unresolved",
  insufficientData: "Insufficient data",
};

export function RecoveryResultPanel({ result }: { result: RecoveryResult }) {
  if (!result.hasRecovery || !result.recovery) {
    return (
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500" />
          Recovery result
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          No recovery action has been executed for this delivery.
        </p>
      </div>
    );
  }

  const { recovery } = result;
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500" />
          Recovery result
        </h3>
        <Badge tone={recoveryTone(recovery.outcome)}>
          {outcomeTitles[recovery.outcome]}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-slate-600">{recovery.outcomeLabel}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Before recovery
          </p>
          <p className="mt-1 break-words text-sm font-medium text-slate-800">
            {recovery.before.truck} · {recovery.before.driver}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Status: {recovery.before.status} · ETA:{" "}
            {recovery.before.etaLabel ?? "Not recorded"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Recovery action
          </p>
          <p className="mt-1 break-words text-sm font-medium text-slate-800">
            {recovery.action.fromLabel}
          </p>
          <p className="mt-0.5 text-slate-400" aria-hidden="true">
            ↓
          </p>
          <p className="break-words text-sm font-medium text-slate-800">
            {recovery.action.toLabel}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(recovery.occurredAt)}
            {recovery.dispatcherReason
              ? ` · ${recovery.dispatcherReason}`
              : ""}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            After recovery
          </p>
          <p className="mt-1 break-words text-sm font-medium text-slate-800">
            {recovery.after.truck ?? "Not recorded"}
            {recovery.after.driver ? ` · ${recovery.after.driver}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Status: {recovery.after.status} · Risk:{" "}
            {recovery.after.riskLabel ?? "Insufficient data"} · ETA:{" "}
            {recovery.after.etaLabel ?? "Not recorded"}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-4 font-medium">Metric</th>
              <th className="py-1.5 pr-4 font-medium">Before</th>
              <th className="py-1.5 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {recovery.comparison.map((row) => (
              <tr key={row.metric} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-4 font-medium text-slate-600">
                  {row.metric}
                </td>
                <td className="py-1.5 pr-4 text-slate-600">{row.before}</td>
                <td className="py-1.5 text-slate-700">{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {recovery.etaComparisonLabel}
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-500">
        {recovery.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </div>
  );
}
