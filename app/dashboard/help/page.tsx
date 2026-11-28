import { Suspense } from "react";
import Link from "next/link";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../operations-page-data";
import TruckShell from "../trucks/truck-shell";
import { Badge } from "../ui";
import {
  chaptersInSection,
  helpChapters,
  helpSections,
  type HelpSection,
} from "./chapters";

type Props = { searchParams: Promise<OperationsSearchParams> };

const categoryStyles: Record<
  HelpSection["id"],
  { marker: string; accent: string; hover: string }
> = {
  "start-here": {
    marker: "bg-indigo-500",
    accent: "text-indigo-600",
    hover: "hover:border-indigo-300 hover:bg-indigo-50/50",
  },
  "v1-operations": {
    marker: "bg-blue-500",
    accent: "text-blue-700",
    hover: "hover:border-blue-300 hover:bg-blue-50/60",
  },
  "v2-connected-fleet": {
    marker: "bg-indigo-400",
    accent: "text-indigo-600",
    hover: "hover:border-indigo-300 hover:bg-indigo-50/50",
  },
  "account-admin": {
    marker: "bg-slate-400",
    accent: "text-slate-500",
    hover: "hover:border-slate-300 hover:bg-slate-100/70",
  },
  troubleshooting: {
    marker: "bg-amber-500",
    accent: "text-amber-700",
    hover: "hover:border-amber-300 hover:bg-amber-50/60",
  },
};

function CategoryCard({
  section,
  index,
  orgQuery,
}: {
  section: HelpSection;
  index: number;
  orgQuery: string;
}) {
  const style = categoryStyles[section.id];
  const count = chaptersInSection(section.id).length;
  const isV2 = section.id === "v2-connected-fleet";
  return (
    <Link
      href={`/dashboard/help/${section.id}?${orgQuery}`}
      className={`group flex flex-1 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors xl:p-5 ${style.hover}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold text-white ${style.marker}`}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {isV2 && (
          <Badge tone="neutral" className="px-2 py-0.5 text-[10px]">
            Coming in V2
          </Badge>
        )}
      </div>
      <h2 className="mt-3 text-[15px] font-semibold leading-5 text-slate-900 group-hover:text-indigo-800">
        {section.title}
      </h2>
      <p className="mt-1.5 flex-1 text-[13px] leading-5 text-slate-600">
        {section.description}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide ${style.accent}`}
        >
          {count} {count === 1 ? "chapter" : "chapters"}
        </span>
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${style.accent}`}
        >
          Explore section
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}

export default function HelpPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading help center...
        </main>
      }
    >
      <HelpContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HelpContent({ searchParams }: Props) {
  const context = await getOperationsPageContext(await searchParams, { subscriptionExempt: true });
  const orgQuery = organizationQuery(context.organization.id);
  const startHere = helpChapters.find(
    (chapter) => chapter.slug === "what-is-truxera",
  );

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="help"
    >
      <div className="mx-auto max-w-7xl">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950">
            TRUXERA Help Center
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Learn how TRUXERA works, understand the recovery workflow, and get
            step-by-step guidance for managing fleet operations.
          </p>
        </div>

        {startHere && (
          <Link
            href={`/dashboard/help/${startHere.slug}?${orgQuery}`}
            className="mx-auto mt-6 flex max-w-3xl flex-col gap-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 text-center shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:text-left"
          >
            <div className="flex items-start gap-3 sm:items-center">
              <span
                aria-hidden="true"
                className="hidden h-2.5 w-2.5 shrink-0 rounded-[3px] bg-indigo-500 sm:block"
              />
              <div>
                <p className="text-base font-semibold text-slate-900">
                  New to TRUXERA? Start here
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Start with the TRUXERA Core Idea, then learn the six-stage
                  workflow before exploring individual features.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center justify-center self-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-600/25 transition-colors hover:bg-indigo-700">
              Start the guide →
            </span>
          </Link>
        )}

        {/* Org-chart connector: trunk under the onboarding card, drops to each category */}
        <div className="mt-6 hidden xl:block" aria-hidden="true">
          <div className="mx-auto h-5 w-px bg-slate-300" />
          <div className="h-px w-full bg-slate-200" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:mt-0 xl:grid-cols-5">
          {helpSections.map((section, index) => (
            <div key={section.id} className="flex flex-col">
              <span
                aria-hidden="true"
                className="mx-auto mb-0 hidden h-4 w-px bg-slate-300 xl:block"
              />
              <CategoryCard
                section={section}
                index={index}
                orgQuery={orgQuery}
              />
            </div>
          ))}
        </div>
      </div>
    </TruckShell>
  );
}
