import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import DriverForm from "../driver-form";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../operations-page-data";
import TruckShell from "../../trucks/truck-shell";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function NewDriverPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading driver form...</main>}>
      <NewDriverContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewDriverContent({ searchParams }: Props) {
  const context = await getOperationsPageContext(await searchParams);
  if (!context.canManage) notFound();

  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="drivers">
      <div className="mx-auto max-w-3xl">
        <Link href={`/dashboard/drivers?${organizationQuery(context.organization.id)}`} className="text-sm font-medium text-slate-600 hover:text-slate-950">
          ← Back to drivers
        </Link>
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-slate-500">Fleet operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Add driver</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Enter the driver details supported by this organization’s records.</p>
          <div className="mt-7"><DriverForm organizationId={context.organization.id} /></div>
        </section>
      </div>
    </TruckShell>
  );
}
