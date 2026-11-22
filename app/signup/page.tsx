import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { signInWithGoogle } from "../auth-actions";
import { AuthShell } from "../auth-shell";
import { buttonPrimaryClass, Notice } from "../dashboard/ui";

type SignupPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default function SignupPage({ searchParams }: SignupPageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-8 text-slate-600">
          Loading sign-up...
        </main>
      }
    >
      <SignupContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupContent({ searchParams }: SignupPageProps) {
  await connection();

  const session = await auth();
  if (session?.user?.id) redirect("/");

  const { error } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const message =
    errorCode === "AccessDenied"
      ? "This Google account could not be verified for sign-up."
      : errorCode
        ? "Sign-up could not be completed. Please try again."
        : null;

  return (
    <AuthShell>
      <section className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          TRUXERA
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Create your TRUXERA account
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Continue with your Google account to set up your organization and
          start managing your fleet.
        </p>

        {message && <div className="mt-5"><Notice tone="danger">{message}</Notice></div>}

        <form action={signInWithGoogle} className="mt-8">
          <button className={`${buttonPrimaryClass} w-full py-3`}>
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Sign in
          </Link>
        </p>
      </section>
    </AuthShell>
  );
}
