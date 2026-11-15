"use client";

import { useActionState } from "react";
import { driverStatuses, type DriverInput } from "@/src/fleet/operations-validation";
import { saveDriverAction } from "./actions";

type Props = {
  organizationId: string;
  driverId?: string;
  initial?: DriverInput;
};

export default function DriverForm({
  organizationId,
  driverId,
  initial,
}: Props) {
  const [state, action, pending] = useActionState(saveDriverAction, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      {driverId && <input type="hidden" name="driverId" value={driverId} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="driver-name" className="block text-sm font-medium text-slate-700">
            Driver name <span aria-hidden="true">*</span>
          </label>
          <input
            id="driver-name"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            defaultValue={initial?.name ?? ""}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div>
          <label htmlFor="driver-phone" className="block text-sm font-medium text-slate-700">
            Phone
          </label>
          <input
            id="driver-phone"
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            defaultValue={initial?.phone ?? ""}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div>
          <label htmlFor="driver-license" className="block text-sm font-medium text-slate-700">
            License number
          </label>
          <input
            id="driver-license"
            name="licenseNumber"
            maxLength={64}
            autoComplete="off"
            defaultValue={initial?.licenseNumber ?? ""}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm uppercase outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div>
          <label htmlFor="driver-status" className="block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="driver-status"
            name="status"
            defaultValue={initial?.status ?? "AVAILABLE"}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          >
            {driverStatuses.map((status) => (
              <option key={status} value={status}>
                {status.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="border-t border-slate-200 pt-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Saving..." : driverId ? "Save changes" : "Add driver"}
        </button>
      </div>
    </form>
  );
}
