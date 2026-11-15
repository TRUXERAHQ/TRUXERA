"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "../organization-actions";

export default function OnboardingForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, {});

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="organization-name"
          className="block text-sm font-medium text-slate-700"
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
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
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
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Creating organization..." : "Create organization"}
      </button>
    </form>
  );
}
