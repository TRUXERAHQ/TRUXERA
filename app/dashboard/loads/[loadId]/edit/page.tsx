import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isUuid } from "@/src/trucks/truck-policy";
import { getLoadDetailsForOrganization } from "@/src/prisma/operations-data";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../../operations-page-data";
import { LoadEditForm } from "../../load-form";
import TruckShell from "../../../trucks/truck-shell";
import { BackLink } from "../../../ui";

type Props = {
  params: Promise<{ loadId: string }>;
  searchParams: Promise<OperationsSearchParams>;
};

export default function EditLoadPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-8 text-slate-600">Loading load editor...</main>}>
      <EditLoadContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditLoadContent({ params, searchParams }: Props) {
  const [{ loadId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(loadId)) notFound();

  const context = await getOperationsPageContext(query);
  if (!context.canManage) notFound();

  const details = await getLoadDetailsForOrganization(
    context.userId,
    context.organization.id,
    loadId,
  );
  if (!details) notFound();

  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="loads">
      <div className="mx-auto max-w-3xl">
        <BackLink
          href={`/dashboard/loads/${encodeURIComponent(loadId)}?${organizationQuery(context.organization.id)}`}
        >
          Back to load
        </BackLink>
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-medium text-slate-500">Fleet operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Edit {details.load.reference}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Update customer-facing load details without changing its delivery
            stops or dispatch-critical fields.
          </p>
          <div className="mt-7">
            <LoadEditForm
              organizationId={context.organization.id}
              loadId={details.load.id}
              customerName={details.load.customerName}
              cargoDescription={details.load.cargoDescription}
            />
          </div>
        </section>
      </div>
    </TruckShell>
  );
}
