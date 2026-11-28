import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isUuid } from "@/src/trucks/truck-policy";
import { getFeedbackDetailForUser } from "@/src/prisma/feedback-data";
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
  PageHeader,
  Panel,
} from "../../ui";
import {
  feedbackTypeLabel,
  feedbackTypeTone,
  formatFeedbackDate,
} from "../feedback-meta";

type Props = {
  params: Promise<{ feedbackId: string }>;
  searchParams: Promise<OperationsSearchParams>;
};

export default function FeedbackDetailPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading feedback...
        </main>
      }
    >
      <FeedbackDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function FeedbackDetailContent({ params, searchParams }: Props) {
  const [{ feedbackId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(feedbackId)) notFound();

  const context = await getOperationsPageContext(query, { subscriptionExempt: true });
  const feedback = await getFeedbackDetailForUser(
    context.userId,
    context.organization.id,
    feedbackId,
  );
  if (!feedback) notFound();

  const timeZone = context.organization.timezone;

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="feedback"
    >
      <div className="mx-auto max-w-3xl">
        <BackLink
          href={`/dashboard/feedback?${organizationQuery(context.organization.id)}`}
        >
          Back to feedback
        </BackLink>

        <div className="mt-5">
          <PageHeader
            eyebrow="Your feedback"
            title={feedback.subject}
            meta={
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge tone={feedbackTypeTone(feedback.type)}>
                  {feedbackTypeLabel(feedback.type)}
                </Badge>
                <Badge tone={feedback.rating === null ? "neutral" : "info"}>
                  {feedback.rating === null
                    ? "Rating not provided"
                    : `Rating ${feedback.rating} / 5`}
                </Badge>
              </span>
            }
          />
        </div>

        <div className="mt-6 space-y-6">
          <Panel title="Feedback">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {feedback.message}
            </p>
          </Panel>

          <Panel title="Details">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className={labelClass}>Submitted</dt>
                <dd className="mt-1 text-sm text-slate-700">
                  {formatFeedbackDate(feedback.createdAt, timeZone)}
                </dd>
              </div>
              <div>
                <dt className={labelClass}>Last updated</dt>
                <dd className="mt-1 text-sm text-slate-700">
                  {formatFeedbackDate(feedback.updatedAt, timeZone)}
                </dd>
              </div>
              <div>
                <dt className={labelClass}>Type</dt>
                <dd className="mt-1 text-sm text-slate-700">
                  {feedbackTypeLabel(feedback.type)}
                </dd>
              </div>
              <div>
                <dt className={labelClass}>Rating</dt>
                <dd className="mt-1 text-sm text-slate-700">
                  {feedback.rating === null
                    ? "Not provided"
                    : `${feedback.rating} / 5`}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </TruckShell>
  );
}
