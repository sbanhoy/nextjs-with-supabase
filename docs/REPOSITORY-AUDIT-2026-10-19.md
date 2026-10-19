# Báo cáo kiểm toán repository — 2026-10-19

Repository: `sbanhoy/nextjs-with-supabase`  
Phạm vi: source code và tài liệu được track trên nhánh `main` tại thời điểm rà soát.  
Phương pháp: đọc source tĩnh; không truy cập production database/secrets và không thực hiện deploy.

## Kết luận điều hành

**Chưa đủ điều kiện kết luận ứng dụng an toàn cho dữ liệu khách hàng thật.** Source có các luồng CRM hữu ích, nhưng quyền truy cập không thể được chứng minh đầy đủ nếu chưa kiểm tra RLS và SQL functions trong Supabase. Tài liệu mô tả một hệ thống đã triển khai, trong khi repository thiếu migrations và còn giữ README từ template gốc.

Nhánh kiểm toán bổ sung kiểm tra quyền ở Server Actions, giới hạn tài khoản CRM theo bảng `rm_users`, ràng buộc thao tác khách hàng theo `rm_id`, xác thực dữ liệu đầu vào cơ bản và cập nhật tài liệu. Các thay đổi này **không thay thế** việc kiểm tra RLS/RPC ngoài Supabase.

## Phát hiện

### P0 — Cần xác minh trước khi dùng dữ liệu thật

1. **RLS và RPC chưa thể xác minh từ repository.** Không có `supabase/migrations/` hoặc file SQL nguồn để kiểm tra policies, grants, functions và views. Cần xuất schema/policies từ đúng project trước khi kết luận.
2. **Tài khoản mới đăng ký không được tự động có quyền CRM.** Bản sửa kiểm tra hồ sơ `rm_users` trong proxy và Server Actions, fail-closed khi không thể xác minh hồ sơ. Cần xác nhận policy SELECT cho hồ sơ người dùng trong bảng này.
3. **Server Actions quản trị cần kiểm tra quyền độc lập.** Bản sửa thêm `requireAdminUser()` cho lưu/kích hoạt trọng số, sinh insight và đề xuất trọng số. Quyền SQL/RPC vẫn phải được kiểm tra ở Supabase.

### P1 — Độ tin cậy và tính đúng đắn

1. **Xóa khách hàng:** bản sửa xác thực user và lọc theo `rm_id`.
2. **Ghi tương tác/chuyển đổi:** bản sửa xác minh khách hàng thuộc `rm_id` của người dùng, chỉ chấp nhận kênh hợp lệ và lọc cập nhật theo chủ sở hữu.
3. **Quản trị trọng số:** bản sửa kiểm tra quyền server, giới hạn trọng số 0–100, chặn tổng bằng 0 và kiểm tra lỗi cơ bản khi gọi DB/RPC.
4. **Feedback insight:** bản sửa kiểm tra allow-list, giới hạn action hợp lệ và xử lý lỗi RPC.
5. **Dependency reproducibility:** `next`, `@supabase/ssr` và `@supabase/supabase-js` dùng `latest`; không có lockfile được track. Chưa pin phiên bản vì chưa thể chạy cài đặt/build/lint trong môi trường này.

### P2 — Tài liệu và UX

1. README cũ là README của Next.js + Supabase Starter Kit; đã thay bằng hướng dẫn theo repository.
2. `app/layout.tsx` khai báo `lang="en"` dù giao diện tiếng Việt; đã sửa thành `vi`.
3. Đăng nhập trước đây chuyển đến `/protected`; đã chuyển hướng sang `/insights` và Việt hóa nhãn chính.
4. Trang đăng ký công khai được thay bằng thông báo tài khoản được cấp riêng. Cần tắt sign-up trong Supabase Auth settings nếu không muốn tạo tài khoản mới.

## Source review xác nhận

- Có các trang `/customers`, `/insights`, `/admin/weights`.
- Code gọi các bảng/view/RPC như `customers`, `interactions`, `rm_users`, `weight_matrix`, `rm_insights`, `v_customer_scores`, `fn_activate_weight_matrix`, `fn_rescore_open_insights`, `fn_expire_insights`, `fn_generate_insights`, `fn_propose_weights`, `fn_insight_feedback`.
- Repository không chứa `supabase/migrations/` tại thời điểm kiểm tra.
- Một số đường dẫn trong tài liệu bàn giao không xuất hiện trong tree main đã kiểm tra; cần đối chiếu lại trước khi agent thao tác dựa trên chúng.

## Chưa thực hiện / chưa thể kết luận

- Chưa chạy `npm install`, `npm run lint`, `npm run build`, kiểm thử browser/mobile.
- Chưa xác minh Supabase RLS, grants, schema, RPC body, trigger, webhook, Auth sign-up setting, dữ liệu hoặc secrets.
- Chưa xác minh Vercel project/domain/environment/region, Google Sheets/Apps Script hoặc cron.
- Chưa chạy migration, sửa dữ liệu, deploy production hay thay đổi secrets.
- Chưa thể tuyên bố hết lỗ hổng bảo mật cho tới khi hoàn tất kiểm tra RLS/RPC và test staging.

## Checklist trước production

- [ ] Lấy schema + RLS policies + grants + function definitions từ đúng Supabase project; lưu migration baseline không phá hủy dữ liệu.
- [ ] Xác nhận user được phép đọc đúng hàng của mình trong `rm_users`, và user không có hồ sơ bị từ chối.
- [ ] Kiểm tra RLS cho `customers`, `interactions`, `rm_insights`, `weight_matrix`, `agent_learning_log`, `products`, views và RPC.
- [ ] Tắt public sign-up trong Supabase Auth nếu CRM là single-user.
- [ ] Pin dependency versions, tạo lockfile, chạy lint/build và xử lý lỗi.
- [ ] Kiểm thử staging với user chưa đăng nhập, user không allow-list, user không phải admin, admin, thao tác khách hàng khác chủ sở hữu, gọi trực tiếp Server Actions và RPC lỗi.
- [ ] Chỉ deploy sau checkpoint staging và backup phù hợp.
