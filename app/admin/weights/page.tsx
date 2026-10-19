import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase/server";

const KEYS = ["f_aum","f_recency","f_product_gap","f_segment","f_maturity_soon","f_churn_signal","f_life_event"] as const;
const LABEL: Record<string, string> = {
  f_aum: "Tài sản (AUM)", f_recency: "Tương tác gần đây", f_product_gap: "Khoảng trống sản phẩm",
  f_segment: "Phân khúc", f_maturity_soon: "Sắp đáo hạn", f_churn_signal: "Tín hiệu rời bỏ", f_life_event: "Sự kiện cá nhân",
};
const TYPE: Record<string, string> = {
  next_best_action: "Hành động tiếp theo", cross_sell: "Cross-sell", churn_risk: "Rủi ro rời bỏ",
  reengage: "Tái kết nối", life_event: "Sự kiện cá nhân",
};

async function requireAdmin(sb: Awaited<ReturnType<typeof getSupabase>>) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Chưa đăng nhập");
  const { data: me } = await sb.from("rm_users").select("role").eq("id", user.id).single();
  if (!me || me.role !== "admin") throw new Error("Chỉ admin mới có quyền thực hiện thao tác này");
  return user;
}

async function saveVersion(fd: FormData) {
  "use server";
  const sb = await getSupabase();
  await requireAdmin(sb);
  const raw = Object.fromEntries(KEYS.map((k) => [k, Math.max(0, Number(fd.get(k) ?? 0))]));
  const tot = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const weights = Object.fromEntries(KEYS.map((k) => [k, +(raw[k] / tot).toFixed(4)]));
  const { data: last } = await sb.from("weight_matrix").select("version").order("version", { ascending: false }).limit(1).single();
  await sb.from("weight_matrix").insert({
    version: (last?.version ?? 0) + 1, name: String(fd.get("name") || "Phiên bản mới"),
    notes: String(fd.get("notes") || ""), weights, is_active: false,
  });
  revalidatePath("/admin/weights");
}
async function activate(fd: FormData) {
  "use server";
  const sb = await getSupabase();
  await requireAdmin(sb);
  await sb.rpc("fn_activate_weight_matrix", { p_id: String(fd.get("id")) });
  await sb.rpc("fn_rescore_open_insights");
  revalidatePath("/admin/weights"); revalidatePath("/insights");
}
async function regenerate() {
  "use server";
  const sb = await getSupabase();
  await requireAdmin(sb);
  await sb.rpc("fn_expire_insights"); await sb.rpc("fn_generate_insights");
  revalidatePath("/admin/weights"); revalidatePath("/insights");
}
async function propose() {
  "use server";
  const sb = await getSupabase();
  await requireAdmin(sb);
  await sb.rpc("fn_propose_weights");
  revalidatePath("/admin/weights");
}

async function Content() {
  const sb = await getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = user ? await sb.from("rm_users").select("role").eq("id", user.id).single() : { data: null };
  if (!me || me.role !== "admin")
    return <main className="p-8 text-center text-gray-500">Chỉ admin mới vào được trang này.</main>;

  const [{ data: versions }, { data: top }, { data: ins }, { data: logs }] = await Promise.all([
    sb.from("weight_matrix").select("*").order("version", { ascending: false }),
    sb.from("v_customer_scores").select("*").order("score", { ascending: false }).limit(10),
    sb.from("rm_insights").select("insight_type,status"),
    sb.from("agent_learning_log").select("action,outcome").order("created_at", { ascending: false }).limit(200),
  ]);
  const active = versions?.find((v) => v.is_active);
  const kpi = Object.keys(TYPE).map((t) => {
    const rows = (ins ?? []).filter((i) => i.insight_type === t);
    const n = rows.length, acc = rows.filter((i) => ["accepted", "converted"].includes(i.status)).length,
      dis = rows.filter((i) => i.status === "dismissed").length;
    return { t, n, acc, dis, rate: n ? Math.round((100 * acc) / n) : 0 };
  });
  const reasons = Object.entries((logs ?? []).filter((l) => l.action === "dismissed")
    .reduce((m: Record<string, number>, l) => { const r = l.outcome || "(không ghi)"; m[r] = (m[r] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]);

  const Btn = ({ children, cls = "" }: any) => <button className={`px-3 py-1.5 text-xs rounded-lg ${cls}`}>{children}</button>;

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Shinhan Bank · Admin</div>
          <h1 className="text-2xl font-bold">Weight Matrix & Học từ phản hồi</h1>
        </div>
        <div className="flex gap-2">
          <a href="/insights" className="px-3 py-1.5 text-xs rounded-lg border bg-white">← Về Insight</a>
          <form action={regenerate}><Btn cls="bg-[#0046ff] text-white">Sinh insight ngay</Btn></form>
          <form action={propose}><Btn cls="bg-purple-600 text-white">AI đề xuất trọng số</Btn></form>
        </div>
      </header>

      <section className="grid md:grid-cols-2 gap-6">
        <form action={saveVersion} className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Tạo phiên bản trọng số mới</h2>
          <p className="text-xs text-gray-500">Nhập % cho từng yếu tố (tự chuẩn hoá về 100%). Lưu xong bấm "Kích hoạt" ở cột phải.</p>
          <input name="name" required placeholder="Tên phiên bản, vd: Ưu tiên giữ khách Q3" className="w-full border rounded-lg px-3 py-2 text-sm" />
          {KEYS.map((k) => (
            <label key={k} className="flex items-center gap-3 text-sm">
              <span className="w-48">{LABEL[k]}</span>
              <input name={k} type="number" min={0} max={100} step={1}
                defaultValue={Math.round((active?.weights?.[k] ?? 0) * 100)}
                className="w-20 border rounded-lg px-2 py-1 text-right" />
              <span className="text-gray-400">%</span>
            </label>
          ))}
          <input name="notes" placeholder="Ghi chú (lý do thay đổi)" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <Btn cls="bg-[#0046ff] text-white">Lưu bản nháp</Btn>
        </form>

        <div className="space-y-3">
          <h2 className="font-semibold">Các phiên bản</h2>
          {versions?.map((v) => (
            <div key={v.id} className={`rounded-xl border p-3 text-sm bg-white ${v.is_active ? "border-[#0046ff] ring-1 ring-[#0046ff]" : ""}`}>
              <div className="flex justify-between items-center">
                <b>v{v.version} · {v.name}</b>
                {v.is_active ? <span className="text-xs text-[#0046ff] font-semibold">ĐANG DÙNG</span> : (
                  <form action={activate}><input type="hidden" name="id" value={v.id} /><Btn cls="border">Kích hoạt</Btn></form>
                )}
              </div>
              {v.notes && <div className="text-xs text-gray-500 mt-1">{v.notes}</div>}
              <div className="text-xs mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                {KEYS.map((k) => <span key={k}>{LABEL[k]}: <b>{Math.round((v.weights?.[k] ?? 0) * 100)}%</b></span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold mb-2">Top 10 khách theo điểm (v{active?.version})</h2>
          <table className="text-sm w-full">
            <tbody>{top?.map((c) => (
              <tr key={c.id} className="border-t"><td className="py-1">{c.full_name}</td>
                <td className="text-xs text-gray-500">{c.segment}</td>
                <td className="text-right font-semibold text-[#0046ff]">{Number(c.score).toFixed(0)}</td></tr>))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold mb-2">Hiệu quả theo loại insight</h2>
          <table className="text-sm w-full">
            <thead><tr className="text-xs text-gray-500 text-left"><th>Loại</th><th>Tổng</th><th>Nhận</th><th>Bỏ</th><th>%</th></tr></thead>
            <tbody>{kpi.map((r) => (
              <tr key={r.t} className="border-t"><td className="py-1">{TYPE[r.t]}</td><td>{r.n}</td>
                <td className="text-green-700">{r.acc}</td><td className="text-red-600">{r.dis}</td><td className="font-semibold">{r.rate}%</td></tr>))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold mb-2">Lý do RM bỏ qua</h2>
          {!reasons.length && <div className="text-xs text-gray-400">Chưa có dữ liệu</div>}
          <ul className="text-sm space-y-1">{reasons.map(([r, n]) => (
            <li key={r} className="flex justify-between border-t py-1"><span>{r}</span><b>{n}</b></li>))}</ul>
        </div>
      </section>
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<main className="p-8 text-gray-500">Đang tải…</main>}><Content /></Suspense>;
}
