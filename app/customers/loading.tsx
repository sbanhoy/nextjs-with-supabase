export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6 animate-pulse">
      <div className="h-8 w-56 bg-gray-200 rounded" />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-64 rounded-xl border bg-white p-4 space-y-3">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-10 w-full bg-gray-100 rounded" />
          <div className="h-24 w-full bg-gray-100 rounded" />
        </div>
        <div className="h-64 rounded-xl border bg-white p-4 space-y-3">
          <div className="h-5 w-52 bg-gray-200 rounded" />
          <div className="h-40 w-full bg-gray-100 rounded" />
        </div>
      </div>
      <div className="h-64 rounded-xl border bg-white p-4 space-y-3">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="h-48 w-full bg-gray-100 rounded" />
      </div>
    </main>
  );
}
