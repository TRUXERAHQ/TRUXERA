import type { ReactNode } from "react";
import Link from "next/link";
import { signOutUser } from "@/app/auth-actions";
import type { Models } from "@/src/prisma/contract";
import { buttonSecondaryClass } from "../ui";

type Props = {
  organizations: Models.public_Organization[];
  organization: Models.public_Organization;
  children: ReactNode;
  activeSection?: "dashboard" | "command-center" | "daily-summary" | "executive-report" | "operational-history" | "trucks" | "drivers" | "loads" | "dispatch";
};

type IconName =
  | "grid"
  | "calendar"
  | "chart"
  | "clock"
  | "truck"
  | "users"
  | "box"
  | "dispatch";

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </>
    ),
    chart: <path d="M3 3v18h18M8 16v-5M13 16V8M18 16v-8" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </>
    ),
    truck: (
      <>
        <path d="M1 8h13v9H1zM14 11h4l3 3v3h-7" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="17" cy="19" r="2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.6 3.5 5.5" />
      </>
    ),
    box: (
      <>
        <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
        <path d="M3 8l9 5 9-5M12 13v8" />
      </>
    ),
    dispatch: (
      <>
        <path d="M5 17h14M7 17l1.5-6h7L17 17" />
        <circle cx="8" cy="19" r="1.5" />
        <circle cx="16" cy="19" r="1.5" />
        <path d="M9 11V7h4v4" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function TruckShell({
  organizations,
  organization,
  children,
  activeSection = "trucks",
}: Props) {
  const orgQuery = `organizationId=${encodeURIComponent(organization.id)}`;
  const navGroups = [
    {
      label: "Overview",
      items: [
        { id: "command-center", label: "Command Center", icon: "grid" as IconName, href: `/dashboard/command-center?${orgQuery}` },
        { id: "daily-summary", label: "Daily Summary", icon: "calendar" as IconName, href: `/dashboard/daily-summary?${orgQuery}` },
        { id: "executive-report", label: "Executive Report", icon: "chart" as IconName, href: `/dashboard/executive-report?${orgQuery}` },
        { id: "operational-history", label: "History", icon: "clock" as IconName, href: `/dashboard/operational-history?${orgQuery}` },
      ],
    },
    {
      label: "Operations",
      items: [
        { id: "loads", label: "Loads", icon: "box" as IconName, href: `/dashboard/loads?${orgQuery}` },
        { id: "dispatch", label: "Dispatch", icon: "dispatch" as IconName, href: `/dashboard/dispatch?${orgQuery}` },
      ],
    },
    {
      label: "Fleet",
      items: [
        { id: "trucks", label: "Fleet", icon: "truck" as IconName, href: `/dashboard/trucks?${orgQuery}` },
        { id: "drivers", label: "Drivers", icon: "users" as IconName, href: `/dashboard/drivers?${orgQuery}` },
      ],
    },
  ];
  const sectionPath =
    activeSection === "dashboard" ? "/" : `/dashboard/${activeSection}`;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-6">
              <Link
                href={`/?${orgQuery}`}
                className="flex shrink-0 items-center gap-2"
                aria-label="TRUXERA dashboard"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
                  T
                </span>
                <span className="text-base font-bold tracking-tight text-slate-950">
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
                    className="max-w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 lg:max-w-52"
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
              <span className="hidden max-w-40 truncate text-sm text-slate-600 xl:block">
                {organization.name}
              </span>
              <form action={signOutUser}>
                <button className={buttonSecondaryClass}>Sign out</button>
              </form>
            </div>
          </div>
          <nav
            aria-label="Primary navigation"
            className="hidden flex-wrap items-center gap-x-1 gap-y-1 border-t border-slate-100 px-1 py-2 lg:flex"
          >
            <Link
              href={`/?${orgQuery}`}
              aria-current={activeSection === "dashboard" ? "page" : undefined}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                activeSection === "dashboard"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Dashboard
            </Link>
            {navGroups.map((group, groupIndex) => (
              <div key={group.label} className="flex items-center gap-1">
                {groupIndex > 0 && (
                  <span
                    className="mx-1 h-5 w-px bg-slate-200"
                    aria-hidden="true"
                  />
                )}
                {group.items.map((section) => {
                  const active = activeSection === section.id;
                  return (
                    <Link
                      key={section.id}
                      href={section.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <span className="hidden min-[1400px]:inline-flex">
                        <NavIcon name={section.icon} />
                      </span>
                      {section.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <nav
            aria-label="Primary navigation"
            className="flex gap-1 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
          >
            <Link
              href={`/?${orgQuery}`}
              aria-current={activeSection === "dashboard" ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${
                activeSection === "dashboard"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600"
              }`}
            >
              <NavIcon name="grid" />
              Dashboard
            </Link>
            {navGroups.flatMap((group) =>
              group.items.map((section) => {
                const active = activeSection === section.id;
                return (
                  <Link
                    key={section.id}
                    href={section.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${
                      active
                        ? "bg-indigo-600 text-white"
                        : "text-slate-600"
                    }`}
                  >
                    <NavIcon name={section.icon} />
                    {section.label}
                  </Link>
                );
              }),
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </div>
    </main>
  );
}
