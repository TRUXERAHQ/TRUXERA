"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { OperationActionState } from "@/src/fleet/action-state";
import {
  assignDeliveryForUser,
  endAssignmentForUser,
  reassignDeliveryForUser,
} from "@/src/prisma/operations-data";
import { isUuid } from "@/src/trucks/truck-policy";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function assignDeliveryAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const deliveryId = formData.get("deliveryId");
  const truckId = formData.get("truckId");
  const driverId = formData.get("driverId");
  if (
    !isUuid(organizationId) ||
    !isUuid(deliveryId) ||
    !isUuid(truckId) ||
    !isUuid(driverId)
  ) {
    return { error: "Choose valid delivery, truck, and driver records." };
  }

  const result = await assignDeliveryForUser(
    userId,
    organizationId,
    deliveryId,
    truckId,
    driverId,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/dispatch?organizationId=${encodeURIComponent(organizationId)}&assigned=1`,
  );
}

export async function endAssignmentAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const assignmentId = formData.get("assignmentId");
  const submittedReason = formData.get("reason");
  if (
    !isUuid(organizationId) ||
    !isUuid(assignmentId) ||
    (submittedReason !== null && typeof submittedReason !== "string")
  ) {
    return { error: "The organization or assignment could not be found." };
  }
  const reason = typeof submittedReason === "string" ? submittedReason.trim() : "";
  if (reason.length > 250) {
    return { error: "The end reason must be 250 characters or fewer." };
  }

  const result = await endAssignmentForUser(
    userId,
    organizationId,
    assignmentId,
    reason,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/dispatch?organizationId=${encodeURIComponent(organizationId)}&ended=1`,
  );
}

export async function reassignDeliveryAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const deliveryId = formData.get("deliveryId");
  const currentAssignmentId = formData.get("currentAssignmentId");
  const candidate = formData.get("candidate");
  const submittedReason = formData.get("reason");
  if (
    !isUuid(organizationId) ||
    !isUuid(deliveryId) ||
    !isUuid(currentAssignmentId) ||
    typeof candidate !== "string" ||
    (submittedReason !== null && typeof submittedReason !== "string")
  ) {
    return { error: "Choose a valid delivery, current assignment, truck, and driver." };
  }

  const candidateIds = candidate.split(":");
  if (
    candidateIds.length !== 2 ||
    !isUuid(candidateIds[0]) ||
    !isUuid(candidateIds[1])
  ) {
    return { error: "Choose a valid replacement truck and driver." };
  }

  const reason = typeof submittedReason === "string" ? submittedReason.trim() : "";
  if (reason.length > 250) {
    return { error: "The reassignment reason must be 250 characters or fewer." };
  }

  const result = await reassignDeliveryForUser(
    userId,
    organizationId,
    deliveryId,
    currentAssignmentId,
    candidateIds[0],
    candidateIds[1],
    reason,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/dispatch?organizationId=${encodeURIComponent(organizationId)}&reassigned=1&reassignedDeliveryId=${encodeURIComponent(deliveryId)}`,
  );
}
