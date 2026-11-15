import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { signInWithGoogle } from "../auth-actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-slate-600">
          Loading sign-in...
        </main>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: LoginPageProps) {
  await connection();

  const session = await auth();
  if (session?.user?.id) redirect("/");

  const { error } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const message =
    errorCode === "AccessDenied"
      ? "This Google account could not be verified for sign-in."
      : errorCode
        ? "Sign-in could not be completed. Please try again."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          TRUXERA
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Sign in to your account
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use your verified Google account to access your organization&apos;s
          fleet dashboard.
        </p>

        {message && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
          >
            {message}
          </p>
        )}

        <form action={signInWithGoogle} className="mt-8">
          <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
            Continue with Google
          </button>
        </form>
      </section>
    </main>
  );
}
