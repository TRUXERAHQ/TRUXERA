export type OrganizationProvisioner<TOrganization extends { id: string }> = {
  findMembershipForUser(userId: string): Promise<TOrganization | null>;
  createOrganization(name: string, slug: string): Promise<TOrganization>;
  createOwnerMembership(input: {
    organizationId: string;
    userId: string;
    role: "OWNER";
  }): Promise<void>;
  /**
   * Optional: provisions the organization's initial billing state. Only
   * invoked when a NEW organization is created — never for an existing
   * membership/org — so legacy organizations are never converted to a
   * new trial. Runs inside the caller's transaction.
   */
  createTrialSubscription?(input: {
    organizationId: string;
    trialStartAt: Date;
    trialEndAt: Date;
  }): Promise<void>;
};

/** Internal trial length: exactly 7 days from onboarding completion. */
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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
  now: Date = new Date(),
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
  if (provisioner.createTrialSubscription) {
    await provisioner.createTrialSubscription({
      organizationId: organization.id,
      trialStartAt: now,
      trialEndAt: new Date(now.getTime() + TRIAL_DURATION_MS),
    });
  }

  return organization;
}
