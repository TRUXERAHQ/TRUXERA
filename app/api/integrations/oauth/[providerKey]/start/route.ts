import { connection } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { startIntegrationOAuth } from "@/src/prisma/integration-data";

function requestOrigin(request: Request, headerList: Headers): string {
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ providerKey: string }> },
) {
  await connection();
  const { providerKey } = await context.params;
  const session = await auth();
  const headerList = await headers();
  const origin = requestOrigin(request, headerList);
  const settingsUrl = (params: string) =>
    `${origin}/dashboard/settings${params}`;

  if (!session?.user?.id) {
    return Response.redirect(`${origin}/login`, 307);
  }

  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
  const redirectUri = `${origin}/api/integrations/oauth/${encodeURIComponent(providerKey)}/callback`;

  const result = await startIntegrationOAuth(
    session.user.id,
    organizationId,
    providerKey,
    redirectUri,
  );

  if (!result.ok) {
    const params = new URLSearchParams();
    if (organizationId) params.set("organizationId", organizationId);
    params.set("integrationError", result.error);
    return Response.redirect(settingsUrl(`?${params.toString()}`), 302);
  }

  return Response.redirect(result.value.authorizationUrl, 302);
}
