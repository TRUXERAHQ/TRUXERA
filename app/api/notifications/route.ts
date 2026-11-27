import { connection } from "next/server";
import { auth } from "@/auth";
import { getOrganizationsForUser } from "@/src/prisma/organization-data";
import { selectAccessibleOrganization } from "@/src/auth/tenant-policy";
import {
  getCachedNotificationsForOrganization,
  type AppNotification,
} from "@/src/notifications/notifications";

export async function GET(request: Request) {
  await connection();

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ notifications: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const organizations = await getOrganizationsForUser(session.user.id);
  const organization = selectAccessibleOrganization(
    organizations,
    url.searchParams.get("organizationId") ?? undefined,
  );
  if (!organization) {
    return Response.json({ notifications: [] });
  }

  const notifications = await getCachedNotificationsForOrganization({
    userId: session.user.id,
    organizationId: organization.id,
  });

  if (url.searchParams.get("summary") === "1") {
    const stubs = (notifications ?? []).map(
      (notification: AppNotification) => ({
        id: notification.id,
        updatedAt: notification.updatedAt,
      }),
    );
    return Response.json({ notifications: stubs });
  }

  return Response.json({ notifications: notifications ?? [] });
}
