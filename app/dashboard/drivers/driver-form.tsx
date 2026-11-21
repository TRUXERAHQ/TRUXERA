"use client";

import { useActionState } from "react";
import { driverStatuses, type DriverInput } from "@/src/fleet/operations-validation";
import { saveDriverAction } from "./actions";
import { buttonPrimaryClass, inputClass, labelClass } from "../ui";

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
          <label htmlFor="driver-name" className={labelClass}>
            Driver name <span aria-hidden="true">*</span>
          </label>
          <input
            id="driver-name"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            defaultValue={initial?.name ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="driver-phone" className={labelClass}>
            Phone
          </label>
          <input
            id="driver-phone"
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            defaultValue={initial?.phone ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="driver-license" className={labelClass}>
            License number
          </label>
          <input
            id="driver-license"
            name="licenseNumber"
            maxLength={64}
            autoComplete="off"
            defaultValue={initial?.licenseNumber ?? ""}
            className={`${inputClass} uppercase`}
          />
        </div>
        <div>
          <label htmlFor="driver-status" className={labelClass}>
            Status
          </label>
          <select
            id="driver-status"
            name="status"
            defaultValue={initial?.status ?? "AVAILABLE"}
            className={inputClass}
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
          className={`${buttonPrimaryClass} disabled:cursor-wait disabled:opacity-60`}
        >
          {pending ? "Saving..." : driverId ? "Save changes" : "Add driver"}
        </button>
      </div>
    </form>
  );
}
