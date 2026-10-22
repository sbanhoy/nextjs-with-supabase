import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDraftPrompt,
  DEFAULT_GROQ_MODEL,
  DRAFT_SYSTEM_PROMPT,
  DraftRequestError,
  requestDraft,
  resolveLlmConfig,
  scanDraft,
} from "./ai";

const PROMPT_INPUT = {
  channel: "zalo",
  segmentLabel: "Premier",
  insightLabel: "bán chéo sản phẩm",
  productName: "Thẻ tín dụng Shinhan Cashback",
};

describe("resolveLlmConfig", () => {
  it("ưu tiên Groq khi có cả hai khoá", () => {
    const config = resolveLlmConfig({
      GROQ_API_KEY: "gsk_test",
      OPENAI_API_KEY: "sk_test",
    });

    expect(config).not.toBeNull();
    expect(config?.provider).toBe("groq");
    expect(config?.apiKey).toBe("gsk_test");
    expect(config?.url).toContain("api.groq.com");
    expect(config?.model).toBe(DEFAULT_GROQ_MODEL);
  });

  it("cho phép đổi model Groq bằng GROQ_MODEL", () => {
    const config = resolveLlmConfig({
      GROQ_API_KEY: "gsk_test",
      GROQ_MODEL: "openai/gpt-oss-20b",
    });

    expect(config?.model).toBe("openai/gpt-oss-20b");
  });

  it("dùng OpenAI khi chỉ có OPENAI_API_KEY", () => {
    const config = resolveLlmConfig({ OPENAI_API_KEY: "sk_test" });

    expect(config?.provider).toBe("openai");
    expect(config?.model).toBe("gpt-4o-mini");
    expect(config?.url).toContain("api.openai.com");
  });

  it("trả null khi thiếu khoá hoặc khoá rỗng", () => {
    expect(resolveLlmConfig({})).toBeNull();
    expect(
      resolveLlmConfig({ GROQ_API_KEY: "   ", OPENAI_API_KEY: "" }),
    ).toBeNull();
  });
});

describe("buildDraftPrompt", () => {
  it("prompt hệ thống chứa đủ 4 cấm và placeholder tên khách", () => {
    expect(DRAFT_SYSTEM_PROMPT).toContain("lãi suất");
    expect(DRAFT_SYSTEM_PROMPT).toContain("cam kết");
    expect(DRAFT_SYSTEM_PROMPT).toContain("AI");
    expect(DRAFT_SYSTEM_PROMPT).toContain("PII");
    expect(DRAFT_SYSTEM_PROMPT).toContain("{{ten_khach}}");
  });

  it("chọn giọng văn theo kênh gửi", () => {
    expect(buildDraftPrompt(PROMPT_INPUT)).toContain("ZALO (ngắn gọn, thân mật)");
    expect(
      buildDraftPrompt({ ...PROMPT_INPUT, channel: "email" }),
    ).toContain("EMAIL (trang trọng)");
  });

  it("chỉ chứa phân khúc, mục đích, sản phẩm — không PII", () => {
    const prompt = buildDraftPrompt(PROMPT_INPUT);

    expect(prompt).toContain("Premier");
    expect(prompt).toContain("Thẻ tín dụng Shinhan Cashback");
    expect(prompt).not.toMatch(/\d{9,}/);
  });
});

describe("requestDraft", () => {
  const config = resolveLlmConfig({ GROQ_API_KEY: "gsk_test" })!;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gửi đúng endpoint, model, prompt hệ thống và trả nội dung", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Chào {{ten_khach}}" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const text = await requestDraft("prompt người dùng", config);

    expect(text).toBe("Chào {{ten_khach}}");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer gsk_test");

    const body = JSON.parse(init.body);
    expect(body.model).toBe(DEFAULT_GROQ_MODEL);
    expect(body.reasoning_effort).toBe("low");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Không nêu lãi suất");
    expect(body.messages[1].content).toBe("prompt người dùng");
  });

  it("dịch lỗi 429 thành thông báo tiếng Việt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
    );

    await expect(requestDraft("prompt", config)).rejects.toThrow(
      /giới hạn tần suất/,
    );
  });

  it("dịch lỗi 401 thành nhắc kiểm tra khoá", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );

    await expect(requestDraft("prompt", config)).rejects.toThrow(
      /Khoá Groq chưa hợp lệ/,
    );
  });

  it("báo lỗi khi mất mạng", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(requestDraft("prompt", config)).rejects.toBeInstanceOf(
      DraftRequestError,
    );
  });

  it("báo lỗi khi AI trả nội dung rỗng", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
        }),
      ),
    );

    await expect(requestDraft("prompt", config)).rejects.toThrow(/rỗng/);
  });
});

describe("scanDraft", () => {
  it("không cảnh báo với nháp sạch", () => {
    expect(
      scanDraft(
        "Chào {{ten_khach}}, em là RM tại Shinhan Bank. Anh/chị có muốn em tư vấn thêm không ạ?",
      ),
    ).toEqual([]);
  });

  it("phát hiện phần trăm/lãi suất", () => {
    expect(scanDraft("Sản phẩm có lãi suất 9,5%/năm")).toContain(
      "có phần trăm/lãi suất",
    );
  });

  it("phát hiện hotline và số điện thoại", () => {
    expect(scanDraft("Gọi hotline 1900 1234 để được tư vấn")).toContain(
      "có số điện thoại/hotline",
    );
    expect(scanDraft("Liên hệ 0912 345 678 ngay")).toContain(
      "có số điện thoại/hotline",
    );
  });

  it("phát hiện email và số tài khoản", () => {
    expect(scanDraft("Gửi tới cskh@shinhan.com nhé")).toContain("có email");
    expect(scanDraft("Số tài khoản 123456789012")).toContain(
      "có số tài khoản/số liệu dài",
    );
  });

  it("phát hiện cam kết và nhắc AI/hệ thống", () => {
    expect(scanDraft("Em cam kết anh sẽ được duyệt ngay")).toContain(
      "nhắc cam kết",
    );
    expect(scanDraft("Hệ thống ghi nhận yêu cầu của anh")).toContain(
      "nhắc AI/hệ thống/dữ liệu",
    );
  });
});
