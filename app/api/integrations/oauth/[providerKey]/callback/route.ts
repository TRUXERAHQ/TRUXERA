import { connection } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { completeIntegrationOAuth } from "@/src/prisma/integration-data";

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
  const url = new URL(request.url);

  if (!session?.user?.id) {
    return Response.redirect(`${origin}/login`, 307);
  }

  const redirectUri = `${origin}/api/integrations/oauth/${encodeURIComponent(providerKey)}/callback`;
  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const settingsRedirect = (params: URLSearchParams) =>
    Response.redirect(`${origin}/dashboard/settings?${params.toString()}`, 302);

  if (providerError) {
    // The provider denied or failed the authorization request.
    const params = new URLSearchParams();
    params.set("integrationError", `Provider authorization was not completed (${providerError}).`);
    return settingsRedirect(params);
  }
  if (!code || !state) {
    const params = new URLSearchParams();
    params.set("integrationError", "The OAuth callback was missing required parameters.");
    return settingsRedirect(params);
  }

  const result = await completeIntegrationOAuth({
    userId: session.user.id,
    providerKey,
    state,
    code,
    redirectUri,
  });

  const params = new URLSearchParams();
  const orgId = result.ok ? result.value.organizationId : result.organizationId;
  if (orgId) params.set("organizationId", orgId);
  if (result.ok) {
    params.set("integration", "connected");
  } else {
    params.set("integrationError", result.error);
  }
  return settingsRedirect(params);
}
