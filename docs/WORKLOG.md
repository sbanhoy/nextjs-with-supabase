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
