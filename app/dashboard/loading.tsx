export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-background">
      <div
        role="status"
        aria-label="Loading"
        className="mx-auto max-w-7xl animate-pulse px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        <div className="h-4 w-40 rounded bg-slate-200" />
        <div className="mt-3 h-8 w-64 rounded bg-slate-200" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-32 rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="h-80 rounded-xl border border-slate-200 bg-white" />
          <div className="h-80 rounded-xl border border-slate-200 bg-white" />
        </div>
      </div>
    </main>
  );
}
