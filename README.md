# CRM Shinhan RM

CRM nội bộ cho một Relationship Manager (RM) tại Shinhan Bank Việt Nam. RM mở app mỗi ngày để biết nên liên hệ ai, vì sao và nên nói gì.

## Dự án là gì

RM phụ trách danh mục khách cá nhân thuộc nhiều phân khúc (mass, affluent, premier, private), với KPI giữ khách, bán chéo và kiếm khách mới. Khách và lead từ đội cộng tác viên được gom về một chỗ, chấm điểm theo bộ trọng số, rồi sinh insight có lý do giải thích. RM phản hồi Nhận, Chốt hoặc Bỏ qua kèm lý do. Chuỗi phản hồi này nuôi việc AI đề xuất bộ trọng số mới.

AI đề xuất, con người quyết định. AI không tự đổi trọng số, không nhận PII của khách và không tự động hoá Zalo cá nhân.

Đây không phải CRM đa người dùng, không có báo cáo cho quản lý và không tích hợp core banking.

## Stack và hạ tầng

| Thành phần | Đang dùng |
|---|---|
| Web | Next.js 16 App Router, `cacheComponents: true`, React 19, Tailwind CSS |
| Dữ liệu | Supabase Postgres (Singapore) và Supabase Auth |
| Triển khai | Vercel, function region `sin1`, auto-deploy từ `main` |
| AI | OpenAI `gpt-4o-mini`, chỉ soạn lời; rule/SQL quyết định insight, sản phẩm và điểm ưu tiên |
| Đồng bộ | Google Sheets + Apps Script, đồng bộ hai chiều bảng `customers` |

## Chạy local

Cần `pnpm`.

```bash
pnpm install
pnpm dev
```

Mở http://localhost:3000. Trang chủ tự chuyển về `/insights`.

Tạo `.env.local` ở thư mục gốc, điền giá trị của project Supabase đang dùng:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
```

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: dùng publishable key hoặc anon key. Phía server cũng đọc `NEXT_PUBLIC_SUPABASE_ANON_KEY` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`; phía trình duyệt chỉ đọc biến `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `OPENAI_API_KEY`: cần cho trang Soạn tin. Thiếu biến này, nút soạn nháp bị khoá và app hiện cảnh báo.
- Không đặt service role key trong `.env.local`, Vercel hay repo. Key này chỉ dùng trong Apps Script.

Không dán giá trị thật vào README, PR hay commit.

## Bản đồ thư mục

```text
app/insights/       Màn hình chính: insight theo điểm, Nhận/Chốt/Bỏ qua kèm lý do
app/customers/      Danh sách khách và lead, thêm một hoặc dán nhiều
app/message/        Soạn tin bằng AI cho Zalo và Email, không gửi tên và số điện thoại lên AI
app/admin/weights/  Quản lý phiên bản trọng số, kích hoạt, sinh insight, AI đề xuất
app/actions.ts      Server actions ghi tương tác và xoá khách
lib/supabase/       Kết nối Supabase cho server, client và proxy
components/         Điều hướng, nút liên hệ, thành phần giao diện dùng chung
```

## Quy ước làm việc

- Đọc hết [AGENTS.md](AGENTS.md) trước khi sửa bất kỳ file nào. Đây là nguồn sự thật về kiến trúc, nguyên tắc và quy trình.
- Không push thẳng `main`.
- Mỗi task một nhánh riêng và một PR về `main`. Chủ dự án là người merge sau khi thử Preview.
- Đối chiếu 10 nguyên tắc bất biến ở mục 2 của AGENTS.md trước khi mở PR. Tóm lại: AI chỉ đề xuất, người kích hoạt; không gửi PII cho LLM; không tự động hoá Zalo cá nhân; không xoá dữ liệu khách hàng loạt.

## Deploy

- Vercel auto-deploy từ `main`. Mỗi PR có Preview URL để chủ dự án bấm thử.
- Function region `sin1`; Supabase đặt tại Singapore.
- Biến môi trường đặt trong Vercel Project Settings, không commit.
- Quay lui: Vercel, Deployments, chọn bản trước, Promote to Production.

## Tài liệu

- [AGENTS.md](AGENTS.md): bối cảnh, 10 nguyên tắc, kiến trúc, schema, quy ước kỹ thuật và quy trình.
- [docs/WORKLOG.md](docs/WORKLOG.md): nhật ký task của các agent.
