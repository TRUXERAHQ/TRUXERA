"use client";

import { useActionState, useState } from "react";
import {
  assignDeliveryAction,
  endAssignmentAction,
  reassignDeliveryAction,
} from "./actions";
import {
  Badge,
  buttonDangerClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
} from "../ui";

type AssignProps = {
  organizationId: string;
  deliveryId: string;
  trucks: Array<{ id: string; unitNumber: string }>;
  drivers: Array<{ id: string; name: string }>;
};

export function AssignDeliveryForm({
  organizationId,
  deliveryId,
  trucks,
  drivers,
}: AssignProps) {
  const [state, action, pending] = useActionState(assignDeliveryAction, {});

  if (trucks.length === 0 || drivers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Add an available truck and driver before assigning this delivery.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <label className="sr-only" htmlFor={`truck-${deliveryId}`}>Truck</label>
      <select id={`truck-${deliveryId}`} name="truckId" required defaultValue="" className={inputClass}>
        <option value="" disabled>Select truck</option>
        {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.unitNumber}</option>)}
      </select>
      <label className="sr-only" htmlFor={`driver-${deliveryId}`}>Driver</label>
      <select id={`driver-${deliveryId}`} name="driverId" required defaultValue="" className={inputClass}>
        <option value="" disabled>Select driver</option>
        {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
      </select>
      {state.error && <p role="alert" className="text-sm leading-6 text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${buttonPrimaryClass} w-full disabled:opacity-60`}>
        {pending ? "Assigning..." : "Assign"}
      </button>
    </form>
  );
}

type EndProps = {
  organizationId: string;
  assignmentId: string;
};

export function EndAssignmentForm({
  organizationId,
  assignmentId,
}: EndProps) {
  const [state, action, pending] = useActionState(endAssignmentAction, {});

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <label className={labelClass} htmlFor={`reason-${assignmentId}`}>End reason (optional)</label>
      <input id={`reason-${assignmentId}`} name="reason" maxLength={250} className={inputClass} />
      {state.error && <p role="alert" className="text-sm leading-6 text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${buttonDangerClass} disabled:opacity-60`}>
        {pending ? "Ending..." : "End assignment"}
      </button>
    </form>
  );
}

type ReassignmentChoice = {
  truckId: string;
  truckUnitNumber: string;
  driverId: string;
  driverName: string;
  capacityUtilizationPercent: number;
};

type ReassignProps = {
  organizationId: string;
  deliveryId: string;
  currentAssignmentId: string;
  choices: ReassignmentChoice[];
  initiallyOpen: boolean;
  recommended: {
    truckUnitNumber: string;
    driverName: string;
    capacityUtilizationPercent: number;
    reasons: string[];
    alternatives: Array<{
      truckUnitNumber: string;
      driverName: string;
      capacityUtilizationPercent: number;
    }>;
  } | null;
};

export function ReassignDeliveryForm({
  organizationId,
  deliveryId,
  currentAssignmentId,
  choices,
  initiallyOpen,
  recommended,
}: ReassignProps) {
  const [state, action, pending] = useActionState(
    reassignDeliveryAction,
    {},
  );
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const firstChoice = choices[0];

  if (!firstChoice) return null;
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${buttonSecondaryClass} mt-4`}
      >
        Review recovery
      </button>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <input
        type="hidden"
        name="currentAssignmentId"
        value={currentAssignmentId}
      />
      {recommended && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm leading-6 font-semibold text-indigo-900">
              TRUXERA Recommendation
            </p>
            <Badge tone="info">Recommended</Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-indigo-950">
            {recommended.truckUnitNumber} · {recommended.driverName}
          </p>
          <p className="mt-1 text-sm leading-6 text-indigo-800">
            Capacity fit: {recommended.capacityUtilizationPercent}%
          </p>
          <p className="mt-2 text-sm leading-6 font-semibold text-indigo-900">
            Why TRUXERA recommended this
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm leading-6 text-indigo-800">
            {recommended.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {recommended.alternatives.length > 0 && (
            <p className="mt-2 text-sm leading-6 text-indigo-800">
              Also eligible:{" "}
              {recommended.alternatives
                .map(
                  (alternative) =>
                    `${alternative.truckUnitNumber} · ${alternative.driverName} (${alternative.capacityUtilizationPercent}% capacity)`,
                )
                .join("; ")}
            </p>
          )}
        </div>
      )}
      <label
        className={labelClass}
        htmlFor={`replacement-${deliveryId}`}
      >
        Eligible replacement
      </label>
      <select
        id={`replacement-${deliveryId}`}
        name="candidate"
        required
        defaultValue={`${firstChoice.truckId}:${firstChoice.driverId}`}
        className={inputClass}
      >
        {choices.map((choice) => (
          <option
            key={`${choice.truckId}:${choice.driverId}`}
            value={`${choice.truckId}:${choice.driverId}`}
          >
            Truck {choice.truckUnitNumber} · {choice.driverName} · capacity{" "}
            {choice.capacityUtilizationPercent}% utilized
          </option>
        ))}
      </select>
      <label
        className={labelClass}
        htmlFor={`reassign-reason-${deliveryId}`}
      >
        Reason (optional)
      </label>
      <input
        id={`reassign-reason-${deliveryId}`}
        name="reason"
        maxLength={250}
        className={inputClass}
        placeholder="Why is this delivery being reassigned?"
      />
      {state.error && (
        <p role="alert" className="text-sm leading-6 text-red-700">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className={`${buttonSecondaryClass} flex-1`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className={`${buttonPrimaryClass} flex-1 disabled:opacity-60`}
        >
          {pending ? "Reassigning..." : "Approve reassignment"}
        </button>
      </div>
    </form>
  );
}
