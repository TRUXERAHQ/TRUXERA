import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSupportRelatedOptions,
  getSupportRequestsForUser,
  isSupportStaffRole,
} from "@/src/prisma/support-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../operations-page-data";
import TruckShell from "../trucks/truck-shell";
import {
  Badge,
  buttonSecondaryClass,
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  tableCellClass,
  tableClass,
  tableHeadClass,
  tableRowClass,
} from "../ui";
import SupportRequestForm from "./support-form";
import {
  formatSupportDate,
  supportCategoryLabel,
  supportPriorityLabel,
  supportPriorityTone,
  supportStatusLabel,
  supportStatusTone,
} from "./support-meta";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function SupportPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading support...
        </main>
      }
    >
      <SupportContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SupportContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params, { subscriptionExempt: true });
  const organizationId = context.organization.id;

  const [requests, relatedOptions] = await Promise.all([
    getSupportRequestsForUser(context.userId, organizationId),
    getSupportRelatedOptions(context.userId, organizationId),
  ]);
  if (!requests || !relatedOptions) notFound();

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="support"
    >
      <PageHeader
        eyebrow="Customer & assistance"
        title="Support"
        description="Get help with TRUXERA, report an issue, and track your support requests."
        actions={
          isSupportStaffRole(context.membership.role) ? (
            <Link
              href={`/dashboard/support/inbox?${organizationQuery(organizationId)}`}
              className={buttonSecondaryClass}
            >
              Support inbox
            </Link>
          ) : undefined
        }
      />

      {context.created && (
        <div className="mt-5">
          <Notice tone="success">
            Support request submitted. You can track its status below.
          </Notice>
        </div>
      )}

      <div className="mt-6">
        <Panel
          title="Create support request"
          description="Submit a request when you need assistance from the TRUXERA team."
        >
          <SupportRequestForm
            organizationId={organizationId}
            relatedOptions={relatedOptions}
          />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="My Support Requests">
          {requests.length === 0 ? (
            <EmptyState
              title="No support requests yet."
              description="If you need assistance, create a support request and our team can follow up."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Ticket</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Subject</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Category</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Priority</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Status</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Created</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>
                      Last updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id} className={tableRowClass}>
                      <td className={`${tableCellClass} px-3`}>
                        <Link
                          href={`/dashboard/support/${encodeURIComponent(request.id)}?${organizationQuery(organizationId)}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          {request.reference}
                        </Link>
                      </td>
                      <td className={`${tableCellClass} px-3`}>{request.subject}</td>
                      <td className={`${tableCellClass} px-3`}>
                        {supportCategoryLabel(request.category)}
                      </td>
                      <td className={`${tableCellClass} px-3`}>
                        <Badge tone={supportPriorityTone(request.priority)}>
                          {supportPriorityLabel(request.priority)}
                        </Badge>
                      </td>
                      <td className={`${tableCellClass} px-3`}>
                        <Badge tone={supportStatusTone(request.status)}>
                          {supportStatusLabel(request.status)}
                        </Badge>
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap px-3`}>
                        {formatSupportDate(
                          request.createdAt,
                          context.organization.timezone,
                        )}
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap px-3`}>
                        {formatSupportDate(
                          request.updatedAt,
                          context.organization.timezone,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </TruckShell>
  );
}
