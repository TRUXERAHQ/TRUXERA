import type { AssignmentVehicleReport } from "@/src/dashboard/assignment-report";
import { Badge } from "../ui";

export function AssignmentVehicleReportPanel({
  report,
}: {
  report: AssignmentVehicleReport;
}) {
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500" />
        Assignment &amp; vehicle report — {report.deliveryLabel}
      </h3>

      {!report.hasAssignments ? (
        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          No assignments are recorded for this delivery.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current truck
              </p>
              {report.current ? (
                <>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {report.current.truck}
                  </p>
                  <p className="mt-1 space-y-0.5 text-xs text-slate-500">
                    <span className="block">
                      VIN: {report.current.vinLabel}
                    </span>
                    <span className="block">
                      Capacity: {report.current.capacityLabel}
                    </span>
                    <span className="block">
                      Status: {report.current.truckStatusLabel}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  No active assignment recorded.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current driver
              </p>
              {report.current ? (
                <>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {report.current.driver}
                  </p>
                  <p className="mt-1 space-y-0.5 text-xs text-slate-500">
                    <span className="block">
                      Status: {report.current.driverStatusLabel}
                    </span>
                    <span className="block">
                      Assigned since:{" "}
                      {report.current.assignedAtLabel}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  No active assignment recorded.
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assignment continuity
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {report.continuity.label}
            </p>
          </div>

          {report.changes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assignment changes
              </h4>
              <ul className="mt-1.5 space-y-1.5">
                {report.changes.map((change, index) => (
                  <li
                    key={index}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    <p className="font-medium text-slate-700">
                      {change.fromLabel} → {change.toLabel}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {change.atLabel}
                      {change.sameResources
                        ? " · same truck and driver re-recorded"
                        : ""}
                      {change.reason ? ` · ${change.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assignment history
            </h4>
            <div className="mt-1.5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Truck</th>
                    <th className="py-2 pr-3 font-medium">Driver</th>
                    <th className="py-2 pr-3 font-medium">Assigned</th>
                    <th className="py-2 pr-3 font-medium">Ended</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.history.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100"
                    >
                      <td className="py-2 pr-3 text-slate-400">
                        {row.sequence}
                      </td>
                      <td className="py-2 pr-3 font-medium text-slate-700">
                        {row.truck}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {row.driver}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {row.assignedAtLabel}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {row.endedAtLabel ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {row.state === "current" ? (
                          <Badge tone="success">Current</Badge>
                        ) : (
                          <Badge tone="neutral">
                            Ended
                            {row.endReason ? ` — ${row.endReason}` : ""}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assignment timeline
            </h4>
            <ul className="mt-1.5 space-y-1">
              {report.timeline.map((entry, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs"
                >
                  <span className="w-36 shrink-0 text-slate-400">
                    {entry.timeLabel}
                  </span>
                  <span className="font-medium text-slate-700">
                    {entry.event}
                  </span>
                  <span className="text-slate-600">
                    {entry.truck} · {entry.driver}
                  </span>
                  {entry.note && (
                    <span className="text-slate-400">— {entry.note}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
