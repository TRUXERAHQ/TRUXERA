import { connectDatabase, db } from "./db";
import { createOrganizationWithOwner } from "./onboarding-service";
import {
  canAdministerOrganizationSettings,
  type OrganizationSettingsInput,
} from "@/src/settings/organization-settings";

export async function getOrganizationsForUser(userId: string) {
  await connectDatabase();

  const memberships = await db.orm.public.Membership.where({ userId })
    .include("organization")
    .orderBy((membership) => membership.createdAt.asc())
    .all();

  return memberships.map(({ organization }) => organization);
}

export async function getMembershipForUserInOrganization(
  userId: string,
  organizationId: string,
) {
  await connectDatabase();

  return db.orm.public.Membership.where({ userId, organizationId }).first();
}

export async function createOrganizationForUser(userId: string, name: string) {
  await connectDatabase();

  return db.transaction(async (tx) => {
    const user = await tx.orm.public.User.where({ id: userId })
      .forNoKeyUpdate()
      .first();

    if (!user) {
      throw new Error("The authenticated user record could not be found.");
    }

    return createOrganizationWithOwner(userId, name, {
      findMembershipForUser: async (memberUserId) => {
        const membership = await tx.orm.public.Membership.where({
          userId: memberUserId,
        })
          .include("organization")
          .orderBy((membership) => membership.createdAt.asc())
          .first();

        return membership?.organization ?? null;
      },
      createOrganization: (organizationName, slug) =>
        tx.orm.public.Organization.create({
          name: organizationName,
          slug,
        }),
      createOwnerMembership: async ({ organizationId, userId, role }) => {
        await tx.orm.public.Membership.create({
          organizationId,
          userId,
          role,
        });
      },
    });
  });
}

type SettingsMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateOrganizationSettingsForUser(
  userId: string,
  organizationId: string,
  input: OrganizationSettingsInput,
): Promise<SettingsMutationResult> {
  await connectDatabase();

  return db.transaction(async (tx) => {
    const membership = await tx.orm.public.Membership.where({
      userId,
      organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (
      !membership ||
      !canAdministerOrganizationSettings(membership.role)
    ) {
      return {
        ok: false,
        error:
          "Only organization owners and admins can update these settings.",
      };
    }

    const organization = await tx.orm.public.Organization.where({
      id: organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!organization) {
      return { ok: false, error: "The selected organization was not found." };
    }

    await tx.orm.public.Organization.where({ id: organizationId }).update({
      name: input.name,
      timezone: input.timezone,
    });

    return { ok: true };
  });
}
