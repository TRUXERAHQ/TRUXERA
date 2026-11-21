import { Suspense } from "react";
import { notFound } from "next/navigation";
import LoadForm from "../load-form";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../operations-page-data";
import TruckShell from "../../trucks/truck-shell";
import { BackLink } from "../../ui";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function NewLoadPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-8 text-slate-600">Loading load form...</main>}>
      <NewLoadContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewLoadContent({ searchParams }: Props) {
  const context = await getOperationsPageContext(await searchParams);
  if (!context.canManage) notFound();

  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="loads">
      <div className="mx-auto max-w-4xl">
        <BackLink href={`/dashboard/loads?${organizationQuery(context.organization.id)}`}>
          Back to loads
        </BackLink>
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-medium text-slate-500">Fleet operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Create load</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Add a customer load and its delivery stops in one operation. Stops begin as Planned; ETA and risk are not inferred.</p>
          <div className="mt-7"><LoadForm organizationId={context.organization.id} /></div>
        </section>
      </div>
    </TruckShell>
  );
}
