"use client";

import { useActionState } from "react";
import {
  resolveSupportRequestAction,
  sendSupportReplyAction,
  updateSupportPriorityAction,
  updateSupportStatusAction,
} from "./actions";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
} from "../ui";

const statuses = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_FOR_CUSTOMER", label: "Waiting for Customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
] as const;

const priorities = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
] as const;

function HiddenFields({
  organizationId,
  ticketId,
}: {
  organizationId: string;
  ticketId: string;
}) {
  return (
    <>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="ticketId" value={ticketId} />
    </>
  );
}

function ActionError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {error}
    </p>
  );
}

export function SupportReplyForm({
  organizationId,
  ticketId,
}: {
  organizationId: string;
  ticketId: string;
}) {
  const [state, action, pending] = useActionState(sendSupportReplyAction, {});

  return (
    <form action={action} className="space-y-3">
      <HiddenFields organizationId={organizationId} ticketId={ticketId} />
      <div>
        <label htmlFor="support-reply" className={labelClass}>
          Reply
        </label>
        <textarea
          id="support-reply"
          name="body"
          required
          rows={4}
          maxLength={5000}
          placeholder="Write a reply..."
          className={inputClass}
        />
      </div>
      <ActionError error={state.error} />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimaryClass} disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Sending..." : "Send reply"}
      </button>
    </form>
  );
}

export function SupportStatusForm({
  organizationId,
  ticketId,
  currentStatus,
}: {
  organizationId: string;
  ticketId: string;
  currentStatus: string;
}) {
  const [state, action, pending] = useActionState(updateSupportStatusAction, {});

  return (
    <form action={action} className="space-y-3">
      <HiddenFields organizationId={organizationId} ticketId={ticketId} />
      <div>
        <label htmlFor="support-status" className={labelClass}>
          Status
        </label>
        <select
          id="support-status"
          name="status"
          defaultValue={currentStatus}
          className={inputClass}
        >
          {statuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <ActionError error={state.error} />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonSecondaryClass} disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Updating..." : "Update status"}
      </button>
    </form>
  );
}

export function SupportPriorityForm({
  organizationId,
  ticketId,
  currentPriority,
}: {
  organizationId: string;
  ticketId: string;
  currentPriority: string;
}) {
  const [state, action, pending] = useActionState(
    updateSupportPriorityAction,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <HiddenFields organizationId={organizationId} ticketId={ticketId} />
      <div>
        <label htmlFor="support-priority" className={labelClass}>
          Priority
        </label>
        <select
          id="support-priority"
          name="priority"
          defaultValue={currentPriority}
          className={inputClass}
        >
          {priorities.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </select>
      </div>
      <ActionError error={state.error} />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonSecondaryClass} disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Updating..." : "Update priority"}
      </button>
    </form>
  );
}

export function SupportResolveForm({
  organizationId,
  ticketId,
}: {
  organizationId: string;
  ticketId: string;
}) {
  const [state, action, pending] = useActionState(resolveSupportRequestAction, {});

  return (
    <form action={action} className="space-y-3">
      <HiddenFields organizationId={organizationId} ticketId={ticketId} />
      <div>
        <label htmlFor="support-resolution" className={labelClass}>
          Resolution note
        </label>
        <textarea
          id="support-resolution"
          name="resolutionNote"
          required
          rows={4}
          maxLength={5000}
          className={inputClass}
        />
      </div>
      <ActionError error={state.error} />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimaryClass} disabled:cursor-wait disabled:opacity-60`}
      >
        {pending ? "Resolving..." : "Resolve request"}
      </button>
    </form>
  );
}
