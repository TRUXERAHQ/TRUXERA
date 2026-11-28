import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getOrganizationsForUser } from "@/src/prisma/organization-data";
import OnboardingWizard from "./onboarding-wizard";

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
  // TEMP DIAG — remove before final deploy
  console.log(
    "[diag-page] /onboarding",
    JSON.stringify({ a: Boolean(session?.user?.id) }),
  );
  if (!session?.user?.id) redirect("/login");

  const organizations = await getOrganizationsForUser(session.user.id);
  // TEMP DIAG — remove before final deploy
  console.log(
    "[diag-page] /onboarding orgs",
    JSON.stringify({ n: organizations.length }),
  );
  if (organizations.length > 0) redirect("/");

  return <OnboardingWizard />;
}
