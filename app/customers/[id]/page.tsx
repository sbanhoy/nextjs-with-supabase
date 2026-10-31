import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import ContactButtons from "@/components/ContactButtons";
import { getSupabase } from "@/lib/supabase/server";
import { firstRelated } from "@/lib/related";
import { PRODUCT_GROUP_LABEL } from "@/lib/product-groups";

const SEG: Record<string, string> = {
  mass: "Phổ thông",
  affluent: "Khá giả",
  premier: "Premier",
  private: "Private",
};

const STAGE_LABEL: Record<string, string> = {
  customer: "Khách hàng",
  lead: "Lead",
};

const HOLDING_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "Đang dùng", color: "bg-green-100 text-green-700" },
  interested: { label: "Quan tâm", color: "bg-blue-100 text-blue-700" },
  closed: { label: "Đã đóng", color: "bg-gray-100 text-gray-600" },
};

const INSIGHT_LABEL: Record<string, string> = {
  churn_risk: "Rủi ro rời bỏ",
  next_best_action: "Hành động tiếp theo",
  cross_sell: "Cross-sell",
  reengage: "Tái kết nối",
  life_event: "Sự kiện cá nhân",
  referral: "Xin giới thiệu",
};

const INSIGHT_COLOR: Record<string, string> = {
  churn_risk: "bg-red-100 text-red-700",
  next_best_action: "bg-green-100 text-green-700",
  cross_sell: "bg-blue-100 text-blue-700",
  reengage: "bg-amber-100 text-amber-700",
  life_event: "bg-purple-100 text-purple-700",
  referral: "bg-teal-100 text-teal-700",
};

const INSIGHT_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "Đang mở", color: "bg-[#0046ff]/10 text-[#0046ff]" },
  accepted: { label: "Đã nhận", color: "bg-green-100 text-green-700" },
  converted: { label: "Đã chốt", color: "bg-emerald-100 text-emerald-700" },
  dismissed: { label: "Bỏ qua", color: "bg-gray-100 text-gray-600" },
  expired: { label: "Hết hạn", color: "bg-gray-100 text-gray-400" },
};

const CHANNEL_LABEL: Record<string, string> = {
  call: "📞 Gọi điện",
  zalo: "💬 Zalo",
  meeting: "🤝 Gặp trực tiếp",
  sms: "✉️ SMS",
  email: "📧 Email",
  messenger: "💬 Messenger",
};

function formatMoney(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!amount) return "—";
  if (amount >= 1e9) return `${(amount / 1e9).toFixed(1)} tỷ`;
  return `${(amount / 1e6).toFixed(0)} tr`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("vi-VN");
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const [customerRes, holdingsRes, insightsRes, interactionsRes, scoreRes] =
    await Promise.all([
      sb.from("customers").select("*").eq("id", id).maybeSingle(),
      sb
        .from("product_holdings")
        .select("id, status, maturity_date, products(name, category)")
        .eq("customer_id", id)
        .order("maturity_date", { ascending: true, nullsFirst: false }),
      sb
        .from("rm_insights")
        .select(
          "id, insight_type, title, detail, priority_score, status, created_at, expires_at, products(name)",
        )
        .eq("customer_id", id)
        .order("priority_score", { ascending: false })
        .limit(30),
      sb
        .from("interactions")
        .select("channel, note, occurred_at")
        .eq("customer_id", id)
        .order("occurred_at", { ascending: false })
        .limit(10),
      sb.from("v_customer_scores").select("score").eq("id", id).maybeSingle(),
    ]);

  const customer: any = customerRes.data;
  if (!customer) {
    return (
      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-3">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Shinhan Bank · Hồ sơ khách hàng
        </div>
        <h1 className="text-xl font-bold">Không tìm thấy khách hàng này</h1>
        <p className="text-sm text-gray-600">
          Có thể khách đã bị xoá hoặc đường dẫn không đúng.
        </p>
        <Link href="/customers" className="text-sm text-[#0046ff] underline">
          ← Về danh sách khách &amp; lead
        </Link>
      </main>
    );
  }

  const holdings: any[] = holdingsRes.data ?? [];
  const insights: any[] = insightsRes.data ?? [];
  const interactions: any[] = interactionsRes.data ?? [];
  const score = scoreRes.data?.score;

  const info: Array<[string, string]> = [
    ["Điện thoại", customer.phone || "—"],
    ["Email", customer.email || "—"],
    ["Phân khúc", SEG[customer.segment] ?? customer.segment ?? "—"],
    ["Tài sản", formatMoney(customer.aum)],
    ["Tài sản 3 tháng trước", formatMoney(customer.aum_3m_ago)],
    ["Ngày sinh", formatDate(customer.dob)],
    ["Nguồn", customer.source || "—"],
    ["Trạng thái", STAGE_LABEL[customer.stage] ?? customer.stage ?? "—"],
  ];

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <div>
        <Link
          href="/customers"
          className="text-xs text-gray-500 hover:text-[#0046ff] hover:underline"
        >
          ← Danh sách khách &amp; lead
        </Link>
      </div>

      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Shinhan Bank · Hồ sơ khách hàng
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{customer.full_name}</h1>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-2 py-0.5 rounded-full ${
                customer.stage === "lead"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {STAGE_LABEL[customer.stage] ?? customer.stage}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0046ff]">
              {SEG[customer.segment] ?? customer.segment}
            </span>
            {score != null && (
              <span className="font-semibold text-[#0046ff]">
                {Number(score).toFixed(0)} điểm
              </span>
            )}
          </div>
        </div>
        <ContactButtons
          cid={customer.id}
          phone={customer.phone}
          stage={customer.stage}
          name={customer.full_name}
        />
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {info.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-3">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-sm font-medium truncate">{value}</div>
          </div>
        ))}
      </section>

      {customer.note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Ghi chú:</b> {customer.note}
        </div>
      )}

      <section className="rounded-xl border bg-white">
        <div className="border-b px-4 py-2 text-sm font-semibold">
          Sản phẩm ({holdings.length})
        </div>
        {holdings.length === 0 ? (
          <div className="p-4 text-xs text-gray-500">
            Chưa ghi nhận sản phẩm nào.
          </div>
        ) : (
          <ul className="divide-y">
            {holdings.map((holding) => {
              const product = firstRelated(holding.products);
              const status = HOLDING_STATUS[holding.status] ?? {
                label: holding.status,
                color: "bg-gray-100 text-gray-600",
              };
              return (
                <li
                  key={holding.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span>
                    {product?.name ?? "Sản phẩm"}
                    <span className="ml-2 text-xs text-gray-400">
                      {PRODUCT_GROUP_LABEL[product?.category] ?? product?.category}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full ${status.color}`}>
                      {status.label}
                    </span>
                    {holding.maturity_date && (
                      <span className="text-gray-500">
                        Đáo hạn {formatDate(holding.maturity_date)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <h2 className="font-semibold">Insight ({insights.length})</h2>
          <span className="text-xs text-gray-500">
            Gợi ý đang mở có nút Soạn tin
          </span>
        </div>
        {insights.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-4 text-xs text-gray-500">
            Khách này chưa có insight. Insight sẽ xuất hiện sau lần sinh gợi ý
            tiếp theo.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {insights.map((insight) => {
              const status = INSIGHT_STATUS[insight.status] ?? {
                label: insight.status,
                color: "bg-gray-100 text-gray-600",
              };
              return (
                <div
                  key={insight.id}
                  className={`rounded-xl border bg-white p-4 space-y-1 ${
                    insight.status === "open" ? "" : "opacity-75"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        INSIGHT_COLOR[insight.insight_type] ??
                        "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {INSIGHT_LABEL[insight.insight_type] ??
                        insight.insight_type}
                    </span>
                    <span className="text-xs font-semibold text-[#0046ff]">
                      {Number(insight.priority_score ?? 0).toFixed(0)} điểm
                    </span>
                  </div>
                  <div className="text-sm font-medium">{insight.title}</div>
                  {insight.detail && (
                    <div className="text-xs text-gray-500">{insight.detail}</div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}
                    >
                      {status.label}
                    </span>
                    {insight.status === "open" && (
                      <Link
                        href={`/message?insight_id=${insight.id}`}
                        className="text-xs px-3 py-1 rounded-lg bg-[#0046ff] text-white"
                      >
                        Soạn tin
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white">
        <div className="border-b px-4 py-2 text-sm font-semibold">
          Tương tác gần đây ({interactions.length})
        </div>
        {interactions.length === 0 ? (
          <div className="p-4 text-xs text-gray-500">
            Chưa ghi nhận tương tác nào.
          </div>
        ) : (
          <ul className="divide-y">
            {interactions.map((interaction, index) => (
              <li
                key={`${interaction.occurred_at}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
              >
                <span>
                  {CHANNEL_LABEL[interaction.channel] ?? interaction.channel}
                  {interaction.note && (
                    <span className="text-gray-500"> · {interaction.note}</span>
                  )}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDateTime(interaction.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-center text-gray-500">Đang tải hồ sơ…</main>
      }
    >
      <Content params={props.params} />
    </Suspense>
  );
}
