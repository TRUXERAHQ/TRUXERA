import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageFleet, getTruckPageContext, type TruckPageSearchParams } from "../truck-page-data";
import TruckForm from "../truck-form";
import TruckShell from "../truck-shell";

type Props = {
  searchParams: Promise<TruckPageSearchParams>;
};

export default function NewTruckPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading truck form...
        </main>
      }
    >
      <NewTruckContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewTruckContent({ searchParams }: Props) {
  const context = await getTruckPageContext(await searchParams);
  if (!canManageFleet(context.membership.role)) notFound();

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/dashboard/trucks?organizationId=${encodeURIComponent(context.organization.id)}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          ← Back to trucks
        </Link>
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-slate-500">Fleet management</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Add truck</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Enter the vehicle details supported by your fleet record. Unit
            numbers must be unique within this organization.
          </p>
          <div className="mt-7">
            <TruckForm organizationId={context.organization.id} />
          </div>
        </section>
      </div>
    </TruckShell>
  );
}
