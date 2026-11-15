export function selectAccessibleOrganization<T extends { id: string }>(
  organizations: T[],
  requestedOrganizationId?: string,
) {
  return (
    organizations.find(({ id }) => id === requestedOrganizationId) ??
    organizations[0] ??
    null
  );
}

export async function loadForAccessibleOrganization<
  TOrganization extends { id: string },
  TData,
>(
  organizations: TOrganization[],
  requestedOrganizationId: string | undefined,
  load: (organizationId: string) => Promise<TData>,
) {
  const organization = selectAccessibleOrganization(
    organizations,
    requestedOrganizationId,
  );

  if (!organization) {
    return { organization: null, data: null };
  }

  return {
    organization,
    data: await load(organization.id),
  };
}
