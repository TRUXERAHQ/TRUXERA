"use client";

import { useActionState, useState } from "react";
import {
  assignDeliveryAction,
  endAssignmentAction,
  reassignDeliveryAction,
} from "./actions";

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
      <select id={`truck-${deliveryId}`} name="truckId" required defaultValue="" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        <option value="" disabled>Select truck</option>
        {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.unitNumber}</option>)}
      </select>
      <label className="sr-only" htmlFor={`driver-${deliveryId}`}>Driver</label>
      <select id={`driver-${deliveryId}`} name="driverId" required defaultValue="" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        <option value="" disabled>Select driver</option>
        {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
      </select>
      {state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
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
      <label className="block text-xs font-medium text-slate-600" htmlFor={`reason-${assignmentId}`}>End reason (optional)</label>
      <input id={`reason-${assignmentId}`} name="reason" maxLength={250} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
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
};

export function ReassignDeliveryForm({
  organizationId,
  deliveryId,
  currentAssignmentId,
  choices,
  initiallyOpen,
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
        className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Reassign delivery
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
      <label
        className="block text-xs font-medium text-slate-600"
        htmlFor={`replacement-${deliveryId}`}
      >
        Eligible replacement
      </label>
      <select
        id={`replacement-${deliveryId}`}
        name="candidate"
        required
        defaultValue={`${firstChoice.truckId}:${firstChoice.driverId}`}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
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
        className="block text-xs font-medium text-slate-600"
        htmlFor={`reassign-reason-${deliveryId}`}
      >
        Reason (optional)
      </label>
      <input
        id={`reassign-reason-${deliveryId}`}
        name="reason"
        maxLength={250}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Why is this delivery being reassigned?"
      />
      {state.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Reassigning..." : "Approve reassignment"}
      </button>
    </form>
  );
}
