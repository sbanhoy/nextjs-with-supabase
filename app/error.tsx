"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-md mx-auto p-8 mt-12 text-center space-y-4 border rounded-xl bg-white shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        Shinhan Bank · RM Workspace
      </div>
      <h1 className="text-lg font-bold text-gray-900">
        Không thể thực hiện thao tác
      </h1>
      <p className="text-xs text-gray-500">
        {error.message || "Hệ thống đang bận hoặc phiên đăng nhập đã hết hạn."}
      </p>
      <div className="flex justify-center gap-2 pt-2">
        <button
          onClick={() => reset()}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-[#0046ff] text-white"
        >
          Thử lại
        </button>
        <a
          href="/insights"
          className="px-4 py-2 text-xs font-medium rounded-lg border bg-white hover:bg-gray-50"
        >
          Về trang Insight
        </a>
      </div>
    </main>
  );
}
