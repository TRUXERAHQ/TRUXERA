"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isUuid } from "@/src/trucks/truck-policy";
import type { OperationActionState } from "@/src/fleet/action-state";
import {
  parseFeedbackInput,
} from "@/src/feedback/feedback-service";
import { submitFeedbackForUser } from "@/src/prisma/feedback-data";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function submitFeedbackAction(
  _previousState: OperationActionState,
  formData: FormData,
): Promise<OperationActionState> {
  const userId = await requireUserId();
  const organizationId = formData.get("organizationId");
  if (!isUuid(organizationId)) {
    return { error: "The organization could not be found." };
  }

  const parsed = parseFeedbackInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const result = await submitFeedbackForUser(
    userId,
    organizationId,
    parsed.input,
  );
  if (!result.ok) return { error: result.error };

  redirect(
    `/dashboard/feedback?organizationId=${encodeURIComponent(organizationId)}&created=1`,
  );
}
