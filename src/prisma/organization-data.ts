import { connectDatabase, db } from "./db";
import { createOrganizationWithOwner } from "./onboarding-service";
import {
  canAdministerOrganizationSettings,
  type OrganizationSettingsInput,
} from "../settings/organization-settings";
import {
  ACCOUNT_SUSPENDED_ERROR,
  canManageAccountStatus,
  isAccountWritable,
  parseAccountStatusChange,
  type AccountStatus,
} from "../account/account-status";
import { authorizeFleetAccess, isUuid } from "../trucks/truck-policy";

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
      createTrialSubscription: async ({
        organizationId,
        trialStartAt,
        trialEndAt,
      }) => {
        await tx.orm.public.BillingSubscription.create({
          organizationId,
          plan: "TRIAL",
          status: "TRIAL",
          trialStartAt,
          trialEndAt,
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
    if (!isAccountWritable(organization.status)) {
      return { ok: false, error: ACCOUNT_SUSPENDED_ERROR };
    }

    await tx.orm.public.Organization.where({ id: organizationId }).update({
      name: input.name,
      timezone: input.timezone,
    });

    return { ok: true };
  });
}

export type AccountOverview = {
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    status: AccountStatus;
    createdAt: Date | null;
  };
  owner: { name: string; email: string } | null;
  adminCount: number;
  memberCount: number;
  counts: {
    activeTrucks: number;
    drivers: number;
    loads: number;
    deliveries: number;
  };
};

/**
 * Read-only account overview for the settings surface. Every query is
 * organization-scoped and gated by an existing organization membership.
 * Returns null when the user cannot read the organization.
 */
export async function getAccountOverviewForUser(
  userId: string,
  organizationId: string,
): Promise<AccountOverview | null> {
  if (!isUuid(organizationId)) return null;
  await connectDatabase();

  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  if (!authorizeFleetAccess(membership, organizationId)) return null;

  const [organization, memberships, trucks, drivers, loads, deliveries] =
    await Promise.all([
      db.orm.public.Organization.where({ id: organizationId }).first(),
      db.orm.public.Membership.where({ organizationId })
        .include("user")
        .all(),
      db.orm.public.Truck.where({ organizationId, deactivatedAt: null })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.Driver.where({ organizationId })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.Load.where({ organizationId })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
      db.orm.public.Delivery.where({ organizationId })
        .aggregate((aggregate) => ({ total: aggregate.count() })),
    ]);

  if (!organization) return null;

  const ownerMembership = memberships.find((m) => m.role === "OWNER");

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      timezone: organization.timezone,
      status: organization.status as AccountStatus,
      createdAt: organization.createdAt ?? null,
    },
    owner: ownerMembership?.user
      ? {
          name: ownerMembership.user.name,
          email: ownerMembership.user.email,
        }
      : null,
    adminCount: memberships.filter(
      (m) => m.role === "OWNER" || m.role === "ADMIN",
    ).length,
    memberCount: memberships.length,
    counts: {
      activeTrucks: trucks.total,
      drivers: drivers.total,
      loads: loads.total,
      deliveries: deliveries.total,
    },
  };
}

type AccountStatusMutationResult =
  | {
      ok: true;
      status: AccountStatus;
      previousStatus: AccountStatus;
      changed: boolean;
    }
  | { ok: false; error: string };

/**
 * Changes the organization account lifecycle status. Restricted to
 * OWNER/ADMIN via the existing organization-settings authorization. The
 * mutation is non-destructive: no operational data, integrations,
 * credentials, signals, or history are touched. Every transition is
 * recorded as an ACCOUNT_STATUS_CHANGED IntegrationEvent with the actor,
 * previous state, and new state.
 */
export async function setOrganizationStatusForUser(
  userId: string,
  organizationId: string,
  values: { status?: unknown; confirm?: unknown },
): Promise<AccountStatusMutationResult> {
  await connectDatabase();

  const parsed = parseAccountStatusChange(values);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const target = parsed.target;

  return db.transaction(async (tx) => {
    const membership = await tx.orm.public.Membership.where({
      userId,
      organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!membership || !canManageAccountStatus(membership.role)) {
      return {
        ok: false,
        error:
          "Only organization owners and admins can change the account status.",
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

    const previousStatus = organization.status as AccountStatus;
    if (previousStatus === target) {
      return { ok: true, status: target, previousStatus, changed: false };
    }

    await tx.orm.public.Organization.where({ id: organizationId }).update({
      status: target,
    });

    await tx.orm.public.IntegrationEvent.create({
      organizationId,
      integrationId: null,
      actorUserId: userId,
      kind: "ACCOUNT_STATUS_CHANGED" as never,
      message: `Account status changed from ${previousStatus} to ${target}.`,
      metadata: JSON.stringify({ previousStatus, newStatus: target }),
    });

    return { ok: true, status: target, previousStatus, changed: true };
  });
}
