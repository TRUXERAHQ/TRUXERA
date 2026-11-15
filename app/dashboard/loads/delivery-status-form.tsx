"use client";

import { useActionState } from "react";
import type { DeliveryStatus } from "@/src/fleet/delivery-lifecycle";
import { updateDeliveryStatusAction } from "./actions";

type Props = {
  organizationId: string;
  deliveryId: string;
  currentStatus: DeliveryStatus;
  choices: readonly DeliveryStatus[];
};

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export default function DeliveryStatusForm({
  organizationId,
  deliveryId,
  currentStatus,
  choices,
}: Props) {
  const [state, action, pending] = useActionState(
    updateDeliveryStatusAction,
    {},
  );

  if (choices.length === 0) return null;

  return (
    <form action={action} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <input
        type="hidden"
        name="expectedCurrentStatus"
        value={currentStatus}
      />
      <label
        className="block text-xs font-medium text-slate-600"
        htmlFor={`next-status-${deliveryId}`}
      >
        Update delivery status
      </label>
      <select
        id={`next-status-${deliveryId}`}
        name="nextStatus"
        required
        defaultValue=""
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Select next status
        </option>
        {choices.map((status) => (
          <option key={status} value={status}>
            {formatLabel(status)}
          </option>
        ))}
      </select>
      <label
        className="block text-xs font-medium text-slate-600"
        htmlFor={`status-note-${deliveryId}`}
      >
        Operational note (optional)
      </label>
      <textarea
        id={`status-note-${deliveryId}`}
        name="note"
        maxLength={250}
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {state.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Updating..." : "Update status"}
      </button>
    </form>
  );
}
