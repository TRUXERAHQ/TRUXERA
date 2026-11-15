"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isUuid } from "@/src/trucks/truck-policy";
import type { OperationActionState } from "@/src/fleet/action-state";
import { parseDriverInput } from "@/src/fleet/operations-validation";
import { saveDriverForUser } from "@/src/prisma/operations-data";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function saveDriverAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const submittedDriverId = formData.get("driverId");
  if (
    !isUuid(organizationId) ||
    (submittedDriverId !== null &&
      submittedDriverId !== "" &&
      !isUuid(submittedDriverId))
  ) {
    return { error: "The organization or driver could not be found." };
  }

  const parsed = parseDriverInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const driverId =
    typeof submittedDriverId === "string" && submittedDriverId
      ? submittedDriverId
      : undefined;
  const result = await saveDriverForUser(
    userId,
    organizationId,
    driverId,
    parsed.input,
  );
  if (!result.ok) return { error: result.error };

  const action = driverId ? "updated" : "created";
  redirect(
    `/dashboard/drivers/${encodeURIComponent(result.value.id)}?organizationId=${encodeURIComponent(organizationId)}&${action}=1`,
  );
}
