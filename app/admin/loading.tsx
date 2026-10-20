export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-7 w-56 bg-gray-200 rounded" />
      </div>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="h-32 w-full bg-gray-100 rounded" />
      </div>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="h-4 w-40 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-16 rounded-lg border bg-gray-50" />
          ))}
        </div>
      </div>
    </main>
  );
}
