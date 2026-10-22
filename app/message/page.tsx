import { Suspense } from "react";
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

function messageUrl(params: {
  insightId: string;
  draft?: string;
  warnings?: string[];
  error?: string;
}): string {
  const query = new URLSearchParams();
  if (params.insightId) query.set("insight_id", params.insightId);
  if (params.draft) query.set("draft", params.draft);
  if (params.warnings?.length) query.set("canh_bao", params.warnings.join("|"));
  if (params.error) query.set("loi", params.error);
  return `/message?${query.toString()}`;
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<{
    insight_id?: string;
    draft?: string;
    canh_bao?: string;
    loi?: string;
  }>;
}) {
  const {
    insight_id = "",
    draft = "",
    canh_bao = "",
    loi = "",
  } = await searchParams;
  const warnings = canh_bao ? canh_bao.split("|").filter(Boolean) : [];
  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const hasApiKey = Boolean(resolveLlmConfig());

  const { data: insights } = await sb
    .from("rm_insights")
    .select("id, insight_type, title, detail, customers(full_name, segment), products(name)")
    .eq("status", "open")
    .order("priority_score", { ascending: false })
    .limit(50);

  const selected: any =
    insights?.find((x: any) => x.id === insight_id) ?? insights?.[0] ?? null;

  async function generateDraft(fd: FormData) {
    "use server";
    const s = await getSupabase();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) throw new Error("Chưa đăng nhập");

    const id = String(fd.get("insight_id") || "");
    const channel = String(fd.get("channel") || "zalo");

    // AGENTS.md D7: thiếu khoá thì chặn gọi, không để lỗi hệ thống.
    const config = resolveLlmConfig();
    if (!config) {
      redirect(
        messageUrl({
          insightId: id,
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
          error: "Không tìm thấy insight. Vui lòng tải lại trang và chọn lại.",
        }),
      );
    }

    // Mục 2.4 AGENTS.md: Không gửi tên thật/SĐT lên LLM.
    const prompt = buildDraftPrompt({
      channel,
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
      redirect(messageUrl({ insightId: id, error: message }));
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
        draft: finalDraft,
        warnings: outputWarnings,
      }),
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Shinhan Bank · RM Workspace
        </div>
        <h1 className="text-2xl font-bold">Soạn tin nhắn gợi ý (Ẩn danh PII)</h1>
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

      <form
        action={generateDraft}
        className="rounded-xl border bg-white p-4 space-y-4"
      >
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">
            Chọn Insight đang mở
          </label>
          <select
            name="insight_id"
            defaultValue={selected?.id ?? ""}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
          >
            {insights?.map((i: any) => (
              <option key={i.id} value={i.id}>
                {i.customers?.full_name} · {i.title} (
                {i.products?.name ?? "Tư vấn chung"})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Kênh gửi</label>
          <select
            name="channel"
            defaultValue="zalo"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="zalo">Zalo (Ngắn gọn, thân thiện)</option>
            <option value="email">Email (Trang trọng, đầy đủ)</option>
          </select>
        </div>

        <button
          disabled={!hasApiKey || !selected}
          className="px-4 py-2 text-sm rounded-lg bg-[#0046ff] text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Soạn nháp (Không gửi tên/SĐT lên AI)
        </button>
      </form>

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
    </main>
  );
}

export default function MessagePage(props: {
  searchParams: Promise<{
    insight_id?: string;
    draft?: string;
    canh_bao?: string;
    loi?: string;
  }>;
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
