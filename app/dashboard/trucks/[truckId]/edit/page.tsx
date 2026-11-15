import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTruckDetailsForOrganization } from "@/src/prisma/truck-data";
import { isUuid } from "@/src/trucks/truck-policy";
import { canManageFleet, getTruckPageContext, type TruckPageSearchParams } from "../../truck-page-data";
import TruckForm from "../../truck-form";
import TruckShell from "../../truck-shell";

type Props = {
  params: Promise<{ truckId: string }>;
  searchParams: Promise<TruckPageSearchParams>;
};

export default function EditTruckPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading truck...
        </main>
      }
    >
      <EditTruckContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditTruckContent({ params, searchParams }: Props) {
  const [{ truckId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(truckId)) notFound();
  const context = await getTruckPageContext(query);
  if (!canManageFleet(context.membership.role)) notFound();

  const details = await getTruckDetailsForOrganization(
    context.userId,
    context.organization.id,
    truckId,
  );
  if (!details || details.truck.deactivatedAt) notFound();

  return (
    <TruckShell
      organizations={context.organizations}
      organization={context.organization}
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/dashboard/trucks/${encodeURIComponent(truckId)}?organizationId=${encodeURIComponent(context.organization.id)}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          ← Back to truck
        </Link>
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-slate-500">Fleet management</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Edit {details.truck.unitNumber}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Update the truck&apos;s operational details. Existing assignment history
            is preserved.
          </p>
          <div className="mt-7">
            <TruckForm
              organizationId={context.organization.id}
              truckId={details.truck.id}
              initial={{
                unitNumber: details.truck.unitNumber,
                vin: details.truck.vin,
                capacityKg:
                  details.truck.capacityKg === null
                    ? null
                    : String(details.truck.capacityKg),
                status: details.truck.status,
                currentLocation: details.truck.currentLocation,
              }}
            />
          </div>
        </section>
      </div>
    </TruckShell>
  );
}
