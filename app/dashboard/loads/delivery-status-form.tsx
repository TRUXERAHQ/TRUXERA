"use client";

import { useActionState } from "react";
import type { DeliveryStatus } from "@/src/fleet/delivery-lifecycle";
import { updateDeliveryStatusAction } from "./actions";
import { buttonPrimaryClass, inputClass, labelClass } from "../ui";

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
        className={labelClass}
        htmlFor={`next-status-${deliveryId}`}
      >
        Update delivery status
      </label>
      <select
        id={`next-status-${deliveryId}`}
        name="nextStatus"
        required
        defaultValue=""
        className={inputClass}
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
        className={labelClass}
        htmlFor={`status-note-${deliveryId}`}
      >
        Operational note (optional)
      </label>
      <textarea
        id={`status-note-${deliveryId}`}
        name="note"
        maxLength={250}
        rows={2}
        className={inputClass}
      />
      {state.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimaryClass} disabled:opacity-60`}
      >
        {pending ? "Updating..." : "Update status"}
      </button>
    </form>
  );
}
