import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";
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

  const { data: insights } = await sb
    .from("rm_insights")
    .select(
      "id, insight_type, title, detail, priority_score, customers(full_name, segment), products(name)",
    )
    .eq("status", "open")
    .order("priority_score", { ascending: false })
    .limit(50);

  const list: any[] = insights ?? [];
  const selected: any = insight_id
    ? (list.find((x: any) => x.id === insight_id) ?? null)
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
      .select("insight_type, title, customers(full_name, segment), products(name)")
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

    // Mục 2.4 AGENTS.md: Không gửi tên thật/SĐT lên LLM.
    const prompt = buildDraftPrompt({
      channel: chosenChannel,
      segmentLabel: SEG[ins.customers?.segment] ?? "Khách hàng",
      insightLabel:
        INSIGHT_LABEL[ins.insight_type] ?? "tư vấn sản phẩm phù hợp",
      productName: ins.products?.name ?? "Dịch vụ ngân hàng ưu tiên",
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
          Bấm vào thẻ insight để chọn khách, chọn kênh gửi rồi bấm soạn nháp.
          Tên khách chỉ được ghép vào sau, không gửi lên AI.
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
          Insight này không còn mở. Vui lòng chọn một thẻ insight bên dưới.
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
                {selected.customers?.full_name}
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
            {selected ? "Chọn insight khác" : "1. Chọn insight cần soạn"}
          </h2>
          <span className="text-xs text-gray-500">
            {list.length} insight đang mở
          </span>
        </div>

        {list.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-gray-500">
            Chưa có insight nào đang mở. Vào{" "}
            <Link href="/insights" className="text-[#0046ff] underline">
              trang Insight
            </Link>{" "}
            để sinh gợi ý mới.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((i: any) => {
            const isSelected = selected?.id === i.id;
            return (
              <Link
                key={i.id}
                href={messageUrl({ insightId: i.id, channel })}
                aria-current={isSelected ? "true" : undefined}
                className={`group rounded-xl border bg-white p-4 shadow-sm transition hover:border-[#0046ff] ${
                  isSelected
                    ? "border-[#0046ff] ring-2 ring-[#0046ff]/15"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      INSIGHT_COLOR[i.insight_type] ??
                      "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {INSIGHT_SHORT[i.insight_type] ?? i.insight_type}
                  </span>
                  <span className="text-sm font-semibold text-[#0046ff]">
                    {Number(i.priority_score ?? 0).toFixed(0)} điểm
                  </span>
                </div>

                <div className="mt-2 font-medium">
                  {i.customers?.full_name}
                  <span className="text-xs text-gray-500 ml-2">
                    {SEG[i.customers?.segment] ?? i.customers?.segment}
                  </span>
                </div>

                <div className="mt-1 text-sm">{i.title}</div>
                {i.detail && (
                  <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                    {i.detail}
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-500">
                    Gợi ý:{" "}
                    <b className="text-gray-700">
                      {i.products?.name ?? "Tư vấn chung"}
                    </b>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isSelected
                        ? "text-[#0046ff]"
                        : "text-gray-400 group-hover:text-[#0046ff]"
                    }`}
                  >
                    {isSelected ? "✓ Đang chọn" : "Chọn →"}
                  </span>
                </div>
              </Link>
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
