import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isUuid } from "@/src/trucks/truck-policy";
import {
  getSupportRequestForUser,
  getSupportTicketForStaff,
} from "@/src/prisma/support-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../operations-page-data";
import TruckShell from "../../trucks/truck-shell";
import {
  BackLink,
  Badge,
  labelClass,
  Notice,
  PageHeader,
  Panel,
} from "../../ui";
import {
  formatSupportDate,
  supportCategoryLabel,
  supportPriorityLabel,
  supportPriorityTone,
  supportRelatedKindLabel,
  supportStatusLabel,
  supportStatusTone,
} from "../support-meta";
import {
  SupportPriorityForm,
  SupportReplyForm,
  SupportResolveForm,
  SupportStatusForm,
} from "../staff-controls";

type Props = {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<OperationsSearchParams>;
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function SupportRequestDetailPage({
  params,
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading support request...
        </main>
      }
    >
      <SupportRequestDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SupportRequestDetailContent({ params, searchParams }: Props) {
  const [{ ticketId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(ticketId)) notFound();

  const context = await getOperationsPageContext(query, { subscriptionExempt: true });

  if (firstValue(query.view) === "inbox") {
    return <StaffTicketView context={context} query={query} ticketId={ticketId} />;
  }
  return <CustomerTicketView context={context} ticketId={ticketId} />;
}

type Context = Awaited<ReturnType<typeof getOperationsPageContext>>;

function RequestBadges({
  status,
  priority,
  category,
}: {
  status: string;
  priority: string;
  category: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={supportStatusTone(status)}>
        {supportStatusLabel(status)}
      </Badge>
      <Badge tone={supportPriorityTone(priority)}>
        {supportPriorityLabel(priority)} priority
      </Badge>
      <Badge tone="neutral">{supportCategoryLabel(category)}</Badge>
    </span>
  );
}

async function CustomerTicketView({
  context,
  ticketId,
}: {
  context: Context;
  ticketId: string;
}) {
  const details = await getSupportRequestForUser(
    context.userId,
    context.organization.id,
    ticketId,
  );
  if (!details) notFound();

  const { request, messages, relatedLabel } = details;
  const timeZone = context.organization.timezone;
  const hasResolution = Boolean(request.resolutionNote);

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="support"
    >
      <div className="mx-auto max-w-4xl">
        <BackLink
          href={`/dashboard/support?${organizationQuery(context.organization.id)}`}
        >
          Back to support
        </BackLink>

        {context.created && (
          <div className="mt-5">
            <Notice tone="success">
              Support request submitted. You can track its status here.
            </Notice>
          </div>
        )}

        <div className="mt-5">
          <PageHeader
            eyebrow="Support request"
            title={request.subject}
            description={request.reference}
            meta={
              <RequestBadges
                status={request.status}
                priority={request.priority}
                category={request.category}
              />
            }
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel title="Description">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {request.description}
              </p>
            </Panel>

            <Panel title="Support conversation">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No messages yet. Replies from the TRUXERA team will appear
                  here.
                </p>
              ) : (
                <ol className="space-y-4">
                  {messages.map((message) => {
                    const isCustomer = message.authorKind === "CUSTOMER";
                    return (
                      <li
                        key={message.id}
                        className={`rounded-lg border px-4 py-3 ${
                          isCustomer
                            ? "border-indigo-100 bg-indigo-50/50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {isCustomer ? "You" : "TRUXERA Support"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatSupportDate(message.createdAt, timeZone)}
                          </p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {message.body}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            {hasResolution && (
              <Panel title="Resolution">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {request.resolutionNote}
                </p>
                {request.resolvedAt && (
                  <p className="mt-3 text-xs text-slate-500">
                    Resolved {formatSupportDate(request.resolvedAt, timeZone)}
                  </p>
                )}
              </Panel>
            )}
          </div>

          <div>
            <Panel title="Request details">
              <dl className="space-y-4">
                <div>
                  <dt className={labelClass}>Ticket ID</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-800">
                    {request.reference}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Status</dt>
                  <dd className="mt-1">
                    <Badge tone={supportStatusTone(request.status)}>
                      {supportStatusLabel(request.status)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Category</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {supportCategoryLabel(request.category)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Priority</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {supportPriorityLabel(request.priority)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Created</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {formatSupportDate(request.createdAt, timeZone)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Last updated</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {formatSupportDate(request.updatedAt, timeZone)}
                  </dd>
                </div>
                {request.relatedKind && request.relatedId && (
                  <div>
                    <dt className={labelClass}>Related item</dt>
                    <dd className="mt-1 text-sm text-slate-700">
                      {supportRelatedKindLabel(request.relatedKind)}
                      {relatedLabel ? ` · ${relatedLabel}` : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </Panel>
          </div>
        </div>
      </div>
    </TruckShell>
  );
}

async function StaffTicketView({
  context,
  query,
  ticketId,
}: {
  context: Context;
  query: OperationsSearchParams;
  ticketId: string;
}) {
  const details = await getSupportTicketForStaff(
    context.userId,
    context.organization.id,
    ticketId,
  );
  if (!details) notFound();

  const { request, messages, relatedLabel } = details;
  const timeZone = context.organization.timezone;
  const organizationId = context.organization.id;
  const requester = request.requester;

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="support"
    >
      <div className="mx-auto max-w-5xl">
        <BackLink
          href={`/dashboard/support/inbox?${organizationQuery(organizationId)}`}
        >
          Back to support inbox
        </BackLink>

        {firstValue(query.replied) === "1" && (
          <div className="mt-5">
            <Notice tone="success">Reply sent.</Notice>
          </div>
        )}
        {firstValue(query.updated) === "1" && (
          <div className="mt-5">
            <Notice tone="success">Support request updated.</Notice>
          </div>
        )}
        {firstValue(query.resolved) === "1" && (
          <div className="mt-5">
            <Notice tone="success">Support request resolved.</Notice>
          </div>
        )}

        <div className="mt-5">
          <PageHeader
            eyebrow="Support inbox"
            title={request.subject}
            description={`${request.reference} · ${requester?.name ?? "Unknown customer"}`}
            meta={
              <RequestBadges
                status={request.status}
                priority={request.priority}
                category={request.category}
              />
            }
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel title="Request">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {request.description}
              </p>
              {request.relatedKind && request.relatedId && (
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  <span className="font-medium text-slate-500">Related item: </span>
                  {supportRelatedKindLabel(request.relatedKind)}
                  {relatedLabel ? ` · ${relatedLabel}` : ""}
                </p>
              )}
            </Panel>

            <Panel title="Support conversation">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No messages on this request yet.
                </p>
              ) : (
                <ol className="space-y-4">
                  {messages.map((message) => {
                    const isCustomer = message.authorKind === "CUSTOMER";
                    const authorName = message.author?.name;
                    const label = authorName
                      ? `${isCustomer ? "Customer" : "TRUXERA Support"} — ${authorName}`
                      : isCustomer
                        ? "Customer"
                        : "TRUXERA Support";
                    return (
                      <li
                        key={message.id}
                        className={`rounded-lg border px-4 py-3 ${
                          isCustomer
                            ? "border-indigo-100 bg-indigo-50/50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {label}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatSupportDate(message.createdAt, timeZone)}
                          </p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {message.body}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="mt-5 border-t border-slate-100 pt-5">
                <SupportReplyForm
                  organizationId={organizationId}
                  ticketId={request.id}
                />
              </div>
            </Panel>

            <Panel title="Resolution">
              {request.resolutionNote ? (
                <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {request.resolutionNote}
                  </p>
                  {request.resolvedAt && (
                    <p className="mt-2 text-xs text-slate-500">
                      Resolved {formatSupportDate(request.resolvedAt, timeZone)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mb-5 text-sm text-slate-500">
                  No resolution recorded yet.
                </p>
              )}
              <SupportResolveForm
                organizationId={organizationId}
                ticketId={request.id}
              />
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Manage request">
              <div className="space-y-5">
                <SupportStatusForm
                  organizationId={organizationId}
                  ticketId={request.id}
                  currentStatus={request.status}
                />
                <div className="border-t border-slate-100 pt-5">
                  <SupportPriorityForm
                    organizationId={organizationId}
                    ticketId={request.id}
                    currentPriority={request.priority}
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Request details">
              <dl className="space-y-4">
                <div>
                  <dt className={labelClass}>Ticket ID</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-800">
                    {request.reference}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Customer</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {requester?.name ?? "Unknown"}
                    {requester?.email ? (
                      <span className="block text-xs text-slate-500">
                        {requester.email}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Organization</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {context.organization.name}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Status</dt>
                  <dd className="mt-1">
                    <Badge tone={supportStatusTone(request.status)}>
                      {supportStatusLabel(request.status)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Category</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {supportCategoryLabel(request.category)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Priority</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {supportPriorityLabel(request.priority)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Created</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {formatSupportDate(request.createdAt, timeZone)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>Last updated</dt>
                  <dd className="mt-1 text-sm text-slate-700">
                    {formatSupportDate(request.updatedAt, timeZone)}
                  </dd>
                </div>
              </dl>
            </Panel>
          </div>
        </div>
      </div>
    </TruckShell>
  );
}
