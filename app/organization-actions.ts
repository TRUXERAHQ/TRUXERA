"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { OrganizationActionState } from "@/src/auth/action-state";
import { createOrganizationForUser } from "@/src/prisma/organization-data";

export async function createOrganizationAction(
  _previousState: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const submittedName = formData.get("name");
  if (typeof submittedName !== "string") {
    return { error: "Enter an organization name." };
  }

  const name = submittedName.trim();
  if (name.length < 2 || name.length > 100) {
    return { error: "Use an organization name between 2 and 100 characters." };
  }

  const organization = await createOrganizationForUser(session.user.id, name);
  // The onboarding wizard continues client-side into plan selection —
  // no billing state is provisioned here; Paddle owns the trial.
  return { organizationId: organization.id };
}
