/**
 * Cấu hình + gọi nhà cung cấp LLM cho tính năng Soạn tin (/message).
 *
 * Ưu tiên Groq (miễn phí, API tương thích OpenAI), dự phòng OpenAI.
 * Không bao giờ log hoặc trả khoá API ra phía client.
 */

export type LlmProvider = "groq" | "openai";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  url: string;
  model: string;
};

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DRAFT_TOKENS = 700;

function providerName(provider: LlmProvider): string {
  return provider === "groq" ? "Groq" : "OpenAI";
}

/**
 * Chọn nhà cung cấp theo biến môi trường. GROQ_API_KEY được ưu tiên;
 * OPENAI_API_KEY chỉ dùng khi không có khoá Groq. Trả null nếu cả hai đều trống.
 */
export function resolveLlmConfig(
  env: Record<string, string | undefined> = process.env,
): LlmConfig | null {
  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    return {
      provider: "groq",
      apiKey: groqKey,
      url: GROQ_URL,
      model: env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    };
  }

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      url: OPENAI_URL,
      model: DEFAULT_OPENAI_MODEL,
    };
  }

  return null;
}

/**
 * Prompt hệ thống: bắt buộc đủ 4 cấm của AGENTS.md mục 2.4 và 4.5,
 * cộng thêm cấm bịa hotline/ưu đãi để tránh lỗi kiểu "1900 1234".
 */
export const DRAFT_SYSTEM_PROMPT = [
  "Bạn là trợ lý soạn tin nhắn cho Relationship Manager (RM) của Shinhan Bank Việt Nam.",
  "Chỉ trả về đúng phần nội dung tin nhắn, không thêm tiêu đề, không giải thích, không dùng markdown.",
  "QUY TẮC BẮT BUỘC:",
  "(1) Không nêu lãi suất, phần trăm, số liệu tài chính hoặc con số lợi nhuận.",
  "(2) Không cam kết, hứa hẹn, bảo đảm kết quả hay việc được duyệt.",
  "(3) Không nhắc đến AI, hệ thống, dữ liệu hay mô hình.",
  "(4) Không yêu cầu hoặc tiết lộ PII: tên thật, số điện thoại, email, số tài khoản, số dư, ngày sinh.",
  "(5) Không bịa số hotline, địa chỉ, mã ưu đãi, thời hạn hoặc chương trình không có trong yêu cầu.",
  "(6) Dùng đúng chuỗi {{ten_khach}} thay cho tên khách hàng, không thay bằng tên khác.",
].join("\n");

export type DraftPromptInput = {
  channel: string;
  segmentLabel: string;
  insightLabel: string;
  productName: string;
};

/** Prompt người dùng: chỉ chứa phân khúc, mục đích, tên sản phẩm — không PII. */
export function buildDraftPrompt(input: DraftPromptInput): string {
  const channel =
    input.channel.trim().toUpperCase() === "EMAIL"
      ? "EMAIL (trang trọng)"
      : "ZALO (ngắn gọn, thân mật)";

  return [
    `Soạn 1 tin nhắn qua kênh ${channel} cho khách hàng phân khúc ${input.segmentLabel}.`,
    `Mục đích: ${input.insightLabel}. Sản phẩm đề xuất: ${input.productName}.`,
    "Giọng văn lịch sự, tự nhiên, gần gũi; dưới 90 từ; không dùng từ ngữ máy móc.",
  ].join("\n");
}

export class DraftRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftRequestError";
  }
}

/**
 * Gửi prompt tới Groq/OpenAI và trả về nội dung nháp.
 * Mọi lỗi được đổi thành DraftRequestError tiếng Việt, không lộ khoá API.
 */
export async function requestDraft(
  prompt: string,
  config: LlmConfig,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0.5,
    max_tokens: MAX_DRAFT_TOKENS,
    messages: [
      { role: "system", content: DRAFT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  };

  // gpt-oss trên Groq mặc định "suy luận" khá dài; hạ mức thấp cho nhanh và rẻ.
  if (config.provider === "groq" && config.model.startsWith("openai/gpt-oss")) {
    body.reasoning_effort = "low";
  }

  let res: Response;
  try {
    res = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "User-Agent": "rm-crm/1.0",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new DraftRequestError(
      `Không kết nối được ${providerName(config.provider)}. Vui lòng thử lại sau ít phút.`,
    );
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new DraftRequestError(
        `Khoá ${providerName(config.provider)} chưa hợp lệ. Vui lòng kiểm tra lại biến môi trường trên Vercel.`,
      );
    }
    if (res.status === 429) {
      throw new DraftRequestError(
        `${providerName(config.provider)} đang giới hạn tần suất. Vui lòng thử lại sau ít phút.`,
      );
    }
    throw new DraftRequestError(
      `${providerName(config.provider)} trả lỗi ${res.status}. Vui lòng thử lại sau ít phút.`,
    );
  }

  const json: any = await res.json().catch(() => null);
  const text: string =
    json?.choices?.[0]?.message?.content?.trim?.() ?? "";

  if (!text) {
    throw new DraftRequestError(
      "AI trả về nội dung rỗng. Vui lòng bấm soạn lại.",
    );
  }

  return text;
}

type DraftRule = {
  label: string;
  test: (text: string) => boolean;
};

const DRAFT_RULES: DraftRule[] = [
  {
    label: "có phần trăm/lãi suất",
    test: (text) => /\d\s*%/.test(text),
  },
  {
    label: "có số điện thoại/hotline",
    test: (text) =>
      /(?:\+?84|0)(?:[\s.-]?\d){7,10}/.test(text) ||
      /\b1[89]00(?:[\s.-]?\d){3,4}\b/.test(text),
  },
  {
    label: "có email",
    test: (text) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(text),
  },
  {
    label: "có số tài khoản/số liệu dài",
    test: (text) => /\b\d{9,}\b/.test(text),
  },
  {
    label: "nhắc cam kết",
    test: (text) =>
      /\b(cam kết|đảm bảo|chắc chắn|duyệt ngay|chắc thắng)\b/i.test(text),
  },
  {
    label: "nhắc AI/hệ thống/dữ liệu",
    test: (text) =>
      /\bAI\b/.test(text) || /(hệ thống|dữ liệu|mô hình)/i.test(text),
  },
];

/**
 * Guardrail đầu ra (AGENTS.md 2.4): gắn cảnh báo để RM kiểm tra trước khi gửi.
 * Không tự động gửi, con người vẫn là người quyết định cuối cùng.
 */
export function scanDraft(text: string): string[] {
  return [
    ...new Set(
      DRAFT_RULES.filter((rule) => rule.test(text)).map((rule) => rule.label),
    ),
  ];
}
