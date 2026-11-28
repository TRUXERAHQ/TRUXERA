export type OrganizationProvisioner<TOrganization extends { id: string }> = {
  findMembershipForUser(userId: string): Promise<TOrganization | null>;
  createOrganization(name: string, slug: string): Promise<TOrganization>;
  createOwnerMembership(input: {
    organizationId: string;
    userId: string;
    role: "OWNER";
  }): Promise<void>;
};

function organizationSlug(name: string, userId: string) {
  const normalizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return `${normalizedName || "organization"}-${userId}`;
}

export async function createOrganizationWithOwner<
  TOrganization extends { id: string },
>(
  userId: string,
  name: string,
  provisioner: OrganizationProvisioner<TOrganization>,
) {
  const existingOrganization =
    await provisioner.findMembershipForUser(userId);
  if (existingOrganization) return existingOrganization;

  const organization = await provisioner.createOrganization(
    name,
    organizationSlug(name, userId),
  );
  await provisioner.createOwnerMembership({
    organizationId: organization.id,
    userId,
    role: "OWNER",
  });

  return organization;
}
