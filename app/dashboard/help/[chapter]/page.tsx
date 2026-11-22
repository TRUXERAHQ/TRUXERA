import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../operations-page-data";
import TruckShell from "../../trucks/truck-shell";
import type { Models } from "@/src/prisma/contract";
import { Badge, type BadgeTone, BackLink, buttonSecondaryClass, Notice } from "../../ui";
import {
  chaptersInSection,
  getHelpChapter,
  helpSections,
  type HelpBlock,
  type HelpChapter,
  type HelpSection,
  type HelpStatus,
} from "../chapters";

type Props = {
  params: Promise<{ chapter: string }>;
  searchParams: Promise<OperationsSearchParams>;
};

const statusMeta: Record<HelpStatus, { label: string; tone: BadgeTone }> = {
  v1: { label: "V1", tone: "info" },
  v2: { label: "Coming in V2", tone: "neutral" },
  "coming-soon": { label: "Coming soon", tone: "warning" },
};

function ChapterBlocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="mt-5 space-y-4">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "p":
            return (
              <p
                key={index}
                className="text-[15px] leading-7 text-slate-700"
              >
                {block.text}
              </p>
            );
          case "h3":
            return (
              <h3
                key={index}
                className="pt-3 text-lg font-semibold tracking-tight text-slate-900"
              >
                {block.text}
              </h3>
            );
          case "steps":
            return (
              <ol
                key={index}
                className="list-decimal space-y-2.5 pl-6 text-[15px] leading-7 text-slate-700 marker:font-semibold marker:text-indigo-600"
              >
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            );
          case "list":
            return (
              <ul
                key={index}
                className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-slate-700 marker:text-indigo-400"
              >
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          case "note":
            return <Notice key={index}>{block.text}</Notice>;
        }
      })}
    </div>
  );
}

function ChapterCard({
  chapter,
  orgQuery,
}: {
  chapter: HelpChapter;
  orgQuery: string;
}) {
  const status = statusMeta[chapter.status];
  return (
    <Link
      href={`/dashboard/help/${chapter.slug}?${orgQuery}`}
      className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold leading-6 text-slate-900 group-hover:text-indigo-800">
          {chapter.title}
        </h3>
        <Badge tone={status.tone} className="shrink-0">
          {status.label}
        </Badge>
      </div>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
        {chapter.summary}
      </p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 transition-colors group-hover:text-indigo-800">
        Read chapter
        <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

function SectionView({
  section,
  orgQuery,
  organizations,
  organization,
}: {
  section: HelpSection;
  orgQuery: string;
  organizations: Models.public_Organization[];
  organization: Models.public_Organization;
}) {
  const chapters = chaptersInSection(section.id);
  const isV2 = section.id === "v2-connected-fleet";
  return (
    <TruckShell
      organizations={organizations}
      organization={organization}
      activeSection="help"
    >
      <div className="mx-auto max-w-6xl">
        <BackLink href={`/dashboard/help?${orgQuery}`}>
          Back to Help Center
        </BackLink>
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-cyan-50/50 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                {section.title}
              </h1>
              {isV2 && <Badge tone="neutral">Coming in V2</Badge>}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {section.description}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
            </p>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {chapters.map((chapter) => (
              <ChapterCard
                key={chapter.slug}
                chapter={chapter}
                orgQuery={orgQuery}
              />
            ))}
          </div>
        </div>
      </div>
    </TruckShell>
  );
}

export default function HelpChapterPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading chapter...
        </main>
      }
    >
      <HelpChapterContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function HelpChapterContent({ params, searchParams }: Props) {
  const [{ chapter: slug }, query] = await Promise.all([params, searchParams]);
  const section = helpSections.find((item) => item.id === slug);
  const chapter = section ? null : getHelpChapter(slug);
  if (!section && !chapter) notFound();

  const context = await getOperationsPageContext(query);
  const orgQuery = organizationQuery(context.organization.id);

  if (section) {
    return (
      <SectionView
        section={section}
        orgQuery={orgQuery}
        organizations={context.organizations}
        organization={context.organization}
      />
    );
  }

  if (!chapter) notFound();
  const siblings = chaptersInSection(chapter.section).filter(
    (item) => item.slug !== chapter.slug,
  );
  const status = statusMeta[chapter.status];

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="help"
    >
      <div className="mx-auto max-w-3xl">
        <BackLink href={`/dashboard/help/${chapter.section}?${orgQuery}`}>
          {helpSections.find((item) => item.id === chapter.section)?.title}
        </BackLink>

        <article className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-cyan-50/50 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                {chapter.title}
              </h1>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {chapter.summary}
            </p>
          </div>
          <div className="px-5 py-6 sm:px-7">
            <ChapterBlocks blocks={chapter.blocks} />
          </div>
        </article>

        {chapter.action && (
          <div className="mt-5">
            <Link
              href={`${chapter.action.href}?${orgQuery}`}
              className={buttonSecondaryClass}
            >
              {chapter.action.label} →
            </Link>
          </div>
        )}

        {siblings.length > 0 && (
          <nav aria-label="More in this section" className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              More in{" "}
              {helpSections.find((item) => item.id === chapter.section)
                ?.title}
            </h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {siblings.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/dashboard/help/${item.slug}?${orgQuery}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <span className="min-w-0 break-words">{item.title}</span>
                    <span aria-hidden="true" className="shrink-0 text-slate-400">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </TruckShell>
  );
}
