import { connection } from "next/server";
import { auth } from "@/auth";
import { getOrganizationsForUser } from "@/src/prisma/organization-data";
import { selectAccessibleOrganization } from "@/src/auth/tenant-policy";
import { getNotificationsForOrganization } from "@/src/notifications/notifications";

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

  const notifications = await getNotificationsForOrganization({
    userId: session.user.id,
    organizationId: organization.id,
  });

  return Response.json({ notifications: notifications ?? [] });
}
