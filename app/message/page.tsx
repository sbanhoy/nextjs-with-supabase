import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";
import { firstRelated } from "@/lib/related";
import {
  buildDraftPrompt,
  DraftRequestError,
  requestDraft,
  resolveLlmConfig,
  scanDraft,
} from "@/lib/ai";

const SEG: Record<string, string> = {
  mass: "Phổ thông",
  affluent: "Khá giả",
  premier: "Premier",
  private: "Private",
};

const INSIGHT_LABEL: Record<string, string> = {
  churn_risk: "giữ chân khách có nguy cơ rời bỏ",
  next_best_action: "gợi ý hành động tiếp theo",
  cross_sell: "bán chéo sản phẩm",
  reengage: "kết nối lại khách cũ",
  life_event: "sự kiện quan trọng của khách",
  referral: "xin giới thiệu khách mới",
};

const INSIGHT_SHORT: Record<string, string> = {
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

const CHANNELS = [
  { value: "zalo", label: "Zalo", hint: "Ngắn gọn, thân mật" },
  { value: "email", label: "Email", hint: "Trang trọng, đầy đủ" },
] as const;

type MessageSearchParams = {
  insight_id?: string;
  draft?: string;
  canh_bao?: string;
  loi?: string;
  kenh?: string;
};

type CustomerGroup = {
  id: string;
  name: string;
  segment?: string;
  topScore: number;
  insights: any[];
};

function messageUrl(params: {
  insightId?: string;
  channel?: string;
  draft?: string;
  warnings?: string[];
  error?: string;
}): string {
  const query = new URLSearchParams();
  if (params.insightId) query.set("insight_id", params.insightId);
  if (params.channel) query.set("kenh", params.channel);
  if (params.draft) query.set("draft", params.draft);
  if (params.warnings?.length) query.set("canh_bao", params.warnings.join("|"));
  if (params.error) query.set("loi", params.error);
  const queryString = query.toString();
  return queryString ? `/message?${queryString}` : "/message";
}

function formatDate(value?: string | null): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}/${month}/${year}` : value;
}

type MaturingProduct = { productName?: string; date?: string | null };

async function getMaturingProduct(
  sb: any,
  customerId: string,
  today: string,
): Promise<MaturingProduct | null> {
  if (!customerId) return null;
  const { data } = await sb
    .from("product_holdings")
    .select("maturity_date, products(name)")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .gte("maturity_date", today)
    .order("maturity_date", { ascending: true })
    .limit(1);
  const row: any = data?.[0];
  if (!row) return null;
  return {
    productName: firstRelated(row.products)?.name,
    date: row.maturity_date,
  };
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<MessageSearchParams>;
}) {
  const {
    insight_id = "",
    draft = "",
    canh_bao = "",
    loi = "",
    kenh,
  } = await searchParams;
  const channel = kenh === "email" ? "email" : "zalo";
  const warnings = canh_bao ? canh_bao.split("|").filter(Boolean) : [];

  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const hasApiKey = Boolean(resolveLlmConfig());
  const today = new Date().toISOString().slice(0, 10);

  const { data: insights } = await sb
    .from("rm_insights")
    .select(
      "id, insight_type, title, detail, priority_score, customers(id, full_name, segment), products(name)",
    )
    .eq("status", "open")
    .order("priority_score", { ascending: false })
    .limit(50);

  const list: any[] = insights ?? [];
  const selected: any = insight_id
    ? (list.find((x: any) => x.id === insight_id) ?? null)
    : null;
  const selectedCustomerId = selected?.customers?.id ?? "";

  // Gộp insight theo khách: mỗi khách 1 thẻ, bên trong là các gợi ý.
  const groupMap = new Map<string, CustomerGroup>();
  for (const insight of list) {
    const customer = insight.customers ?? {};
    const customerId = customer.id ?? "unknown";
    const group: CustomerGroup = groupMap.get(customerId) ?? {
      id: customerId,
      name: customer.full_name ?? "Khách hàng",
      segment: customer.segment,
      topScore: 0,
      insights: [],
    };
    group.insights.push(insight);
    group.topScore = Math.max(
      group.topScore,
      Number(insight.priority_score ?? 0),
    );
    groupMap.set(customerId, group);
  }
  const groups = [...groupMap.values()].sort(
    (a, b) => b.topScore - a.topScore,
  );

  const maturing =
    selected?.insight_type === "next_best_action"
      ? await getMaturingProduct(sb, selectedCustomerId, today)
      : null;

  async function generateDraft(fd: FormData) {
    "use server";
    const s = await getSupabase();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) throw new Error("Chưa đăng nhập");

    const id = String(fd.get("insight_id") || "");
    const chosenChannel =
      String(fd.get("channel") || "zalo") === "email" ? "email" : "zalo";

    // AGENTS.md D7: thiếu khoá thì chặn gọi, không để lỗi hệ thống.
    const config = resolveLlmConfig();
    if (!config) {
      redirect(
        messageUrl({
          insightId: id,
          channel: chosenChannel,
          error:
            "Chưa cấu hình khoá AI trên Vercel. Thêm biến môi trường GROQ_API_KEY (khuyến nghị) hoặc OPENAI_API_KEY rồi Redeploy.",
        }),
      );
    }

    const { data: ins }: any = await s
      .from("rm_insights")
      .select(
        "insight_type, title, customer_id, customers(full_name, segment), products(name)",
      )
      .eq("id", id)
      .single();

    if (!ins) {
      redirect(
        messageUrl({
          insightId: id,
          channel: chosenChannel,
          error: "Không tìm thấy insight. Vui lòng tải lại trang và chọn lại.",
        }),
      );
    }

    // Insight "sắp đáo hạn" phải gắn với đúng sản phẩm của khách,
    // tránh câu "Tư vấn chung" không liên quan.
    let productName = ins.products?.name ?? "Dịch vụ ngân hàng ưu tiên";
    if (ins.insight_type === "next_best_action" && ins.customer_id) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const maturingProduct = await getMaturingProduct(
        s,
        ins.customer_id,
        todayIso,
      );
      if (maturingProduct?.productName) productName = maturingProduct.productName;
    }

    // Mục 2.4 AGENTS.md: Không gửi tên thật/SĐT lên LLM.
    const prompt = buildDraftPrompt({
      channel: chosenChannel,
      segmentLabel: SEG[ins.customers?.segment] ?? "Khách hàng",
      insightLabel:
        INSIGHT_LABEL[ins.insight_type] ?? "tư vấn sản phẩm phù hợp",
      productName,
    });

    let rawText: string;
    try {
      rawText = await requestDraft(prompt, config);
    } catch (err) {
      const message =
        err instanceof DraftRequestError
          ? err.message
          : "Không soạn được nháp. Vui lòng thử lại sau ít phút.";
      redirect(
        messageUrl({
          insightId: id,
          channel: chosenChannel,
          error: message,
        }),
      );
    }

    // Ghép lại tên khách ở phía server nội bộ sau khi LLM trả về.
    const finalDraft = rawText.replaceAll(
      "{{ten_khach}}",
      ins.customers?.full_name || "Anh/Chị",
    );

    // Mục 2.4 AGENTS.md: cảnh báo nếu đầu ra vi phạm guardrail.
    const outputWarnings = scanDraft(rawText);

    redirect(
      messageUrl({
        insightId: id,
        channel: chosenChannel,
        draft: finalDraft,
        warnings: outputWarnings,
      }),
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Shinhan Bank · RM Workspace
        </div>
        <h1 className="text-2xl font-bold">Soạn tin nhắn gợi ý (Ẩn danh PII)</h1>
        <p className="text-xs text-gray-500 mt-1">
          Mỗi thẻ là một khách. Bấm vào gợi ý trong thẻ để chọn, chọn kênh rồi
          bấm soạn nháp. Tên khách chỉ được ghép vào sau, không gửi lên AI.
        </p>
      </header>

      {!hasApiKey && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800">
          <b>Chưa cấu hình khoá AI:</b> Tính năng soạn nháp đang tạm khóa để
          tránh lỗi hệ thống (Nợ kỹ thuật D7). Vui lòng thêm biến môi trường{" "}
          <code>GROQ_API_KEY</code> (khuyến nghị, miễn phí) hoặc{" "}
          <code>OPENAI_API_KEY</code> trong Vercel → Settings → Environment
          Variables, sau đó bấm Redeploy.
        </div>
      )}

      {loi && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-700">
          <b>Chưa soạn được nháp:</b> {loi}
        </div>
      )}

      {insight_id && !selected && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800">
          Insight này không còn mở. Vui lòng chọn một gợi ý trong thẻ bên dưới.
        </div>
      )}

      {selected && (
        <form
          action={generateDraft}
          className="rounded-xl border border-[#0046ff]/30 bg-white p-4 space-y-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs text-gray-500">Đang soạn cho</div>
              <div className="font-semibold">
                <Link
                  href={`/customers/${selectedCustomerId}`}
                  className="hover:text-[#0046ff] hover:underline"
                >
                  {selected.customers?.full_name}
                </Link>
                <span className="font-normal text-gray-600">
                  {" "}
                  · {INSIGHT_SHORT[selected.insight_type] ?? selected.title}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{selected.title}</div>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                INSIGHT_COLOR[selected.insight_type] ??
                "bg-gray-100 text-gray-700"
              }`}
            >
              {INSIGHT_SHORT[selected.insight_type] ?? selected.insight_type}
            </span>
          </div>

          {maturing?.productName && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-[#0046ff]">
              Sản phẩm sắp đáo hạn: <b>{maturing.productName}</b>
              {maturing.date ? <> · {formatDate(maturing.date)}</> : null}
            </div>
          )}

          <input type="hidden" name="insight_id" value={selected.id} />

          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-600">Kênh gửi</div>
            <div className="grid grid-cols-2 gap-2">
              {CHANNELS.map((c) => (
                <label key={c.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="channel"
                    value={c.value}
                    defaultChecked={channel === c.value}
                    className="peer sr-only"
                  />
                  <span className="block rounded-lg border px-3 py-2 text-sm transition hover:bg-gray-50 peer-checked:border-[#0046ff] peer-checked:bg-blue-50 peer-checked:text-[#0046ff] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0046ff]/30">
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-xs text-gray-500">
                      {c.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            disabled={!hasApiKey}
            className="w-full sm:w-auto px-4 py-2 text-sm rounded-lg bg-[#0046ff] text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Soạn nháp (Không gửi tên/SĐT lên AI)
          </button>
        </form>
      )}

      {draft && (
        <section className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-xs font-semibold text-gray-500">
            Nội dung gợi ý (Copy để gửi qua Zalo/Email):
          </div>

          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <b>⚠️ Cần kiểm tra trước khi gửi:</b> {warnings.join("; ")}. Hệ
              thống chỉ soạn nháp, anh/chị đọc lại và chỉnh trước khi gửi.
            </div>
          )}

          <textarea
            readOnly
            rows={5}
            value={draft}
            className="w-full border rounded-lg p-3 text-sm bg-gray-50"
          />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <h2 className="font-semibold">
            {selected ? "Chọn khách / gợi ý khác" : "1. Chọn khách và gợi ý"}
          </h2>
          <span className="text-xs text-gray-500">
            {groups.length} khách · {list.length} insight đang mở
          </span>
        </div>

        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-gray-500">
            Chưa có insight nào đang mở. Vào{" "}
            <Link href="/insights" className="text-[#0046ff] underline">
              trang Insight
            </Link>{" "}
            để sinh gợi ý mới.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => {
            const isSelectedGroup = selectedCustomerId === group.id;
            return (
              <div
                key={group.id}
                className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                  isSelectedGroup
                    ? "border-[#0046ff] ring-2 ring-[#0046ff]/15"
                    : "border-gray-200 hover:border-[#0046ff]/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/customers/${group.id}`}
                      className="font-medium hover:text-[#0046ff] hover:underline"
                    >
                      {group.name}
                    </Link>
                    <span className="text-xs text-gray-500 ml-2">
                      {SEG[group.segment ?? ""] ?? group.segment}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-[#0046ff] whitespace-nowrap">
                    {group.topScore.toFixed(0)} điểm
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.insights.map((insight) => {
                    const isSelectedInsight = selected?.id === insight.id;
                    return (
                      <Link
                        key={insight.id}
                        href={messageUrl({
                          insightId: insight.id,
                          channel,
                        })}
                        title={insight.title}
                        className={`text-xs px-2.5 py-1 rounded-full border transition ${
                          isSelectedInsight
                            ? "bg-[#0046ff] text-white border-[#0046ff]"
                            : `${
                                INSIGHT_COLOR[insight.insight_type] ??
                                "bg-gray-100 text-gray-700"
                              } border-transparent hover:border-[#0046ff]`
                        }`}
                      >
                        {INSIGHT_SHORT[insight.insight_type] ??
                          insight.insight_type}
                        <span
                          className={`ml-1 ${
                            isSelectedInsight ? "text-white/80" : "opacity-70"
                          }`}
                        >
                          {Number(insight.priority_score ?? 0).toFixed(0)}
                        </span>
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {group.insights.length} gợi ý
                  </span>
                  <Link
                    href={`/customers/${group.id}`}
                    className="text-xs text-[#0046ff] hover:underline"
                  >
                    Hồ sơ khách →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default function MessagePage(props: {
  searchParams: Promise<MessageSearchParams>;
}) {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-center text-gray-500">Đang tải…</main>
      }
    >
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
