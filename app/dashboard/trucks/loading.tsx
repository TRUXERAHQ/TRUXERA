export default function TrucksLoading() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-600 sm:p-8">
      <div
        role="status"
        className="mx-auto max-w-7xl animate-pulse space-y-5"
      >
        <p>Loading fleet...</p>
        <div className="h-24 rounded-xl bg-white" />
        <div className="h-72 rounded-xl bg-white" />
      </div>
    </main>
  );
}
