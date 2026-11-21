import { Suspense } from "react";
import { notFound } from "next/navigation";
import TruckShell from "../trucks/truck-shell";
import {
  getOperationsPageContext,
  type OperationsSearchParams,
} from "../operations-page-data";
import { getDispatchBoardForOrganization } from "@/src/prisma/operations-data";
import { buildDailyOperationsSummary } from "@/src/dashboard/daily-summary";
import { buildDailyDeliveryInputs } from "../report-data";
import DailySummaryView from "./daily-summary-view";

type SearchParams = OperationsSearchParams & { date?: string | string[] };

type Props = { searchParams: Promise<SearchParams> };

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function todayInTimezone(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function DailySummaryPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading daily operations summary...
        </main>
      }
    >
      <DailySummaryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DailySummaryContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params);
  const board = await getDispatchBoardForOrganization(
    context.userId,
    context.organization.id,
  );
  if (!board) notFound();

  const timezone = context.organization.timezone;
  const requestedDate = firstValue(params.date);
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : todayInTimezone(timezone);

  const dailyInputs = buildDailyDeliveryInputs(
    board,
    context.organization.id,
    timezone,
  );

  const summary = buildDailyOperationsSummary({
    date,
    timezone,
    deliveries: dailyInputs,
  });

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="daily-summary"
    >
      <DailySummaryView
        summary={summary}
        organizationId={context.organization.id}
        selectedDate={date}
      />
    </TruckShell>
  );
}
