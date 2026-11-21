"use client";

import { useActionState, useState } from "react";
import { createLoadAction, updateLoadAction } from "./actions";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
} from "../ui";

type Props = { organizationId: string };

export default function LoadForm({ organizationId }: Props) {
  const [state, action, pending] = useActionState(createLoadAction, {});
  const [stopCount, setStopCount] = useState(1);

  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="organizationId" value={organizationId} />

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-slate-800">Load details</legend>
        <div>
          <label htmlFor="load-reference" className={labelClass}>Load reference <span aria-hidden="true">*</span></label>
          <input id="load-reference" name="reference" required maxLength={64} className={inputClass} />
        </div>
        <div>
          <label htmlFor="customer-name" className={labelClass}>Customer <span aria-hidden="true">*</span></label>
          <input id="customer-name" name="customerName" required maxLength={120} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pickup-address" className={labelClass}>Pickup address <span aria-hidden="true">*</span></label>
          <input id="pickup-address" name="pickupAddress" required maxLength={500} className={inputClass} />
        </div>
        <div>
          <label htmlFor="cargo-description" className={labelClass}>Cargo description</label>
          <input id="cargo-description" name="cargoDescription" maxLength={500} className={inputClass} />
        </div>
        <div>
          <label htmlFor="load-weight" className={labelClass}>Load weight (kg)</label>
          <input id="load-weight" name="weightKg" type="number" min="0.001" max="1000000000" step="0.001" inputMode="decimal" className={inputClass} />
        </div>
      </fieldset>

      <section>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Delivery stops</h2>
            <p className="mt-1 text-xs text-slate-500">Each stop starts as Planned with a Low risk level; no ETA is generated.</p>
          </div>
          <button
            type="button"
            disabled={stopCount >= 20}
            onClick={() => setStopCount((count) => Math.min(count + 1, 20))}
            className={`${buttonSecondaryClass} disabled:opacity-50`}
          >
            Add stop
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {Array.from({ length: stopCount }, (_, index) => (
            <fieldset key={index} className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium text-slate-700">Stop {index + 1}</legend>
              <div>
                <label htmlFor={`stop-${index}-recipient`} className={labelClass}>Recipient</label>
                <input id={`stop-${index}-recipient`} name="stopRecipientName" maxLength={120} className={inputClass} />
              </div>
              <div>
                <label htmlFor={`stop-${index}-reference`} className={labelClass}>Delivery reference</label>
                <input id={`stop-${index}-reference`} name="stopReference" maxLength={64} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`stop-${index}-destination`} className={labelClass}>Destination address <span aria-hidden="true">*</span></label>
                <input id={`stop-${index}-destination`} name="stopDestinationAddress" required maxLength={500} className={inputClass} />
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      {state.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</p>}

      <div className="border-t border-slate-200 pt-5">
        <button type="submit" disabled={pending} className={`${buttonPrimaryClass} disabled:cursor-wait disabled:opacity-60`}>
          {pending ? "Creating load..." : "Create load and deliveries"}
        </button>
      </div>
    </form>
  );
}

type LoadEditProps = {
  organizationId: string;
  loadId: string;
  customerName: string;
  cargoDescription: string | null;
};

export function LoadEditForm({
  organizationId,
  loadId,
  customerName,
  cargoDescription,
}: LoadEditProps) {
  const [state, action, pending] = useActionState(updateLoadAction, {});

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="loadId" value={loadId} />
      <div>
        <label
          htmlFor="edit-customer-name"
          className={labelClass}
        >
          Customer
        </label>
        <input
          id="edit-customer-name"
          name="customerName"
          required
          maxLength={120}
          defaultValue={customerName}
          className={inputClass}
        />
      </div>
      <div>
        <label
          htmlFor="edit-cargo-description"
          className={labelClass}
        >
          Cargo description
        </label>
        <textarea
          id="edit-cargo-description"
          name="cargoDescription"
          maxLength={500}
          rows={3}
          defaultValue={cargoDescription ?? ""}
          className={inputClass}
        />
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Load reference, pickup details, weight, and delivery stops are not
        editable here because they affect operational planning and assignment
        history.
      </p>
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimaryClass} disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Saving..." : "Save load details"}
      </button>
    </form>
  );
}
