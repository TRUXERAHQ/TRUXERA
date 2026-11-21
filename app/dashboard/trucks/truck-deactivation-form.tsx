"use client";

import { useActionState } from "react";
import {
  deactivateTruckAction,
  reactivateTruckAction,
} from "./actions";
import type { TruckActionState } from "@/src/trucks/action-state";
import { buttonDangerClass, buttonSecondaryClass } from "../ui";

type Props = {
  organizationId: string;
  truckId: string;
  deactivated: boolean;
};

export default function TruckDeactivationForm({
  organizationId,
  truckId,
  deactivated,
}: Props) {
  const [state, action, pending] = useActionState<TruckActionState, FormData>(
    deactivateTruckAction,
    {},
  );

  if (deactivated) {
    return (
      <form action={reactivateTruckAction}>
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="truckId" value={truckId} />
        <button className={buttonSecondaryClass}>
          Return to active fleet
        </button>
      </form>
    );
  }

  return (
    <div>
      <form
        action={action}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Remove this truck from the active fleet? Its records and assignment history will be preserved.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="truckId" value={truckId} />
        <button
          disabled={pending}
          className={`${buttonDangerClass} disabled:opacity-60`}
        >
          {pending ? "Removing..." : "Remove from active fleet"}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
