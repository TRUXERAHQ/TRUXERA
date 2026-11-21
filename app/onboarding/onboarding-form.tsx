"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "../organization-actions";
import { buttonPrimaryClass, inputClass, labelClass } from "../dashboard/ui";

export default function OnboardingForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, {});

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="organization-name"
          className={labelClass}
        >
          Organization name
        </label>
        <input
          id="organization-name"
          name="name"
          autoComplete="organization"
          required
          minLength={2}
          maxLength={100}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "organization-error" : undefined}
          className={inputClass}
          placeholder="Acme Logistics"
        />
        {state.error && (
          <p
            id="organization-error"
            role="alert"
            className="mt-2 text-sm text-red-700"
          >
            {state.error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimaryClass} w-full disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Creating organization..." : "Create organization"}
      </button>
    </form>
  );
}
