"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isUuid } from "@/src/trucks/truck-policy";
import { parseOrganizationSettingsInput } from "@/src/settings/organization-settings";
import { updateOrganizationSettingsForUser } from "@/src/prisma/organization-data";

export type SettingsActionState = {
  error?: string;
};

export async function updateOrganizationSettingsAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const organizationId = formData.get("organizationId");
  if (!isUuid(organizationId)) {
    return { error: "The selected organization could not be found." };
  }

  const parsed = parseOrganizationSettingsInput({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.ok) return { error: parsed.error };

  const result = await updateOrganizationSettingsForUser(
    session.user.id,
    organizationId,
    parsed.input,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/settings?organizationId=${encodeURIComponent(organizationId)}&updated=1`,
  );
}
