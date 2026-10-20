import ContactButtons from "@/components/ContactButtons";
import Link from "next/link";
import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";
import { parseBulkRows, toDate, toNum } from "@/lib/parse";
import { PRODUCT_GROUPS } from "@/lib/product-groups";
import { firstRelated } from "@/lib/related";
const SEG: Record<string, string> = { mass: "Phổ thông", affluent: "Khá giả", premier: "Premier", private: "Private" };

async function requireActiveRm(sb: Awaited<ReturnType<typeof getSupabase>>) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Chưa đăng nhập");
  const { data: rm } = await sb.from("rm_users").select("id, is_active").eq("id", user.id).single();
  if (!rm || rm.is_active === false) throw new Error("Tài khoản chưa được cấp quyền RM");
  return user;
}

async function addOne(fd: FormData) {
  "use server";
  const sb = await getSupabase();
  const user = await requireActiveRm(sb);
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
  const sb = await getSupabase();
  const user = await requireActiveRm(sb);
  const rows = parseBulkRows(String(fd.get("bulk") || ""));
  const payload = rows.map((r) => ({
    rm_id: user.id, full_name: r[0], phone: r[1] || null,
    segment: ["mass", "affluent", "premier", "private"].includes((r[2] || "").toLowerCase()) ? r[2].toLowerCase() : "mass",
    aum: toNum(r[3]), aum_3m_ago: toNum(r[4] || r[3]), dob: toDate(r[5]),
    stage: (r[6] || "").toLowerCase() === "lead" ? "lead" : "customer", source: r[7] || null, note: r[8] || null,
  }));
  if (payload.length) await sb.from("customers").upsert(payload, { onConflict: "phone" });
  await sb.rpc("fn_generate_insights"); revalidatePath("/customers"); revalidatePath("/insights");
}
async function Content({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string; product?: string }> }) {
  const { stage = "all", q = "", product = "" } = await searchParams;
  const sb = await getSupabase(); const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  // Gom sản phẩm quan tâm trong 1 query rồi map, không query theo từng khách.
  const [{ data: products }, { data: holdings }, { data: scores }, { data: last }] = await Promise.all([
    sb.from("products").select("id, code, name, category").eq("is_active", true).order("name"),
    // customers!inner để chỉ lấy holding của khách RM hiện tại được thấy (RLS).
    sb.from("product_holdings").select("customer_id, products!inner(code, name), customers!inner(id)").eq("status", "interested"),
    sb.from("v_customer_scores").select("id,score"),
    sb.from("interactions").select("customer_id,occurred_at").order("occurred_at", { ascending: false }),
  ]);

  const namesByCustomer = new Map<string, string[]>();
  const customersByProduct = new Map<string, Set<string>>();
  const nameByCode = new Map<string, string>();
  for (const holding of holdings ?? []) {
    const customerId = holding.customer_id;
    const product = firstRelated(holding.products);
    const code = product?.code;
    const name = product?.name;
    if (!customerId || !code || !name) continue;
    nameByCode.set(code, name);
    const ids = customersByProduct.get(code) ?? new Set<string>();
    ids.add(customerId);
    customersByProduct.set(code, ids);
    const names = namesByCustomer.get(customerId) ?? [];
    if (!names.includes(name)) names.push(name);
    namesByCustomer.set(customerId, names);
  }
  for (const names of namesByCustomer.values()) names.sort((a, b) => a.localeCompare(b, "vi"));

  let qry = sb.from("customers").select("*").order("created_at", { ascending: false }).limit(300);
  if (stage !== "all") qry = qry.eq("stage", stage);
  if (q) qry = qry.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  if (product) {
    const ids = Array.from(customersByProduct.get(product) ?? []);
    // Sản phẩm chưa có khách quan tâm: dùng UUID không tồn tại để danh sách rỗng, vẫn giữ đúng bộ lọc.
    qry = qry.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data: cs } = await qry;
  const score = (id: string) => scores?.find((s) => s.id === id)?.score;
  const lastAt = (id: string) => last?.find((l) => l.customer_id === id)?.occurred_at;
  const nLead = cs?.filter((c) => c.stage === "lead").length ?? 0;
  const selectedProduct = products?.find((p) => p.code === product);
  const selectedProductName = selectedProduct?.name ?? nameByCode.get(product) ?? product;
  const productGroups = PRODUCT_GROUPS
    .map((group) => ({ ...group, options: (products ?? []).filter((p) => p.category === group.code) }))
    .filter((group) => group.options.length);
  const inp = "border rounded-lg px-3 py-2 text-sm w-full";

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Khách hàng &amp; Lead</h1>
        <form className="flex flex-wrap items-center gap-2 text-xs">
          <input name="q" defaultValue={q} placeholder="Tìm tên / SĐT" className="border rounded-lg px-3 py-1.5 w-full sm:w-44" />
          <select
            name="product"
            defaultValue={product}
            aria-label="Lọc theo sản phẩm"
            className="border rounded-lg px-2 py-1.5 bg-white max-w-[220px]"
          >
            <option value="">Tất cả sản phẩm</option>
            {productGroups.map((group) => (
              <optgroup key={group.code} label={group.label}>
                {group.options.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
              </optgroup>
            ))}
          </select>
          <button name="stage" value={stage} className="px-3 py-1.5 rounded-full bg-[#0046ff] text-white">Lọc</button>
          {[["all", "Tất cả"], ["customer", "Khách hàng"], ["lead", "Lead"]].map(([v, l]) => (
            <button key={v} name="stage" value={v} className={`px-3 py-1.5 rounded-full border ${stage === v ? "bg-[#0046ff] text-white" : "bg-white"}`}>{l}</button>
          ))}
        </form>
      </header>

      {product && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-[#0046ff]">
          Đang lọc khách quan tâm sản phẩm: <b>{selectedProductName}</b>
          <Link href="/customers" className="ml-2 underline">Bỏ lọc</Link>
        </div>
      )}

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
        <div className="px-4 py-2 text-xs text-gray-500">
          {cs?.length ?? 0} dòng · {nLead} lead
          {product && <> · đang lọc: <b className="text-[#0046ff]">{selectedProductName}</b></>}
        </div>
        <table className="text-sm w-full">
          <thead><tr className="text-left text-xs text-gray-500 bg-gray-50"><th className="p-2">Tên</th><th>SĐT</th><th>Loại</th><th>Phân khúc</th><th className="text-right">Tài sản</th><th>Nguồn</th><th>Sản phẩm</th><th>Liên hệ cuối</th><th className="text-right">Điểm</th><th>Ghi tương tác</th></tr></thead>
          <tbody>{cs?.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="p-2 font-medium">{c.full_name}{c.note && <div className="text-xs text-gray-400">{c.note}</div>}</td>
              <td>{c.phone}</td>
              <td>{c.stage === "lead" ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Lead</span> : <span className="text-xs text-gray-500">KH</span>}</td>
              <td>{SEG[c.segment]}</td>
              <td className="text-right">{Number(c.aum) >= 1e9 ? (Number(c.aum) / 1e9).toFixed(1) + " tỷ" : (Number(c.aum) / 1e6).toFixed(0) + " tr"}</td>
              <td className="text-xs">{c.source}</td>
              <td className="text-xs max-w-[220px]">
                {(namesByCustomer.get(c.id) ?? []).length ? (
                  <div className="flex flex-wrap gap-1">
                    {(namesByCustomer.get(c.id) ?? []).map((name) => (
                      <span key={name} className="rounded-full bg-blue-50 px-2 py-0.5 text-[#0046ff]">{name}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
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
export default function Page(props: { searchParams: Promise<{ stage?: string; q?: string; product?: string }> }) {
  return <Suspense fallback={<main className="p-8 text-center text-gray-500">Đang tải…</main>}><Content searchParams={props.searchParams} /></Suspense>;
}
