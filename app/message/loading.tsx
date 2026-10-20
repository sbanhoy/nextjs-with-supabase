export default function Loading() {
  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-gray-200 rounded" />
        <div className="h-3 w-64 bg-gray-200 rounded" />
      </div>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-100 rounded" />
      </div>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="h-24 w-full bg-gray-100 rounded" />
        <div className="h-9 w-28 bg-gray-200 rounded" />
      </div>
    </main>
  );
}
