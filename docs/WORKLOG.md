# CRM Shinhan RM · Worklog

| Ngày | Agent | Task | Nhánh | Trạng thái |
|---|---|---|---|---|
| 2026-10-19 | Gemini | Xử lý nợ kỹ thuật P0 (D1, D2, D3), siết bảo mật Admin Server Actions & dọn redirect loop | `fix/p0-auth-and-debt` | Đã hoàn thành |
| 2026-10-20 | Net | Bổ sung loading skeleton cho `/message` và `/admin/weights` (P0, đủ 4 route) | `feat/p0-loading-message-admin` | Đã merge (PR #7) |
| 2026-10-20 | Net (subagent) | Viết lại README.md tiếng Việt cho CRM, bỏ nội dung Supabase starter kit | `docs/readme-crm` | Đã merge (PR #8) |
| 2026-10-20 | Net | D5: dump schema Supabase thành `supabase/migrations/000_baseline.sql` (P0) | `feat/d5-baseline-schema` | Đã merge (PR #9) |
| 2026-10-20 | Net | Sửa lỗi theme: ép giao diện sáng để chữ không mất khi máy bật dark mode | `fix/force-light-theme` | Đã merge (PR #10) |
| 2026-10-20 | Net (subagent) | D6: tách logic thuần `toDate`, `toNum`, `parseBulkRows` ra `lib/parse.ts` + Vitest; sửa bug `toNum` với số tiền có dấu chấm phân cách nghìn (P2) | `feat/d6-pure-logic-tests` | Đã merge (PR #11) |
| 2026-10-20 | Net | Hàm `fn_web_lead` nhận lead từ form vay.kimminso.com, rate limit 5 lead mỗi phút | `feat/web-lead-rpc` | Chờ merge |
| 2026-10-20 | Net (subagent) | Khu vực sản phẩm: trang `/products` 7 nhóm, số lead/khách quan tâm, lọc khách theo sản phẩm + cột sản phẩm | `feat/crm-product-areas` | Chờ merge |
| 2026-10-22 | DeepSeek Harness (Lead) | D7 + chuyển LLM sang Groq: ưu tiên `GROQ_API_KEY`, dự phòng OpenAI, prompt 4 cấm, guardrail cảnh báo đầu ra, banner lỗi tiếng Việt | `feat/groq-llm` | Đã merge (PR #17) |
| 2026-10-22 | DeepSeek Harness (Lead) | UX `/message`: thay dropdown insight bằng thẻ card bấm chọn, kênh gửi thành 2 nút lớn, form soạn đưa lên đầu trang, giữ kênh khi đổi insight | `feat/message-card-picker` | Đã merge (PR #18) |
| 2026-10-23 | DeepSeek Harness (Lead) | Gộp insight theo khách (1 thẻ/khách) + trang hồ sơ khách `/customers/[id]` (thông tin, sản phẩm, insight, tương tác) + liên kết 2 chiều; insight "sắp đáo hạn" gắn đúng sản phẩm của khách | `feat/customer-cards-profile` | Chờ merge (PR #19) |
