import { Suspense } from "react";
import { AuxShell } from "../aux-shell";
import type { OperationsSearchParams } from "../operations-page-data";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function BillingPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading billing...
        </main>
      }
    >
      <AuxShell
        searchParams={searchParams}
        section="billing"
        eyebrow="Account & administration"
        title="Billing"
        description="Subscription plan, invoices, and billing management for this organization."
      />
    </Suspense>
  );
}
