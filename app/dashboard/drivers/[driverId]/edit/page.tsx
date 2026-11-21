import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isUuid } from "@/src/trucks/truck-policy";
import { getDriverDetailsForOrganization } from "@/src/prisma/operations-data";
import DriverForm from "../../driver-form";
import {
  getOperationsPageContext,
  organizationQuery,
  type OperationsSearchParams,
} from "../../../operations-page-data";
import TruckShell from "../../../trucks/truck-shell";
import { BackLink } from "../../../ui";

type Props = {
  params: Promise<{ driverId: string }>;
  searchParams: Promise<OperationsSearchParams>;
};

export default function EditDriverPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-8 text-slate-600">Loading driver form...</main>}>
      <EditDriverContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditDriverContent({ params, searchParams }: Props) {
  const [{ driverId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(driverId)) notFound();

  const context = await getOperationsPageContext(query);
  if (!context.canManage) notFound();
  const details = await getDriverDetailsForOrganization(
    context.userId,
    context.organization.id,
    driverId,
  );
  if (!details) notFound();

  const { driver } = details;
  return (
    <TruckShell organizations={context.organizations} organization={context.organization} activeSection="drivers">
      <div className="mx-auto max-w-3xl">
        <BackLink href={`/dashboard/drivers/${encodeURIComponent(driverId)}?${organizationQuery(context.organization.id)}`}>
          Back to driver
        </BackLink>
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-medium text-slate-500">Fleet operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Edit {driver.name}</h1>
          <div className="mt-7">
            <DriverForm
              organizationId={context.organization.id}
              driverId={driver.id}
              initial={{
                name: driver.name,
                phone: driver.phone,
                licenseNumber: driver.licenseNumber,
                status: driver.status,
              }}
            />
          </div>
        </section>
      </div>
    </TruckShell>
  );
}
