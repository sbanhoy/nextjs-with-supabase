# CRM Shinhan RM

Ứng dụng CRM cá nhân dùng Next.js App Router và Supabase Auth/Postgres, dành cho quy trình quản lý khách hàng, lead và insight chăm sóc.

## Trạng thái repository

- Mã giao diện và Server Actions nằm trong `app/` và `components/`.
- Supabase SSR clients nằm trong `lib/supabase/`.
- `AGENTS.md` là tài liệu nguyên tắc làm việc và bàn giao. Những mô tả về production cần được xác minh độc lập.
- Repository hiện **không chứa `supabase/migrations/`**. Không tự tạo migration baseline bằng cách đoán schema.
- Tích hợp Google Sheets, Apps Script, Supabase webhook/cron, domain và biến môi trường không thể được xác minh chỉ từ source code ở repo này.

## Cấu hình môi trường

Tạo biến môi trường trong môi trường triển khai từ đúng Supabase project:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Không commit secret, service-role key, access token hoặc dữ liệu khách hàng. Không dùng biến môi trường của project Supabase khác với project đang chạy.

## Chạy và kiểm tra

Các script hiện có trong `package.json`:

- `npm run dev` — phát triển local.
- `npm run lint` — ESLint.
- `npm run build` — build Next.js.

Repository chưa có lockfile được track. Các dependency khai báo bằng `latest` khiến cài đặt không tái lập hoàn toàn; cần xác nhận phiên bản Next.js/Supabase tương thích rồi tạo lockfile trong môi trường có thể chạy cài đặt và kiểm thử.

## Ranh giới bảo mật

- Chỉ tài khoản có hồ sơ trong bảng `rm_users` được phép vào CRM; thao tác quản trị phải kiểm tra role phía server.
- Kiểm tra ứng dụng không thay thế Row Level Security (RLS). Trước khi sử dụng dữ liệu thật, cần xác minh RLS trên từng bảng, view và RPC trong đúng Supabase project.
- Tự đăng ký công khai không phải luồng cấp quyền. Tắt sign-up trong Supabase Auth settings nếu hệ thống chỉ dành cho một người dùng.
- Không chạy migration hoặc thay đổi production trước khi backup và đối chiếu schema thực tế.

## Tài liệu

- [AGENTS.md](./AGENTS.md) — nguyên tắc bất biến và hướng dẫn agent.
- [Báo cáo kiểm toán repository](./docs/REPOSITORY-AUDIT-2026-10-19.md).
