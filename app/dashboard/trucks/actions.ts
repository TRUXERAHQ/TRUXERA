"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { TruckActionState } from "@/src/trucks/action-state";
import { isUuid } from "@/src/trucks/truck-policy";
import { parseTruckInput } from "@/src/trucks/truck-validation";
import {
  createTruckForUser,
  setTruckDeactivatedForUser,
  updateTruckForUser,
} from "@/src/prisma/truck-data";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function createTruckAction(
  _previousState: TruckActionState,
  formData: FormData,
): Promise<TruckActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  if (!isUuid(organizationId)) {
    return { error: "Select a valid organization." };
  }

  const parsed = parseTruckInput(formData);
  if (!parsed.input) return { error: parsed.error };

  const result = await createTruckForUser(
    userId,
    organizationId,
    parsed.input,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/trucks/${encodeURIComponent(result.value.id)}?organizationId=${encodeURIComponent(organizationId)}&created=1`,
  );
}

export async function updateTruckAction(
  _previousState: TruckActionState,
  formData: FormData,
): Promise<TruckActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const truckId = formData.get("truckId");
  if (!isUuid(organizationId) || !isUuid(truckId)) {
    return { error: "The organization or truck could not be found." };
  }

  const parsed = parseTruckInput(formData);
  if (!parsed.input) return { error: parsed.error };

  const result = await updateTruckForUser(
    userId,
    organizationId,
    truckId,
    parsed.input,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/trucks/${encodeURIComponent(truckId)}?organizationId=${encodeURIComponent(organizationId)}&updated=1`,
  );
}

export async function deactivateTruckAction(
  _previousState: TruckActionState,
  formData: FormData,
): Promise<TruckActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const truckId = formData.get("truckId");
  if (!isUuid(organizationId) || !isUuid(truckId)) {
    return { error: "The organization or truck could not be found." };
  }

  const result = await setTruckDeactivatedForUser(
    userId,
    organizationId,
    truckId,
    true,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/trucks/${encodeURIComponent(truckId)}?organizationId=${encodeURIComponent(organizationId)}&deactivated=1`,
  );
}

export async function reactivateTruckAction(formData: FormData) {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  const truckId = formData.get("truckId");
  if (!isUuid(organizationId) || !isUuid(truckId)) {
    redirect("/dashboard/trucks");
  }

  const result = await setTruckDeactivatedForUser(
    userId,
    organizationId,
    truckId,
    false,
  );
  if (!result.ok) {
    redirect(
      `/dashboard/trucks/${encodeURIComponent(truckId)}?organizationId=${encodeURIComponent(organizationId)}&error=reactivate`,
    );
  }

  redirect(
    `/dashboard/trucks/${encodeURIComponent(truckId)}?organizationId=${encodeURIComponent(organizationId)}&reactivated=1`,
  );
}
