import { Suspense } from "react";
import { AuxShell } from "../aux-shell";
import type { OperationsSearchParams } from "../operations-page-data";

type Props = { searchParams: Promise<OperationsSearchParams> };

export default function AccountPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading account...
        </main>
      }
    >
      <AuxShell
        searchParams={searchParams}
        section="account"
        eyebrow="Account & administration"
        title="Account"
        description="Your personal profile, security, and account preferences."
      />
    </Suspense>
  );
}
