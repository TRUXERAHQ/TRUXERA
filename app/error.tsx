"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The request could not be completed. Please try again.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
