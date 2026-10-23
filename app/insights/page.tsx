import { Suspense } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";

async function feedback(formData: FormData) {
  "use server";
  const sb = await getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Chưa đăng nhập");
  await sb.rpc("fn_insight_feedback", {
    p_insight_id: String(formData.get("id")),
    p_action: String(formData.get("action")),
    p_outcome: (formData.get("reason") as string) || null,
  });
  revalidatePath("/insights");
}

const LABEL: Record<string, string> = {
  next_best_action: "Hành động tiếp theo", cross_sell: "Cross-sell",
  churn_risk: "Rủi ro rời bỏ", reengage: "Tái kết nối", life_event: "Sự kiện cá nhân",
};
const COLOR: Record<string, string> = {
  churn_risk: "bg-red-100 text-red-700", cross_sell: "bg-blue-100 text-blue-700",
  next_best_action: "bg-green-100 text-green-700", reengage: "bg-amber-100 text-amber-700",
  life_event: "bg-purple-100 text-purple-700",
};
const FEAT: Record<string, string> = {
  f_aum: "Tài sản", f_recency: "Tương tác gần", f_product_gap: "Khoảng trống SP",
  f_segment: "Phân khúc", f_maturity_soon: "Sắp đáo hạn", f_churn_signal: "Tín hiệu churn", f_life_event: "Sự kiện",
};
const SEG: Record<string, string> = { mass: "Phổ thông", affluent: "Khá giả", premier: "Premier", private: "Private" };
const TAB: Record<string, string> = { open: "Mở", accepted: "Đã nhận", converted: "Đã chốt", dismissed: "Bỏ qua" };

async function InsightsContent({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "open" } = await searchParams;
  const sb = await getSupabase();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: insights, error } = await sb
    .from("rm_insights")
    .select("*, customers(id, full_name, segment, phone), products(name)")
    .eq("status", status)
    .order("priority_score", { ascending: false })
    .limit(100);

  const { data: all } = await sb.from("rm_insights").select("status, priority_score");
  const count = (s: string) => (all ?? []).filter((x) => x.status === s).length;
  const avg = all?.length ? (all.reduce((a, x) => a + Number(x.priority_score), 0) / all.length).toFixed(1) : "0";

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Shinhan Bank · RM Workspace</div>
          <h1 className="text-2xl font-bold">Insight hôm nay</h1>
        </div>
        <div className="flex gap-2 text-xs">
          {Object.keys(TAB).map((s) => (
            <a key={s} href={`/insights?status=${s}`}
              className={`px-3 py-1.5 rounded-full border ${status === s ? "bg-[#0046ff] text-white border-[#0046ff]" : "bg-white hover:bg-gray-50"}`}>
              {TAB[s]} ({count(s)})
            </a>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Đang mở", count("open")], ["Đã nhận", count("accepted")], ["Đã chốt", count("converted")], ["Điểm TB", avg]].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-500">{l}</div>
            <div className="text-2xl font-semibold text-[#0046ff]">{v}</div>
          </div>
        ))}
      </section>

      {error && <div className="text-red-600 text-sm">Lỗi: {error.message}</div>}
      {!insights?.length && <div className="text-gray-500 text-sm">Không có insight nào ở mục này.</div>}

      <section className="grid md:grid-cols-2 gap-4">
        {insights?.map((i: any) => (
          <div key={i.id} className="rounded-xl border bg-white p-4 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded-full ${COLOR[i.insight_type] ?? "bg-gray-100"}`}>{LABEL[i.insight_type] ?? i.insight_type}</span>
              <span className="text-sm font-semibold text-[#0046ff]">{Number(i.priority_score).toFixed(0)} điểm</span>
            </div>
            <div className="font-medium">
              <Link href={`/customers/${i.customers?.id}`} className="hover:text-[#0046ff] hover:underline">{i.customers?.full_name}</Link>
              <span className="text-xs text-gray-500 ml-2">{SEG[i.customers?.segment] ?? i.customers?.segment} · {i.customers?.phone}</span>
            </div>
            <div className="text-sm">{i.title}</div>
            <div className="text-xs text-gray-500">{i.detail}</div>
            {i.products?.name && <div className="text-xs">Gợi ý sản phẩm: <b>{i.products.name}</b></div>}

            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer">Vì sao được đề xuất?</summary>
              <ul className="mt-1 grid grid-cols-2 gap-x-3">
                {Object.entries(i.feature_snapshot ?? {}).map(([k, v]) => (
                  <li key={k}>{FEAT[k] ?? k}: {(Number(v) * 100).toFixed(0)}%</li>
                ))}
              </ul>
            </details>

            {status === "open" ? (
              <form action={feedback} className="flex flex-wrap items-center gap-2 pt-1">
                <input type="hidden" name="id" value={i.id} />
                <button name="action" value="accepted" className="px-3 py-1.5 text-xs rounded-lg bg-[#0046ff] text-white">Nhận</button>
                <button name="action" value="converted" className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white">Đã chốt</button>
                <select name="reason" className="text-xs border rounded-lg px-2 py-1.5 bg-white">
                  <option value="">Lý do bỏ qua…</option>
                  <option>Đã liên hệ gần đây</option>
                  <option>Khách không có nhu cầu</option>
                  <option>Dữ liệu sai</option>
                  <option>Không đúng thời điểm</option>
                </select>
                <button name="action" value="dismissed" className="px-3 py-1.5 text-xs rounded-lg border">Bỏ qua</button>
                <Link href={`/message?insight_id=${i.id}`} className="px-3 py-1.5 text-xs rounded-lg border border-[#0046ff]/40 text-[#0046ff]">✍️ Soạn tin</Link>
              </form>
            ) : (
              <div className="text-xs text-gray-400">Cập nhật: {new Date(i.updated_at).toLocaleString("vi-VN")}</div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}

export default function InsightsPage(props: { searchParams: Promise<{ status?: string }> }) {
  return (
    <Suspense fallback={<main className="max-w-5xl mx-auto p-8 text-gray-500">Đang tải insight…</main>}>
      <InsightsContent searchParams={props.searchParams} />
    </Suspense>
  );
}
