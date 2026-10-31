export default function Loading() {
  return (
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6 animate-pulse">
      <div className="h-8 w-40 bg-gray-200 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="h-24 rounded-xl border bg-white p-4 space-y-2">
            <div className="h-3 w-20 bg-gray-200 rounded" />
            <div className="h-6 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="h-56 rounded-xl border bg-white p-4 space-y-3">
        <div className="h-4 w-48 bg-gray-200 rounded" />
        <div className="h-3 w-full bg-gray-100 rounded" />
        <div className="h-3 w-4/5 bg-gray-100 rounded" />
        <div className="h-3 w-2/3 bg-gray-100 rounded" />
      </div>
      <div className="h-64 rounded-xl border bg-white p-4 space-y-3">
        <div className="h-4 w-52 bg-gray-200 rounded" />
        <div className="h-40 w-full bg-gray-100 rounded" />
      </div>
    </main>
  );
}
