import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";

const DAY = 86_400_000;

const STATUS_LABEL: Record<string, string> = {
  open: "Đang mở",
  accepted: "Đã nhận",
  dismissed: "Bỏ qua",
  converted: "Đã chốt",
  expired: "Hết hạn",
};

type Insight = {
  id: string;
  customer_id: string | null;
  status: string;
  insight_type: string;
  weight_version: number;
  created_at: string;
  updated_at: string;
  priority_score: number;
};

type Interaction = { customer_id: string | null; channel: string | null; occurred_at: string };
type Customer = { id: string; source: string | null; stage: string | null };
type WeightVersion = { version: number; name: string | null; is_active: boolean };

function rate(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Thứ hai = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1 text-[#0046ff]">{value}</div>
      {hint ? <div className="text-xs text-gray-500 mt-1">{hint}</div> : null}
    </div>
  );
}

function Bar({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-gray-500">{text}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-[#0046ff]" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

async function AnalyticsContent() {
  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/auth/login");

  const now = Date.now();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const since90 = new Date(now - 90 * DAY).toISOString();

  const [insightRes, interactionRes, customerRes, versionRes] = await Promise.all([
    sb
      .from("rm_insights")
      .select("id, customer_id, status, insight_type, weight_version, created_at, updated_at, priority_score")
      .gte("created_at", since90)
      .order("created_at", { ascending: false })
      .limit(3000),
    sb
      .from("interactions")
      .select("customer_id, channel, occurred_at")
      .gte("occurred_at", since90)
      .limit(5000),
    sb.from("customers").select("id, source, stage").limit(3000),
    sb.from("weight_matrix").select("version, name, is_active").order("version", { ascending: false }).limit(50),
  ]);

  const insights = (insightRes.data ?? []) as Insight[];
  const interactions = (interactionRes.data ?? []) as Interaction[];
  const customers = (customerRes.data ?? []) as Customer[];
  const versions = (versionRes.data ?? []) as WeightVersion[];

  const error = insightRes.error ?? interactionRes.error ?? customerRes.error ?? versionRes.error;

  const sourceOf = new Map(customers.map((c) => [c.id, c.source ?? "Chưa rõ"]));
  const idOf = new Set(customers.map((c) => c.id));
  const contacted = new Set(interactions.map((i) => i.customer_id).filter(Boolean) as string[]);

  // KPI 30 ngày
  const in30 = insights.filter((i) => i.created_at >= since30);
  const acceptedAll = insights.filter((i) => i.status === "accepted" || i.status === "converted");
  const decided = insights.filter((i) => ["accepted", "converted", "dismissed"].includes(i.status));
  const acceptRate = rate(acceptedAll.length, decided.length);
  const interactions30 = interactions.filter((i) => i.occurred_at >= since30).length;
  const converted30 = insights.filter((i) => i.status === "converted" && i.updated_at >= since30).length;

  // Funnel
  const generated = insights.length;
  const accepted = acceptedAll.length;
  const contactedCount = acceptedAll.filter((i) => i.customer_id && contacted.has(i.customer_id)).length;
  const converted = insights.filter((i) => i.status === "converted").length;
  const funnelMax = Math.max(generated, 1);

  // Theo nguồn
  const sourceRows = new Map<string, { total: number; leads: number; customers: number; converted: number }>();
  for (const c of customers) {
    const key = c.source ?? "Chưa rõ";
    const row = sourceRows.get(key) ?? { total: 0, leads: 0, customers: 0, converted: 0 };
    row.total += 1;
    if (c.stage === "lead") row.leads += 1;
    else row.customers += 1;
    sourceRows.set(key, row);
  }
  for (const i of insights) {
    if (i.status !== "converted" || !i.customer_id) continue;
    const key = sourceOf.get(i.customer_id);
    if (!key) continue;
    const row = sourceRows.get(key);
    if (row) row.converted += 1;
  }
  const sources = [...sourceRows.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);

  // Accept rate theo weight version
  const versionRows = versions.map((v) => {
    const rows = insights.filter((i) => i.weight_version === v.version);
    const dec = rows.filter((i) => ["accepted", "converted", "dismissed"].includes(i.status));
    const acc = rows.filter((i) => ["accepted", "converted"].includes(i.status));
    return { version: v.version, name: v.name, is_active: v.is_active, total: rows.length, acceptRate: rate(acc.length, dec.length) };
  });

  // 8 tuần gần nhất
  const weeks: { key: string; start: Date; created: number; converted: number }[] = [];
  const thisWeek = weekStart(new Date());
  for (let k = 7; k >= 0; k--) {
    const start = new Date(thisWeek.getTime() - k * 7 * DAY);
    weeks.push({ key: start.toISOString().slice(0, 10), start, created: 0, converted: 0 });
  }
  const weekIndex = new Map(weeks.map((w, idx) => [w.key, idx]));
  for (const i of insights) {
    const ci = weekIndex.get(weekStart(new Date(i.created_at)).toISOString().slice(0, 10));
    if (ci !== undefined) weeks[ci].created += 1;
    if (i.status === "converted") {
      const ui = weekIndex.get(weekStart(new Date(i.updated_at)).toISOString().slice(0, 10));
      if (ui !== undefined) weeks[ui].converted += 1;
    }
  }
  const weekMax = Math.max(...weeks.map((w) => w.created), 1);

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-gray-500">Shinhan Bank · RM Workspace</div>
        <h1 className="text-2xl font-bold">Đo lường</h1>
        <p className="text-sm text-gray-500 mt-1">90 ngày gần nhất. Số liệu tính trực tiếp từ insight, tương tác và khách hàng.</p>
      </header>

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Chưa đọc được đủ dữ liệu: {error.message}. Các con số bên dưới có thể thấp hơn thực tế.
        </div>
      ) : null}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Insight 30 ngày" value={String(in30.length)} hint={`${generated} trong 90 ngày`} />
        <Kpi label="Tỷ lệ nhận" value={`${acceptRate}%`} hint={`${acceptedAll.length}/${decided.length} đã quyết định`} />
        <Kpi label="Tương tác 30 ngày" value={String(interactions30)} hint={`${interactions.length} trong 90 ngày`} />
        <Kpi label="Đã chốt 30 ngày" value={String(converted30)} hint={`${converted} trong 90 ngày`} />
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Phễu: gợi ý → hành động → chốt</h2>
        <Bar label="Insight đã tạo" value={generated} max={funnelMax} text={String(generated)} />
        <Bar
          label="Được RM nhận"
          value={accepted}
          max={funnelMax}
          text={`${accepted} · ${rate(accepted, generated)}%`}
        />
        <Bar
          label="Khách đã có tương tác"
          value={contactedCount}
          max={funnelMax}
          text={`${contactedCount} · ${rate(contactedCount, accepted)}% của số đã nhận`}
        />
        <Bar label="Đã chốt" value={converted} max={funnelMax} text={`${converted} · ${rate(converted, generated)}%`} />
        <p className="text-xs text-gray-500 pt-1">
          Bước “khách đã có tương tác” đếm insight đã nhận mà khách đó có ít nhất một tương tác được ghi nhận, nên chỉ là mức sàn.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">Nguồn khách nào ra khách thật</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có khách hàng nào trong hệ thống.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500">
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Nguồn</th>
                  <th className="text-right py-2 font-medium">Tổng</th>
                  <th className="text-right py-2 font-medium">Lead</th>
                  <th className="text-right py-2 font-medium">Khách</th>
                  <th className="text-right py-2 font-medium">Đã chốt</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(([name, row]) => (
                  <tr key={name} className="border-b last:border-0">
                    <td className="py-2">{name}</td>
                    <td className="py-2 text-right">{row.total}</td>
                    <td className="py-2 text-right">{row.leads}</td>
                    <td className="py-2 text-right">{row.customers}</td>
                    <td className="py-2 text-right font-medium">{row.converted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">Chất lượng theo phiên bản trọng số</h2>
        {versionRows.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có phiên bản trọng số nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500">
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Phiên bản</th>
                  <th className="text-right py-2 font-medium">Insight</th>
                  <th className="text-right py-2 font-medium">Tỷ lệ nhận</th>
                </tr>
              </thead>
              <tbody>
                {versionRows.map((v) => (
                  <tr key={v.version} className="border-b last:border-0">
                    <td className="py-2">
                      v{v.version}
                      {v.name ? <span className="text-gray-500"> · {v.name}</span> : null}
                      {v.is_active ? <span className="ml-2 text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">đang dùng</span> : null}
                    </td>
                    <td className="py-2 text-right">{v.total}</td>
                    <td className="py-2 text-right font-medium">{v.acceptRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 pt-2">So sánh chỉ có nghĩa khi mỗi phiên bản đã có ít nhất khoảng 20 insight.</p>
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold">8 tuần gần nhất</h2>
        <div className="flex items-end gap-2 h-36">
          {weeks.map((w) => {
            const h = Math.round((w.created / weekMax) * 100);
            return (
              <div key={w.key} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                <div className="text-[10px] text-gray-500">{w.created || ""}</div>
                <div className="w-full rounded-t bg-[#0046ff]/80" style={{ height: `${Math.max(h, w.created ? 4 : 0)}%` }} title={`${w.created} insight`} />
                <div className="text-[10px] text-gray-400">{shortDate(w.start.toISOString())}</div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          Cột là số insight tạo trong tuần. Số đã chốt trong 8 tuần: {weeks.reduce((a, w) => a + w.converted, 0)}.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-2">Trạng thái insight</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          {Object.keys(STATUS_LABEL).map((s) => (
            <div key={s} className="rounded-lg bg-gray-50 p-3">
              <div className="text-gray-500 text-xs">{STATUS_LABEL[s]}</div>
              <div className="font-semibold">{insights.filter((i) => i.status === s).length}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 pt-3">
          Có {idOf.size} khách và lead trong hệ thống.
        </p>
      </section>
    </main>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<main className="max-w-5xl mx-auto p-8 text-gray-500">Đang tính số liệu…</main>}>
      <AnalyticsContent />
    </Suspense>
  );
}
