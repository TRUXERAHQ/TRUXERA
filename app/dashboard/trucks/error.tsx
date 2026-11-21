"use client";

import { buttonPrimaryClass } from "../ui";

export default function TrucksError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">Fleet data is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          We could not load trucks for this organization. Please try again.
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
