"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isUuid } from "@/src/trucks/truck-policy";
import type { OperationActionState } from "@/src/fleet/action-state";
import {
  createSupportRequestForUser,
  isSupportCategory,
  isSupportPriority,
  isSupportRelatedKind,
  resolveSupportRequestForStaff,
  sendSupportReplyForStaff,
  updateSupportPriorityForStaff,
  updateSupportStatusForStaff,
  type SupportRequestInput,
} from "@/src/prisma/support-data";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

function textField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createSupportRequestAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  if (!isUuid(organizationId)) {
    return { error: "The organization could not be found." };
  }

  const subject = textField(formData, "subject");
  const description = textField(formData, "description");
  const category = textField(formData, "category");
  const priority = textField(formData, "priority");
  const related = textField(formData, "relatedItem");

  if (!subject) return { error: "Subject is required." };
  if (subject.length > 200) {
    return { error: "Subject must be 200 characters or fewer." };
  }
  if (!description) return { error: "Description is required." };
  if (description.length > 5000) {
    return { error: "Description must be 5,000 characters or fewer." };
  }
  if (!isSupportCategory(category)) {
    return { error: "Select a valid category." };
  }
  if (!isSupportPriority(priority)) {
    return { error: "Select a valid priority." };
  }

  let relatedKind: SupportRequestInput["relatedKind"] = null;
  let relatedId: string | null = null;
  if (related) {
    const separator = related.indexOf(":");
    const kind = related.slice(0, separator);
    const id = related.slice(separator + 1);
    if (!isSupportRelatedKind(kind) || !isUuid(id)) {
      return { error: "The selected related item is invalid." };
    }
    relatedKind = kind;
    relatedId = id;
  }

  const result = await createSupportRequestForUser(userId, organizationId, {
    subject,
    category,
    priority,
    description,
    relatedKind,
    relatedId,
  });
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/support/${encodeURIComponent(result.value.id)}?organizationId=${encodeURIComponent(organizationId)}&created=1`,
  );
}

function staffRedirect(
  ticketId: string,
  organizationId: string,
  flag: string,
): never {
  redirect(
    `/dashboard/support/${encodeURIComponent(ticketId)}?view=inbox&organizationId=${encodeURIComponent(organizationId)}&${flag}=1`,
  );
}

export async function sendSupportReplyAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const ticketId = formData.get("ticketId");
  if (!isUuid(organizationId) || !isUuid(ticketId)) {
    return { error: "The support request could not be found." };
  }

  const body = textField(formData, "body");
  const result = await sendSupportReplyForStaff(
    userId,
    organizationId,
    ticketId,
    body,
  );
  if (!result.ok) return { error: result.error };

  staffRedirect(ticketId, organizationId, "replied");
}

export async function updateSupportStatusAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const ticketId = formData.get("ticketId");
  const status = textField(formData, "status");
  if (!isUuid(organizationId) || !isUuid(ticketId)) {
    return { error: "The support request could not be found." };
  }

  const result = await updateSupportStatusForStaff(
    userId,
    organizationId,
    ticketId,
    status,
  );
  if (!result.ok) return { error: result.error };

  staffRedirect(ticketId, organizationId, "updated");
}

export async function updateSupportPriorityAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const ticketId = formData.get("ticketId");
  const priority = textField(formData, "priority");
  if (!isUuid(organizationId) || !isUuid(ticketId)) {
    return { error: "The support request could not be found." };
  }

  const result = await updateSupportPriorityForStaff(
    userId,
    organizationId,
    ticketId,
    priority,
  );
  if (!result.ok) return { error: result.error };

  staffRedirect(ticketId, organizationId, "updated");
}

export async function resolveSupportRequestAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const ticketId = formData.get("ticketId");
  if (!isUuid(organizationId) || !isUuid(ticketId)) {
    return { error: "The support request could not be found." };
  }

  const resolutionNote = textField(formData, "resolutionNote");
  const result = await resolveSupportRequestForStaff(
    userId,
    organizationId,
    ticketId,
    resolutionNote,
  );
  if (!result.ok) return { error: result.error };

  staffRedirect(ticketId, organizationId, "resolved");
}
