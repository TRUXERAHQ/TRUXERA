import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSupportInboxForStaff,
  isSupportStaffRole,
} from "@/src/prisma/support-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../operations-page-data";
import TruckShell from "../../trucks/truck-shell";
import {
  Badge,
  buttonSecondaryClass,
  EmptyState,
  labelClass,
  PageHeader,
  Panel,
  tableCellClass,
  tableClass,
  tableHeadClass,
  tableRowClass,
} from "../../ui";
import {
  formatSupportDate,
  supportCategoryLabel,
  supportPriorityLabel,
  supportPriorityTone,
  supportStatusLabel,
  supportStatusTone,
} from "../support-meta";

type Props = { searchParams: Promise<OperationsSearchParams> };

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

const statusOptions = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_FOR_CUSTOMER", label: "Waiting for Customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

const priorityOptions = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const categoryOptions = [
  { value: "TECHNICAL_ISSUE", label: "Technical Issue" },
  { value: "DATA_ISSUE", label: "Data Issue" },
  { value: "ACCOUNT_ACCESS", label: "Account & Access" },
  { value: "FLEET_OPERATIONS", label: "Fleet Operations" },
  { value: "OTHER", label: "Other" },
];

export default function SupportInboxPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading support inbox...
        </main>
      }
    >
      <SupportInboxContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SupportInboxContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params);
  if (!isSupportStaffRole(context.membership.role)) notFound();

  const organizationId = context.organization.id;
  const filters = {
    status: firstValue(params.status) ?? "",
    priority: firstValue(params.priority) ?? "",
    category: firstValue(params.category) ?? "",
  };

  const requests = await getSupportInboxForStaff(
    context.userId,
    organizationId,
    filters,
  );
  if (!requests) notFound();

  const hasFilters = Boolean(filters.status || filters.priority || filters.category);

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="support"
    >
      <PageHeader
        eyebrow="Customer & assistance"
        title="Support Inbox"
        description="Review and manage customer support requests across your organization."
        actions={
          <Link
            href={`/dashboard/support?${organizationQuery(organizationId)}`}
            className={buttonSecondaryClass}
          >
            My support requests
          </Link>
        }
      />

      <div className="mt-6">
        <Panel title="Filters">
          <form method="get" className="flex flex-wrap items-end gap-4">
            <input
              type="hidden"
              name="organizationId"
              value={organizationId}
            />
            <div>
              <label htmlFor="filter-status" className={labelClass}>
                Status
              </label>
              <select
                id="filter-status"
                name="status"
                defaultValue={filters.status}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">All</option>
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-priority" className={labelClass}>
                Priority
              </label>
              <select
                id="filter-priority"
                name="priority"
                defaultValue={filters.priority}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">All</option>
                {priorityOptions.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-category" className={labelClass}>
                Category
              </label>
              <select
                id="filter-category"
                name="category"
                defaultValue={filters.category}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">All</option>
                {categoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className={buttonSecondaryClass}
              >
                Apply
              </button>
              {hasFilters && (
                <Link
                  href={`/dashboard/support/inbox?${organizationQuery(organizationId)}`}
                  className="text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  Reset
                </Link>
              )}
            </div>
          </form>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Support requests">
          {requests.length === 0 ? (
            <EmptyState
              title="No support requests yet."
              description={
                hasFilters
                  ? "No requests match the selected filters."
                  : "Customer support requests for this organization will appear here."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Ticket</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Subject</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Customer</th>
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
                          href={`/dashboard/support/${encodeURIComponent(request.id)}?view=inbox&${organizationQuery(organizationId)}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          {request.reference}
                        </Link>
                      </td>
                      <td className={`${tableCellClass} px-3`}>{request.subject}</td>
                      <td className={`${tableCellClass} px-3`}>
                        {request.requester?.name ?? "Unknown"}
                      </td>
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
