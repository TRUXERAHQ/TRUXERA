import type { ReactNode } from "react";
import Link from "next/link";
import { signOutUser } from "@/app/auth-actions";
import type { Models } from "@/src/prisma/contract";

type Props = {
  organizations: Models.public_Organization[];
  organization: Models.public_Organization;
  children: ReactNode;
  activeSection?: "command-center" | "daily-summary" | "executive-report" | "trucks" | "drivers" | "loads" | "dispatch";
};

export default function TruckShell({
  organizations,
  organization,
  children,
  activeSection = "trucks",
}: Props) {
  const sections = [
    { id: "command-center", label: "Command Center", href: `/dashboard/command-center?organizationId=${encodeURIComponent(organization.id)}` },
    { id: "daily-summary", label: "Daily Summary", href: `/dashboard/daily-summary?organizationId=${encodeURIComponent(organization.id)}` },
    { id: "executive-report", label: "Executive Report", href: `/dashboard/executive-report?organizationId=${encodeURIComponent(organization.id)}` },
    { id: "trucks", label: "Fleet", href: `/dashboard/trucks?organizationId=${encodeURIComponent(organization.id)}` },
    { id: "drivers", label: "Drivers", href: `/dashboard/drivers?organizationId=${encodeURIComponent(organization.id)}` },
    { id: "loads", label: "Loads", href: `/dashboard/loads?organizationId=${encodeURIComponent(organization.id)}` },
    { id: "dispatch", label: "Dispatch", href: `/dashboard/dispatch?organizationId=${encodeURIComponent(organization.id)}` },
  ] as const;
  const sectionPath = `/dashboard/${activeSection}`;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Link
              href={`/?organizationId=${encodeURIComponent(organization.id)}`}
              className="text-xl font-bold tracking-tight text-slate-950"
            >
              TRUXERA
            </Link>
            <nav aria-label="Primary navigation" className="flex flex-wrap gap-2">
              <Link
                href={`/?organizationId=${encodeURIComponent(organization.id)}`}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Dashboard
              </Link>
              {sections.map((section) => {
                const active = activeSection === section.id;
                return (
                  <Link
                    key={section.id}
                    href={section.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {section.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {organizations.length > 1 && (
              <form action={sectionPath} method="get" className="flex gap-2">
                <label className="sr-only" htmlFor="truck-organization">
                  Organization
                </label>
                <select
                  id="truck-organization"
                  name="organizationId"
                  defaultValue={organization.id}
                  className="max-w-56 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
                >
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Switch
                </button>
              </form>
            )}
            <span className="max-w-56 truncate text-sm text-slate-500">
              {organization.name}
            </span>
            <form action={signOutUser}>
              <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</div>
    </main>
  );
}
