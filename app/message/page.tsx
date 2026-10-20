import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";

const SEG: Record<string, string> = {
  mass: "Phổ thông",
  affluent: "Khá giả",
  premier: "Premier",
  private: "Private",
};

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ insight_id?: string; draft?: string }>;
}) {
  const { insight_id = "", draft = "" } = await searchParams;
  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

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
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new Error("Chưa cấu hình OPENAI_API_KEY trên Vercel.");
    }
    const s = await getSupabase();
    const {
      data: { user: u },
    } = await s.auth.getUser();
    if (!u) throw new Error("Chưa đăng nhập");

    const id = String(fd.get("insight_id") || "");
    const channel = String(fd.get("channel") || "zalo");
    const { data: ins }: any = await s
      .from("rm_insights")
      .select("insight_type, title, customers(full_name, segment), products(name)")
      .eq("id", id)
      .single();

    if (!ins) throw new Error("Không tìm thấy insight");

    // Mục 2.4 AGENTS.md: Không gửi tên thật/SĐT lên LLM
    const prompt = [
      `Bạn là RM tại Shinhan Bank Việt Nam. Hãy soạn 1 tin nhắn ngắn gọn qua kênh ${channel.toUpperCase()} cho khách hàng phân khúc ${SEG[ins.customers?.segment] ?? "Khách hàng"}.`,
      `Loại gợi ý: ${ins.insight_type}. Sản phẩm đề xuất: ${ins.products?.name ?? "Dịch vụ ngân hàng ưu tiên"}.`,
      `Dùng đúng chuỗi {{ten_khach}} ở vị trí tên khách hàng. Giọng văn lịch sự, tự nhiên, dưới 90 từ, không dùng từ ngữ máy móc.`,
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error("Không thể kết nối OpenAI API");
    const json = await res.json();
    const rawText: string =
      json.choices?.[0]?.message?.content?.trim() ?? "";

    // Ghép lại tên khách ở phía server nội bộ sau khi LLM trả về
    const finalDraft = rawText.replaceAll(
      "{{ten_khach}}",
      ins.customers?.full_name || "Anh/Chị",
    );

    redirect(
      `/message?insight_id=${encodeURIComponent(id)}&draft=${encodeURIComponent(finalDraft)}`,
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
          <b>Chưa cấu hình OPENAI_API_KEY:</b> Tính năng sinh lời nhắn tự động đang tạm khóa để tránh lỗi hệ thống (Nợ kỹ thuật D7). Vui lòng thêm biến môi trường <code>OPENAI_API_KEY</code> trên Vercel.
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
  searchParams: Promise<{ insight_id?: string; draft?: string }>;
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
