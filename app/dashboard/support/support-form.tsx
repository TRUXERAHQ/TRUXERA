"use client";

import { useActionState, useRef, useState } from "react";
import { createSupportRequestAction } from "./actions";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
} from "../ui";
import type { SupportRelatedOption } from "@/src/prisma/support-data";

const categories = [
  { value: "TECHNICAL_ISSUE", label: "Technical Issue" },
  { value: "DATA_ISSUE", label: "Data Issue" },
  { value: "ACCOUNT_ACCESS", label: "Account & Access" },
  { value: "FLEET_OPERATIONS", label: "Fleet Operations" },
  { value: "OTHER", label: "Other" },
] as const;

const priorities = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
] as const;

const relatedGroups: Array<{
  kind: SupportRelatedOption["kind"];
  label: string;
}> = [
  { kind: "LOAD", label: "Loads" },
  { kind: "DELIVERY", label: "Deliveries" },
  { kind: "TRUCK", label: "Trucks" },
  { kind: "DRIVER", label: "Drivers" },
];

export default function SupportRequestForm({
  organizationId,
  relatedOptions,
}: {
  organizationId: string;
  relatedOptions: SupportRelatedOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createSupportRequestAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  function cancel() {
    formRef.current?.reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonPrimaryClass}>
        Create support request
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="support-subject" className={labelClass}>
            Subject <span aria-hidden="true">*</span>
          </label>
          <input
            id="support-subject"
            name="subject"
            required
            maxLength={200}
            placeholder="Briefly describe what you need help with"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="support-category" className={labelClass}>
            Category <span aria-hidden="true">*</span>
          </label>
          <select
            id="support-category"
            name="category"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="support-priority" className={labelClass}>
            Priority <span aria-hidden="true">*</span>
          </label>
          <select
            id="support-priority"
            name="priority"
            required
            defaultValue="NORMAL"
            className={inputClass}
          >
            {priorities.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="support-description" className={labelClass}>
            Description <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="support-description"
            name="description"
            required
            rows={5}
            maxLength={5000}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            Describe what happened and include any relevant details.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="support-related" className={labelClass}>
            Related item
          </label>
          <select
            id="support-related"
            name="relatedItem"
            defaultValue=""
            className={inputClass}
          >
            <option value="">None</option>
            {relatedGroups.map((group) => {
              const options = relatedOptions.filter(
                (option) => option.kind === group.kind,
              );
              if (options.length === 0) return null;
              return (
                <optgroup key={group.kind} label={group.label}>
                  {options.map((option) => (
                    <option key={option.id} value={`${option.kind}:${option.id}`}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Optionally link this request to a load, delivery, truck, or driver.
          </p>
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
          {pending ? "Submitting..." : "Submit support request"}
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
