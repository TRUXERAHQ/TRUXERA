import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { signOutUser } from "../../auth-actions";
import { getOperationsPageContext } from "../operations-page-data";
import type { OperationsSearchParams } from "../operations-page-data";
import TruckShell from "../trucks/truck-shell";
import { Badge, buttonSecondaryClass, PageHeader, Panel } from "../ui";

type Props = { searchParams: Promise<OperationsSearchParams> };

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  DISPATCHER: "Dispatcher",
  DRIVER: "Driver",
  VIEWER: "Viewer",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

function formatRole(role: string) {
  return ROLE_LABELS[role] ?? role.toLowerCase().replaceAll("_", " ");
}

function formatStatus(status: string) {
  return STATUS_LABELS[status] ?? status.toLowerCase().replaceAll("_", " ");
}

export default function AccountPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading account...
        </main>
      }
    >
      <AccountLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountLoader({ searchParams }: Props) {
  const context = await getOperationsPageContext(await searchParams);
  const session = await auth();

  const orgQuery = `organizationId=${encodeURIComponent(context.organization.id)}`;
  const userName = session?.user?.name ?? "TRUXERA user";
  const userEmail = session?.user?.email ?? "";
  const role = context.membership.role;
  const status = context.organization.status;

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
      activeSection="account"
    >
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Account"
          title="Account"
          description="Your profile, organization access, and security settings."
        />

        <div className="mt-6 space-y-5">
          <Panel title="Profile" description="Your TRUXERA identity.">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Name
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--text)]">
                  {userName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Email
                </dt>
                <dd className="mt-1 break-all text-sm font-medium text-[var(--text)]">
                  {userEmail}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Sign-in method
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--text)]">
                  Google
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Session
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--text)]">
                  Secure session · expires after 8 hours
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel
            title="Organization & access"
            description="The organization you are currently viewing and your role in it."
          >
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Organization
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--text)]">
                  {context.organization.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Your role
                </dt>
                <dd className="mt-1">
                  <Badge tone="info">{formatRole(role)}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Account status
                </dt>
                <dd className="mt-1">
                  <Badge tone={status === "ACTIVE" ? "success" : "danger"}>
                    {formatStatus(status)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Timezone
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--text)]">
                  {context.organization.timezone}
                </dd>
              </div>
            </dl>
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <Link
                href={`/dashboard/settings?${orgQuery}`}
                className="text-sm font-medium text-[var(--primary)] hover:underline"
              >
                Open Settings for organization preferences →
              </Link>
            </div>
          </Panel>

          <Panel
            title="Security"
            description="Manage your session. Appearance and operational preferences live in Settings."
          >
            <div className="flex flex-wrap items-center gap-3">
              <form action={signOutUser}>
                <button type="submit" className={buttonSecondaryClass}>
                  Sign out
                </button>
              </form>
              <span className="text-sm text-[var(--text-muted)]">
                Signing out ends your session on this device.
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </TruckShell>
  );
}
