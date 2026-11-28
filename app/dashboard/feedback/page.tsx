import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFeedbackForUser } from "@/src/prisma/feedback-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../operations-page-data";
import TruckShell from "../trucks/truck-shell";
import {
  Badge,
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  tableCellClass,
  tableClass,
  tableHeadClass,
  tableRowClass,
} from "../ui";
import FeedbackForm from "./feedback-form";
import {
  feedbackTypeLabel,
  feedbackTypeTone,
  formatFeedbackDate,
} from "./feedback-meta";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function FeedbackPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading feedback...
        </main>
      }
    >
      <FeedbackContent searchParams={searchParams} />
    </Suspense>
  );
}

async function FeedbackContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params, { subscriptionExempt: true });
  const organizationId = context.organization.id;

  const feedback = await getFeedbackForUser(context.userId, organizationId);
  if (!feedback) notFound();

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="feedback"
    >
      <PageHeader
        title="Feedback"
        description="Help us improve TRUXERA. Share a product idea, feature request, or experience with the platform."
      />

      {context.created && (
        <div className="mt-5">
          <Notice tone="success">
            Feedback submitted. Thank you — it helps shape what we build next.
          </Notice>
        </div>
      )}

      <div className="mt-6">
        <Panel
          title="Share feedback"
          description="Product suggestions, feature requests, UX impressions, and general feedback are all welcome."
        >
          <FeedbackForm organizationId={organizationId} />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title="My Feedback"
          description="Your submitted feedback and product suggestions."
        >
          {feedback.length === 0 ? (
            <EmptyState
              title="No feedback submitted yet."
              description="Share your first idea or suggestion to help improve TRUXERA."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Feedback</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Type</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Rating</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>Submitted</th>
                    <th className={`${tableHeadClass} px-3 py-2.5`}>
                      Last updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map((item) => (
                    <tr key={item.id} className={tableRowClass}>
                      <td className={`${tableCellClass} px-3`}>
                        <Link
                          href={`/dashboard/feedback/${encodeURIComponent(item.id)}?${organizationQuery(organizationId)}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          {item.subject}
                        </Link>
                      </td>
                      <td className={`${tableCellClass} px-3`}>
                        <Badge tone={feedbackTypeTone(item.type)}>
                          {feedbackTypeLabel(item.type)}
                        </Badge>
                      </td>
                      <td className={`${tableCellClass} px-3`}>
                        {item.rating === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <Badge tone="info">{item.rating} / 5</Badge>
                        )}
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap px-3`}>
                        {formatFeedbackDate(
                          item.createdAt,
                          context.organization.timezone,
                        )}
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap px-3`}>
                        {formatFeedbackDate(
                          item.updatedAt,
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
