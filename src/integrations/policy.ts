import { canAdministerOrganizationSettings } from "../settings/organization-settings.ts";

export function canReadIntegrations(role: string | null | undefined): boolean {
  return typeof role === "string" && role.length > 0;
}

export function canAdministerIntegrations(role: string | null | undefined): boolean {
  return canAdministerOrganizationSettings(role);
}

export function canManageIntegrationCredentials(
  role: string | null | undefined,
): boolean {
  return canAdministerIntegrations(role);
}
