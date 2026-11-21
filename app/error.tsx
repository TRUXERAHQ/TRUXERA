"use client";

import { buttonPrimaryClass } from "./dashboard/ui";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-slate-900">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The request could not be completed. Please try again.
        </p>
        <button
          onClick={reset}
          className={`${buttonPrimaryClass} mt-6`}
        >
          Try again
        </button>
      </section>
    </main>
  );
}
