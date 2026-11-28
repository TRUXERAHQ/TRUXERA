import type { ReactNode } from "react";
import Link from "next/link";
import { signOutUser } from "@/app/auth-actions";
import type { Models } from "@/src/prisma/contract";
import { buttonSecondaryClass } from "../ui";
import DashboardNav from "../dashboard-nav";

export type ActiveSection =
  | "dashboard"
  | "command-center"
  | "daily-summary"
  | "executive-report"
  | "operational-history"
  | "trucks"
  | "drivers"
  | "loads"
  | "dispatch"
  | "feedback"
  | "support"
  | "help"
  | "settings"
  | "billing"
  | "account"
  | "notifications";

type Props = {
  organizations: Models.public_Organization[];
  organization: Models.public_Organization;
  children: ReactNode;
  activeSection?: ActiveSection;
  hero?: ReactNode;
};

export default function TruckShell({
  organizations,
  organization,
  children,
  activeSection = "trucks",
  hero,
}: Props) {
  const orgQuery = `organizationId=${encodeURIComponent(organization.id)}`;
  const sectionPath =
    activeSection === "dashboard" ? "/" : `/dashboard/${activeSection}`;

  return (
    <main className="min-h-screen bg-background text-[var(--text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur">
        <div className="mx-auto max-w-[1680px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-12 items-center justify-between gap-3 xl:h-14 xl:gap-4">
            <div className="flex min-w-0 items-center gap-6">
              <Link
                href={`/?${orgQuery}`}
                className="flex shrink-0 items-center gap-2"
                aria-label="TRUXERA dashboard"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary-strong)] text-[11px] font-bold text-white xl:h-7 xl:w-7 xl:text-xs">
                  T
                </span>
                <span className="text-base font-bold tracking-tight text-[var(--text)]">
                  TRUXERA
                </span>
              </Link>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {organizations.length > 1 && (
                <form action={sectionPath} method="get" className="flex gap-1.5">
                  <label className="sr-only" htmlFor="truck-organization">
                    Organization
                  </label>
                  <select
                    id="truck-organization"
                    name="organizationId"
                    defaultValue={organization.id}
                    className="max-w-40 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm text-[var(--text)] lg:max-w-52"
                  >
                    {organizations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button className={buttonSecondaryClass}>Switch</button>
                </form>
              )}
              <span className="hidden max-w-40 truncate text-sm text-[var(--text-muted)] xl:block">
                {organization.name}
              </span>
              <form action={signOutUser} className="hidden xl:block">
                <button className={buttonSecondaryClass}>Sign out</button>
              </form>
              {/* Mobile header controls (theme toggle + menu) are portaled
                  here by DashboardNav so they share the TRUXERA header row */}
              <div id="truxera-mobile-controls" />
            </div>
          </div>
          {!hero && (
            <DashboardNav
              orgQuery={orgQuery}
              organizationId={organization.id}
              activeSection={activeSection}
            />
          )}
        </div>
      </header>
      {hero && (
        <>
          <div className="mx-auto max-w-[1680px] px-4 pt-4 sm:px-6 lg:px-8">
            {hero}
          </div>
          <div className="sticky top-14 z-20 hidden border-t border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur xl:block">
            <div className="mx-auto max-w-[1680px] px-4 sm:px-6 lg:px-8">
              <DashboardNav
                orgQuery={orgQuery}
                organizationId={organization.id}
                activeSection={activeSection}
              />
            </div>
          </div>
        </>
      )}
      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </div>
    </main>
  );
}
