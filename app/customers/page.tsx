import ContactButtons from "@/components/ContactButtons";
import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase/server";
const SEG: Record<string, string> = { mass: "Phổ thông", affluent: "Khá giả", premier: "Premier", private: "Private" };
const toDate = (s: string) => {
  const t = (s || "").trim(); if (!t) return null;
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : t;
};
const toNum = (s: string) => Number(String(s || "0").replace(/[^\d.]/g, "")) || 0;

async function addOne(fd: FormData) {
  "use server";
  const sb = await getSupabase(); const { data: { user } } = await sb.auth.getUser(); if (!user) return;
  await sb.from("customers").upsert({
    rm_id: user.id, full_name: String(fd.get("full_name")), phone: String(fd.get("phone") || "") || null,
    segment: String(fd.get("segment") || "mass"), aum: toNum(String(fd.get("aum"))), aum_3m_ago: toNum(String(fd.get("aum"))),
    dob: toDate(String(fd.get("dob"))), stage: String(fd.get("stage") || "customer"),
    source: String(fd.get("source") || "") || null, note: String(fd.get("note") || "") || null,
  }, { onConflict: "phone" });
  await sb.rpc("fn_generate_insights"); revalidatePath("/customers"); revalidatePath("/insights");
}
async function addBulk(fd: FormData) {
  "use server";
  const sb = await getSupabase(); const { data: { user } } = await sb.auth.getUser(); if (!user) return;
  const rows = String(fd.get("bulk") || "").split(/\r?\n/).map((l) => l.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, "").trim()))
    .filter((r) => r[0] && !/^(tên|ten|name|họ)/i.test(r[0]));
  const payload = rows.map((r) => ({
    rm_id: user.id, full_name: r[0], phone: r[1] || null,
    segment: ["mass", "affluent", "premier", "private"].includes((r[2] || "").toLowerCase()) ? r[2].toLowerCase() : "mass",
    aum: toNum(r[3]), aum_3m_ago: toNum(r[4] || r[3]), dob: toDate(r[5]),
    stage: (r[6] || "").toLowerCase() === "lead" ? "lead" : "customer", source: r[7] || null, note: r[8] || null,
  }));
  if (payload.length) await sb.from("customers").upsert(payload, { onConflict: "phone" });
  await sb.rpc("fn_generate_insights"); revalidatePath("/customers"); revalidatePath("/insights");
}
async function Content({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string }> }) {
  const { stage = "all", q = "" } = await searchParams;
  const sb = await getSupabase(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return <main className="p-8 text-center">Vui lòng đăng nhập.</main>;

  let qry = sb.from("customers").select("*").order("created_at", { ascending: false }).limit(300);
  if (stage !== "all") qry = qry.eq("stage", stage);
  if (q) qry = qry.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  const [{ data: cs }, { data: scores }, { data: last }] = await Promise.all([
    qry, sb.from("v_customer_scores").select("id,score"),
    sb.from("interactions").select("customer_id,occurred_at").order("occurred_at", { ascending: false }),
  ]);
  const score = (id: string) => scores?.find((s) => s.id === id)?.score;
  const lastAt = (id: string) => last?.find((l) => l.customer_id === id)?.occurred_at;
  const nLead = cs?.filter((c) => c.stage === "lead").length ?? 0;
  const inp = "border rounded-lg px-3 py-2 text-sm w-full";

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Khách hàng & Lead</h1>
        <form className="flex gap-2 text-xs">
          <input name="q" defaultValue={q} placeholder="Tìm tên / SĐT" className="border rounded-lg px-3 py-1.5" />
          {[["all", "Tất cả"], ["customer", "Khách hàng"], ["lead", "Lead"]].map(([v, l]) => (
            <button key={v} name="stage" value={v} className={`px-3 py-1.5 rounded-full border ${stage === v ? "bg-[#0046ff] text-white" : "bg-white"}`}>{l}</button>
          ))}
        </form>
      </header>

      <section className="grid md:grid-cols-2 gap-6">
        <form action={addOne} className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Thêm 1 khách / lead</h2>
          <input name="full_name" required placeholder="Họ tên *" className={inp} />
          <div className="grid grid-cols-2 gap-2">
            <input name="phone" placeholder="SĐT (để không trùng)" className={inp} />
            <input name="dob" placeholder="Ngày sinh dd/mm/yyyy" className={inp} />
            <select name="segment" className={inp}>{Object.entries(SEG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="aum" placeholder="Tài sản (VND)" className={inp} />
            <select name="stage" className={inp}><option value="customer">Khách hàng</option><option value="lead">Lead</option></select>
            <select name="source" className={inp}>
              <option value="">Nguồn…</option><option>Giới thiệu</option><option>Đối tác</option><option>Zalo/Facebook</option><option>LinkedIn</option><option>Sự kiện</option><option>Khác</option>
            </select>
          </div>
          <input name="note" placeholder="Ghi chú" className={inp} />
          <button className="px-4 py-2 text-sm rounded-lg bg-[#0046ff] text-white">Lưu</button>
        </form>

        <form action={addBulk} className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="font-semibold">Dán nhiều khách từ Excel / Google Sheet</h2>
          <p className="text-xs text-gray-500">Copy các dòng trong Sheet rồi dán. Thứ tự cột: <b>Tên · SĐT · Phân khúc (mass/affluent/premier/private) · Tài sản · Tài sản 3 tháng trước · Ngày sinh · lead/customer · Nguồn · Ghi chú</b>. Trùng SĐT sẽ cập nhật, không tạo đôi.</p>
          <textarea name="bulk" rows={8} className={inp + " font-mono text-xs"} placeholder={"Nguyễn Văn A\t0912345678\tpremier\t2500000000\t2300000000\t15/03/1975\tcustomer\tGiới thiệu\nTrần B\t0987654321\t\t\t\t\tlead\tĐối tác"} />
          <button className="px-4 py-2 text-sm rounded-lg bg-[#0046ff] text-white">Nhập tất cả</button>
        </form>
      </section>

      <section className="rounded-xl border bg-white overflow-auto">
        <div className="px-4 py-2 text-xs text-gray-500">{cs?.length ?? 0} dòng · {nLead} lead</div>
        <table className="text-sm w-full">
          <thead><tr className="text-left text-xs text-gray-500 bg-gray-50"><th className="p-2">Tên</th><th>SĐT</th><th>Loại</th><th>Phân khúc</th><th className="text-right">Tài sản</th><th>Nguồn</th><th>Liên hệ cuối</th><th className="text-right">Điểm</th><th>Ghi tương tác</th></tr></thead>
          <tbody>{cs?.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="p-2 font-medium">{c.full_name}{c.note && <div className="text-xs text-gray-400">{c.note}</div>}</td>
              <td>{c.phone}</td>
              <td>{c.stage === "lead" ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Lead</span> : <span className="text-xs text-gray-500">KH</span>}</td>
              <td>{SEG[c.segment]}</td>
              <td className="text-right">{Number(c.aum) >= 1e9 ? (Number(c.aum) / 1e9).toFixed(1) + " tỷ" : (Number(c.aum) / 1e6).toFixed(0) + " tr"}</td>
              <td className="text-xs">{c.source}</td>
              <td className="text-xs">{lastAt(c.id) ? new Date(lastAt(c.id)!).toLocaleDateString("vi-VN") : <span className="text-red-500">chưa</span>}</td>
              <td className="text-right font-semibold text-[#0046ff]">{score(c.id) != null ? Number(score(c.id)).toFixed(0) : "–"}</td>
              <td>
                <ContactButtons cid={c.id} phone={c.phone} stage={c.stage} name={c.full_name} />
              </td>
            </tr>))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
export default function Page(props: { searchParams: Promise<{ stage?: string; q?: string }> }) {
  return <Suspense fallback={<main className="p-8 text-gray-500">Đang tải…</main>}><Content searchParams={props.searchParams} /></Suspense>;
}
