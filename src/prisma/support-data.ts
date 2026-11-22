import { getMembershipForUserInOrganization } from "./organization-data";
import { connectDatabase, db } from "./db";
import { isUuid } from "@/src/trucks/truck-policy";

export type SupportCategoryValue =
  | "TECHNICAL_ISSUE"
  | "DATA_ISSUE"
  | "ACCOUNT_ACCESS"
  | "FLEET_OPERATIONS"
  | "OTHER";

export type SupportPriorityValue = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type SupportStatusValue =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_CUSTOMER"
  | "RESOLVED"
  | "CLOSED";

export type SupportRelatedKindValue =
  | "LOAD"
  | "DELIVERY"
  | "TRUCK"
  | "DRIVER";

export type SupportRequestInput = {
  subject: string;
  category: SupportCategoryValue;
  priority: SupportPriorityValue;
  description: string;
  relatedKind: SupportRelatedKindValue | null;
  relatedId: string | null;
};

export type SupportRelatedOption = {
  kind: SupportRelatedKindValue;
  id: string;
  label: string;
};

type MutationResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const supportCategories = new Set<SupportCategoryValue>([
  "TECHNICAL_ISSUE",
  "DATA_ISSUE",
  "ACCOUNT_ACCESS",
  "FLEET_OPERATIONS",
  "OTHER",
]);

const supportPriorities = new Set<SupportPriorityValue>([
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
]);

const supportStatuses = new Set<SupportStatusValue>([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_CUSTOMER",
  "RESOLVED",
  "CLOSED",
]);

const supportStaffRoles = new Set(["OWNER", "ADMIN"]);

const supportRelatedKinds = new Set<SupportRelatedKindValue>([
  "LOAD",
  "DELIVERY",
  "TRUCK",
  "DRIVER",
]);

async function isOrganizationMember(userId: string, organizationId: string) {
  if (!isUuid(organizationId)) return false;
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  return Boolean(membership);
}

export function isSupportCategory(value: unknown): value is SupportCategoryValue {
  return supportCategories.has(value as SupportCategoryValue);
}

export function isSupportPriority(value: unknown): value is SupportPriorityValue {
  return supportPriorities.has(value as SupportPriorityValue);
}

export function isSupportStatus(value: unknown): value is SupportStatusValue {
  return supportStatuses.has(value as SupportStatusValue);
}

export function isSupportStaffRole(role: string | null | undefined) {
  return supportStaffRoles.has(role ?? "");
}

export function isSupportRelatedKind(
  value: unknown,
): value is SupportRelatedKindValue {
  return supportRelatedKinds.has(value as SupportRelatedKindValue);
}

export async function getSupportRequestsForUser(
  userId: string,
  organizationId: string,
) {
  if (!(await isOrganizationMember(userId, organizationId))) return null;

  return db.orm.public.SupportRequest.where({
    organizationId,
    requesterUserId: userId,
  })
    .orderBy((request) => request.createdAt.desc())
    .all();
}

async function resolveRelatedLabel(
  organizationId: string,
  kind: SupportRelatedKindValue,
  relatedId: string,
) {
  if (kind === "LOAD") {
    const load = await db.orm.public.Load.where({
      organizationId,
      id: relatedId,
    }).first();
    return load ? `Load ${load.reference}` : null;
  }
  if (kind === "DELIVERY") {
    const delivery = await db.orm.public.Delivery.where({
      organizationId,
      id: relatedId,
    })
      .include("load")
      .first();
    if (!delivery) return null;
    const base = delivery.reference
      ? `Delivery ${delivery.reference}`
      : `Delivery stop ${delivery.stopNumber}`;
    return delivery.load ? `${base} · ${delivery.load.reference}` : base;
  }
  if (kind === "TRUCK") {
    const truck = await db.orm.public.Truck.where({
      organizationId,
      id: relatedId,
    }).first();
    return truck ? `Truck ${truck.unitNumber}` : null;
  }
  const driver = await db.orm.public.Driver.where({
    organizationId,
    id: relatedId,
  }).first();
  return driver ? `Driver ${driver.name}` : null;
}

export async function getSupportRequestForUser(
  userId: string,
  organizationId: string,
  ticketId: string,
) {
  if (
    !isUuid(ticketId) ||
    !(await isOrganizationMember(userId, organizationId))
  ) {
    return null;
  }

  const request = await db.orm.public.SupportRequest.where({
    organizationId,
    id: ticketId,
    requesterUserId: userId,
  }).first();
  if (!request) return null;

  const [messages, relatedLabel] = await Promise.all([
    db.orm.public.SupportMessage.where({
      organizationId,
      requestId: request.id,
    })
      .orderBy((message) => message.createdAt.asc())
      .all(),
    request.relatedKind && request.relatedId
      ? resolveRelatedLabel(organizationId, request.relatedKind, request.relatedId)
      : Promise.resolve(null),
  ]);

  return { request, messages, relatedLabel };
}

export async function getSupportRelatedOptions(
  userId: string,
  organizationId: string,
): Promise<SupportRelatedOption[] | null> {
  if (!(await isOrganizationMember(userId, organizationId))) return null;

  const [loads, deliveries, trucks, drivers] = await Promise.all([
    db.orm.public.Load.where({ organizationId })
      .orderBy((load) => load.createdAt.desc())
      .all(),
    db.orm.public.Delivery.where({ organizationId })
      .include("load")
      .orderBy((delivery) => delivery.stopNumber.asc())
      .all(),
    db.orm.public.Truck.where({ organizationId })
      .orderBy((truck) => truck.unitNumber.asc())
      .all(),
    db.orm.public.Driver.where({ organizationId })
      .orderBy((driver) => driver.name.asc())
      .all(),
  ]);

  return [
    ...loads.map((load) => ({
      kind: "LOAD" as const,
      id: load.id,
      label: `Load ${load.reference} — ${load.customerName}`,
    })),
    ...deliveries.map((delivery) => ({
      kind: "DELIVERY" as const,
      id: delivery.id,
      label: delivery.reference
        ? `Delivery ${delivery.reference} · ${delivery.load.reference}`
        : `Delivery stop ${delivery.stopNumber} · ${delivery.load.reference}`,
    })),
    ...trucks.map((truck) => ({
      kind: "TRUCK" as const,
      id: truck.id,
      label: `Truck ${truck.unitNumber}`,
    })),
    ...drivers.map((driver) => ({
      kind: "DRIVER" as const,
      id: driver.id,
      label: `Driver ${driver.name}`,
    })),
  ];
}

async function relatedEntityExists(
  organizationId: string,
  kind: SupportRelatedKindValue,
  relatedId: string,
) {
  if (kind === "LOAD") {
    return Boolean(
      await db.orm.public.Load.where({ organizationId, id: relatedId }).first(),
    );
  }
  if (kind === "DELIVERY") {
    return Boolean(
      await db.orm.public.Delivery.where({
        organizationId,
        id: relatedId,
      }).first(),
    );
  }
  if (kind === "TRUCK") {
    return Boolean(
      await db.orm.public.Truck.where({
        organizationId,
        id: relatedId,
      }).first(),
    );
  }
  return Boolean(
    await db.orm.public.Driver.where({
      organizationId,
      id: relatedId,
    }).first(),
  );
}

export async function createSupportRequestForUser(
  userId: string,
  organizationId: string,
  input: SupportRequestInput,
): Promise<MutationResult<{ id: string; reference: string }>> {
  if (!isUuid(organizationId)) {
    return { ok: false, error: "Select a valid organization." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const membership = await tx.orm.public.Membership.where({
      userId,
      organizationId,
    })
      .forNoKeyUpdate()
      .first();
    if (!membership || membership.organizationId !== organizationId) {
      return {
        ok: false,
        error: "You do not have access to this organization.",
      };
    }

    const organization = await tx.orm.public.Organization.where({
      id: organizationId,
    }).first();
    if (!organization) {
      return { ok: false, error: "The selected organization was not found." };
    }

    const relatedKind = input.relatedKind;
    const relatedId = input.relatedId;
    if ((relatedKind === null) !== (relatedId === null)) {
      return { ok: false, error: "The related item is invalid." };
    }
    if (
      relatedKind &&
      relatedId &&
      !(await relatedEntityExists(organizationId, relatedKind, relatedId))
    ) {
      return {
        ok: false,
        error: "The selected related item could not be found.",
      };
    }

    const id = crypto.randomUUID();
    const reference = `TXS-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;

    const request = await tx.orm.public.SupportRequest.create({
      id,
      organizationId,
      requesterUserId: userId,
      reference,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      status: "OPEN",
      description: input.description,
      relatedKind,
      relatedId,
      resolutionNote: null,
      resolvedAt: null,
    });

    await tx.orm.public.SupportMessage.create({
      organizationId,
      requestId: request.id,
      authorUserId: userId,
      authorKind: "CUSTOMER",
      body: input.description,
    });

    return { ok: true, value: { id: request.id, reference } };
  });
}

export type SupportInboxFilters = {
  status?: string;
  priority?: string;
  category?: string;
};

async function getStaffMembership(userId: string, organizationId: string) {
  if (!isUuid(organizationId)) return null;
  const membership = await getMembershipForUserInOrganization(
    userId,
    organizationId,
  );
  return membership && isSupportStaffRole(membership.role) ? membership : null;
}

export async function getSupportInboxForStaff(
  userId: string,
  organizationId: string,
  filters: SupportInboxFilters,
) {
  if (!(await getStaffMembership(userId, organizationId))) return null;

  return db.orm.public.SupportRequest.where({
    organizationId,
    ...(isSupportStatus(filters.status) ? { status: filters.status } : {}),
    ...(isSupportPriority(filters.priority)
      ? { priority: filters.priority }
      : {}),
    ...(isSupportCategory(filters.category)
      ? { category: filters.category }
      : {}),
  })
    .include("requester")
    .orderBy((request) => request.updatedAt.desc())
    .all();
}

export async function getSupportTicketForStaff(
  userId: string,
  organizationId: string,
  ticketId: string,
) {
  if (
    !isUuid(ticketId) ||
    !(await getStaffMembership(userId, organizationId))
  ) {
    return null;
  }

  const request = await db.orm.public.SupportRequest.where({
    organizationId,
    id: ticketId,
  })
    .include("requester")
    .first();
  if (!request) return null;

  const [messages, relatedLabel] = await Promise.all([
    db.orm.public.SupportMessage.where({
      organizationId,
      requestId: request.id,
    })
      .include("author")
      .orderBy((message) => message.createdAt.asc())
      .all(),
    request.relatedKind && request.relatedId
      ? resolveRelatedLabel(organizationId, request.relatedKind, request.relatedId)
      : Promise.resolve(null),
  ]);

  return { request, messages, relatedLabel };
}

async function authorizeStaffWrite(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  organizationId: string,
): Promise<{ ok: false; error: string } | null> {
  const membership = await tx.orm.public.Membership.where({
    userId,
    organizationId,
  })
    .forNoKeyUpdate()
    .first();
  if (!membership || !isSupportStaffRole(membership.role)) {
    return {
      ok: false,
      error: "You do not have permission to manage support requests.",
    };
  }
  return null;
}

async function getStaffTicketInTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  ticketId: string,
) {
  return tx.orm.public.SupportRequest.where({
    organizationId,
    id: ticketId,
  }).first();
}

export async function sendSupportReplyForStaff(
  userId: string,
  organizationId: string,
  ticketId: string,
  body: string,
): Promise<MutationResult<{ id: string }>> {
  if (!isUuid(organizationId) || !isUuid(ticketId)) {
    return { ok: false, error: "The support request could not be found." };
  }
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Reply cannot be empty." };
  if (trimmed.length > 5000) {
    return { ok: false, error: "Reply must be 5,000 characters or fewer." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeStaffWrite(tx, userId, organizationId);
    if (denied) return denied;

    const request = await getStaffTicketInTransaction(
      tx,
      organizationId,
      ticketId,
    );
    if (!request) {
      return { ok: false, error: "The support request could not be found." };
    }

    const message = await tx.orm.public.SupportMessage.create({
      organizationId,
      requestId: request.id,
      authorUserId: userId,
      authorKind: "SUPPORT",
      body: trimmed,
    });

    return { ok: true, value: { id: message.id } };
  });
}

export async function updateSupportStatusForStaff(
  userId: string,
  organizationId: string,
  ticketId: string,
  status: string,
): Promise<MutationResult> {
  if (!isUuid(organizationId) || !isUuid(ticketId) || !isSupportStatus(status)) {
    return { ok: false, error: "The support request could not be updated." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeStaffWrite(tx, userId, organizationId);
    if (denied) return denied;

    const request = await getStaffTicketInTransaction(
      tx,
      organizationId,
      ticketId,
    );
    if (!request) {
      return { ok: false, error: "The support request could not be found." };
    }

    await tx.orm.public.SupportRequest.where({
      organizationId,
      id: ticketId,
    }).update({ status });

    return { ok: true, value: undefined };
  });
}

export async function updateSupportPriorityForStaff(
  userId: string,
  organizationId: string,
  ticketId: string,
  priority: string,
): Promise<MutationResult> {
  if (
    !isUuid(organizationId) ||
    !isUuid(ticketId) ||
    !isSupportPriority(priority)
  ) {
    return { ok: false, error: "The support request could not be updated." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeStaffWrite(tx, userId, organizationId);
    if (denied) return denied;

    const request = await getStaffTicketInTransaction(
      tx,
      organizationId,
      ticketId,
    );
    if (!request) {
      return { ok: false, error: "The support request could not be found." };
    }

    await tx.orm.public.SupportRequest.where({
      organizationId,
      id: ticketId,
    }).update({ priority });

    return { ok: true, value: undefined };
  });
}

export async function resolveSupportRequestForStaff(
  userId: string,
  organizationId: string,
  ticketId: string,
  resolutionNote: string,
): Promise<MutationResult> {
  if (!isUuid(organizationId) || !isUuid(ticketId)) {
    return { ok: false, error: "The support request could not be updated." };
  }
  const trimmed = resolutionNote.trim();
  if (!trimmed) {
    return { ok: false, error: "Resolution note is required." };
  }
  if (trimmed.length > 5000) {
    return { ok: false, error: "Resolution note must be 5,000 characters or fewer." };
  }
  await connectDatabase();

  return db.transaction(async (tx) => {
    const denied = await authorizeStaffWrite(tx, userId, organizationId);
    if (denied) return denied;

    const request = await getStaffTicketInTransaction(
      tx,
      organizationId,
      ticketId,
    );
    if (!request) {
      return { ok: false, error: "The support request could not be found." };
    }

    await tx.orm.public.SupportRequest.where({
      organizationId,
      id: ticketId,
    }).update({
      status: "RESOLVED",
      resolutionNote: trimmed,
      resolvedAt: new Date(),
    });

    return { ok: true, value: undefined };
  });
}
