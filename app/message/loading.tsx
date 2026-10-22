export default function Loading() {
  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-64 bg-gray-200 rounded" />
        <div className="h-3 w-80 bg-gray-200 rounded" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-gray-200 rounded-full" />
              <div className="h-4 w-14 bg-gray-200 rounded" />
            </div>
            <div className="h-4 w-40 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-100 rounded" />
            <div className="h-3 w-2/3 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </main>
  );
}
