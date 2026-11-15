import { connectDatabase, db } from "./db";
import { createOrganizationWithOwner } from "./onboarding-service";

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
