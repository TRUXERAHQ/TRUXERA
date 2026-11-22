"use client";

import { useActionState, useRef, useState } from "react";
import { submitFeedbackAction } from "./actions";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
} from "../ui";

const types = [
  { value: "PRODUCT_SUGGESTION", label: "Product suggestion" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
  { value: "UX_UI_FEEDBACK", label: "UX / UI feedback" },
  { value: "GENERAL_FEEDBACK", label: "General feedback" },
] as const;

const ratings = [
  { value: "1", label: "1", hint: "Poor" },
  { value: "2", label: "2", hint: "Fair" },
  { value: "3", label: "3", hint: "Good" },
  { value: "4", label: "4", hint: "Very good" },
  { value: "5", label: "5", hint: "Excellent" },
] as const;

export default function FeedbackForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(submitFeedbackAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  function cancel() {
    formRef.current?.reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonPrimaryClass}>
        Share feedback
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="mx-auto w-full max-w-3xl space-y-5">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="feedback-type" className={labelClass}>
            Feedback type <span aria-hidden="true">*</span>
          </label>
          <select
            id="feedback-type"
            name="type"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Select a type
            </option>
            {types.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="feedback-subject" className={labelClass}>
            Subject <span aria-hidden="true">*</span>
          </label>
          <input
            id="feedback-subject"
            name="subject"
            required
            maxLength={200}
            placeholder="Short summary of your feedback"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="feedback-message" className={labelClass}>
            Your feedback <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="feedback-message"
            name="message"
            required
            rows={6}
            maxLength={5000}
            placeholder="Describe what you would like improved or added."
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            Tell us what you would like improved, changed, or added to
            TRUXERA.
          </p>
        </div>
        <div className="sm:col-span-2">
          <fieldset>
            <legend className={labelClass}>
              Experience rating{" "}
              <span className="normal-case">(optional)</span>
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Optionally rate your overall experience with TRUXERA from 1
              (poor) to 5 (excellent).
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {ratings.map((rating) => (
                <label
                  key={rating.value}
                  className="flex cursor-pointer flex-col items-center gap-1"
                >
                  <input
                    type="radio"
                    name="rating"
                    value={rating.value}
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-w-14 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-200 peer-focus-visible:ring-offset-1">
                    {rating.label}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 peer-checked:text-indigo-700 peer-checked:font-semibold">
                    {rating.hint}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Leave unselected if you prefer not to rate.
            </p>
          </fieldset>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
        <button
          type="submit"
          disabled={pending}
          className={`${buttonPrimaryClass} disabled:cursor-wait disabled:opacity-60`}
        >
          {pending ? "Submitting..." : "Submit feedback"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className={buttonSecondaryClass}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
