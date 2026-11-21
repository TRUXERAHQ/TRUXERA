"use client";

import { useActionState } from "react";
import {
  createTruckAction,
  updateTruckAction,
} from "./actions";
import { truckStatuses } from "@/src/trucks/truck-validation";
import { buttonPrimaryClass, inputClass, labelClass } from "../ui";

type Props = {
  organizationId: string;
  truckId?: string;
  initial?: {
    unitNumber: string;
    vin: string | null;
    capacityKg: string | null;
    status: string;
    currentLocation: string | null;
  };
};

export default function TruckForm({
  organizationId,
  truckId,
  initial,
}: Props) {
  const [state, action, pending] = useActionState(
    truckId ? updateTruckAction : createTruckAction,
    {},
  );
  const editing = Boolean(truckId);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      {truckId && <input type="hidden" name="truckId" value={truckId} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="unit-number"
            className={labelClass}
          >
            Unit number <span aria-hidden="true">*</span>
          </label>
          <input
            id="unit-number"
            name="unitNumber"
            required
            maxLength={32}
            autoComplete="off"
            defaultValue={initial?.unitNumber ?? ""}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? "truck-form-error" : undefined}
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="vin"
            className={labelClass}
          >
            Vehicle identification number (VIN)
          </label>
          <input
            id="vin"
            name="vin"
            maxLength={17}
            autoComplete="off"
            defaultValue={initial?.vin ?? ""}
            className={`${inputClass} uppercase`}
          />
        </div>

        <div>
          <label
            htmlFor="capacity-kg"
            className={labelClass}
          >
            Capacity (kg)
          </label>
          <input
            id="capacity-kg"
            name="capacityKg"
            type="number"
            min="0.001"
            max="1000000000"
            step="0.001"
            inputMode="decimal"
            defaultValue={initial?.capacityKg ?? ""}
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="truck-status"
            className={labelClass}
          >
            Operational status
          </label>
          <select
            id="truck-status"
            name="status"
            defaultValue={initial?.status ?? "AVAILABLE"}
            className={inputClass}
          >
            {truckStatuses.map((status) => (
              <option key={status} value={status}>
                {status
                  .toLowerCase()
                  .split("_")
                  .map((word) => word[0].toUpperCase() + word.slice(1))
                  .join(" ")}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="current-location"
            className={labelClass}
          >
            Current location
          </label>
          <input
            id="current-location"
            name="currentLocation"
            maxLength={200}
            defaultValue={initial?.currentLocation ?? ""}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            Optional; no GPS tracking is connected.
          </p>
        </div>
      </div>

      {state.error && (
        <p
          id="truck-form-error"
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5">
        <button
          type="submit"
          disabled={pending}
          className={`${buttonPrimaryClass} disabled:cursor-wait disabled:opacity-60`}
        >
          {pending
            ? editing
              ? "Saving..."
              : "Adding truck..."
            : editing
              ? "Save changes"
              : "Add truck"}
        </button>
      </div>
    </form>
  );
}
