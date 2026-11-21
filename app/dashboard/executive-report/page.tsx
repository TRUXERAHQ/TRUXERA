import { Suspense } from "react";
import { notFound } from "next/navigation";
import TruckShell from "../trucks/truck-shell";
import {
  getOperationsPageContext,
  type OperationsSearchParams,
} from "../operations-page-data";
import { getDispatchBoardForOrganization } from "@/src/prisma/operations-data";
import { buildDailyDeliveryInputs } from "../report-data";
import {
  buildExecutiveReport,
  previousPeriodAnchor,
  resolvePeriodBounds,
  type ReportPeriodKind,
} from "@/src/dashboard/executive-report";
import ExecutiveReportView from "./executive-report-view";

type SearchParams = OperationsSearchParams & {
  period?: string | string[];
  anchor?: string | string[];
};

type Props = { searchParams: Promise<SearchParams> };

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function currentPeriodAnchor(
  kind: ReportPeriodKind,
  timezone: string,
) {
  try {
    if (kind === "week") {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    }
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
  } catch {
    return kind === "week"
      ? new Date().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 7);
  }
}

export default function ExecutiveReportPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading executive report...
        </main>
      }
    >
      <ExecutiveReportContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ExecutiveReportContent({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getOperationsPageContext(params);
  const board = await getDispatchBoardForOrganization(
    context.userId,
    context.organization.id,
  );
  if (!board) notFound();

  const timezone = context.organization.timezone;
  const kind: ReportPeriodKind =
    firstValue(params.period) === "week" ? "week" : "month";
  const requestedAnchor = firstValue(params.anchor);
  const anchor =
    requestedAnchor &&
    (kind === "week"
      ? /^\d{4}-\d{2}-\d{2}$/.test(requestedAnchor)
      : /^\d{4}-\d{2}$/.test(requestedAnchor))
      ? requestedAnchor
      : currentPeriodAnchor(kind, timezone);

  const dailyInputs = buildDailyDeliveryInputs(
    board,
    context.organization.id,
    timezone,
  );
  const report = buildExecutiveReport({
    kind,
    anchor,
    timezone,
    deliveries: dailyInputs,
  });

  const periodBounds = resolvePeriodBounds(kind, anchor, timezone);
  const prevAnchor = previousPeriodAnchor(kind, anchor);

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="executive-report"
    >
      <ExecutiveReportView
        report={report}
        organizationId={context.organization.id}
        kind={kind}
        anchor={anchor}
        previousAnchor={prevAnchor}
        periodBoundsValid={periodBounds !== null}
      />
    </TruckShell>
  );
}
