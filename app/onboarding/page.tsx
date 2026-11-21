import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getOrganizationsForUser } from "@/src/prisma/organization-data";
import OnboardingForm from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading organization setup...
        </main>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}

async function OnboardingContent() {
  await connection();

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const organizations = await getOrganizationsForUser(session.user.id);
  if (organizations.length > 0) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-slate-900">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          TRUXERA
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Set up your organization
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Create an organization to start managing its fleet and deliveries.
          You will be added as its owner.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
