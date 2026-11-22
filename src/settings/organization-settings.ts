export type OrganizationSettingsInput = {
  name: string;
  timezone: string;
};

export type OrganizationSettingsParseResult =
  | { ok: true; input: OrganizationSettingsInput }
  | { ok: false; error: string };

const organizationAdminRoles = new Set(["OWNER", "ADMIN"]);

export function canAdministerOrganizationSettings(
  role: string | null | undefined,
) {
  return organizationAdminRoles.has(role ?? "");
}

export function isSupportedTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

export function parseOrganizationSettingsInput(values: {
  name?: unknown;
  timezone?: unknown;
}): OrganizationSettingsParseResult {
  const name = typeof values.name === "string" ? values.name.trim() : "";
  if (name.length < 2 || name.length > 100) {
    return {
      ok: false,
      error: "Use an organization name between 2 and 100 characters.",
    };
  }

  const timezone =
    typeof values.timezone === "string" ? values.timezone.trim() : "";
  if (!isSupportedTimeZone(timezone)) {
    return { ok: false, error: "Select a valid operational timezone." };
  }

  return { ok: true, input: { name, timezone } };
}
