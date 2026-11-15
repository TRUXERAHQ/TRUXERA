"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { OperationActionState } from "@/src/fleet/action-state";
import {
  isDeliveryStatus,
} from "@/src/fleet/delivery-lifecycle";
import {
  parseLoadInput,
  parseLoadUpdateInput,
} from "@/src/fleet/operations-validation";
import {
  createLoadForUser,
  updateDeliveryStatusForUser,
  updateLoadForUser,
} from "@/src/prisma/operations-data";
import { isUuid } from "@/src/trucks/truck-policy";

export async function createLoadAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const organizationId = formData.get("organizationId");
  if (!isUuid(organizationId)) {
    return { error: "Select a valid organization." };
  }

  const parsed = parseLoadInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const result = await createLoadForUser(
    session.user.id,
    organizationId,
    parsed.input,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/loads/${encodeURIComponent(result.value.id)}?organizationId=${encodeURIComponent(organizationId)}&created=1`,
  );
}

export async function updateLoadAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const organizationId = formData.get("organizationId");
  const loadId = formData.get("loadId");
  if (!isUuid(organizationId) || !isUuid(loadId)) {
    return { error: "The organization or load could not be found." };
  }

  const parsed = parseLoadUpdateInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const result = await updateLoadForUser(
    session.user.id,
    organizationId,
    loadId,
    parsed.input,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/loads/${encodeURIComponent(result.value.id)}?organizationId=${encodeURIComponent(organizationId)}&updated=1`,
  );
}

export async function updateDeliveryStatusAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const organizationId = formData.get("organizationId");
  const deliveryId = formData.get("deliveryId");
  const expectedCurrentStatus = formData.get("expectedCurrentStatus");
  const nextStatus = formData.get("nextStatus");
  const submittedNote = formData.get("note");
  if (
    !isUuid(organizationId) ||
    !isUuid(deliveryId) ||
    !isDeliveryStatus(expectedCurrentStatus) ||
    !isDeliveryStatus(nextStatus) ||
    (submittedNote !== null && typeof submittedNote !== "string")
  ) {
    return { error: "Choose a valid delivery status." };
  }

  const note = typeof submittedNote === "string" ? submittedNote.trim() : "";
  if (note.length > 250) {
    return { error: "The event note must be 250 characters or fewer." };
  }

  const result = await updateDeliveryStatusForUser(
    session.user.id,
    organizationId,
    deliveryId,
    expectedCurrentStatus,
    nextStatus,
    note,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/loads/${encodeURIComponent(result.value.loadId)}?organizationId=${encodeURIComponent(organizationId)}&statusUpdated=1`,
  );
}
