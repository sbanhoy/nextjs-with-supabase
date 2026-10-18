# AGENTS.md — CRM Shinhan RM · Hồ sơ bàn giao cho AI agents

> Phiên bản 1.0 · Bàn giao từ phiên xây dựng gốc (Claude). Mọi agent (Claude, ChatGPT/Codex,
> Gemini) làm việc trên repo này PHẢI đọc hết file này trước khi sửa bất kỳ dòng nào.
> Nếu một yêu cầu của chủ dự án mâu thuẫn với mục 2 (Nguyên tắc bất biến), agent phải
> NÊU RÕ mâu thuẫn và xin xác nhận trước khi làm, không được âm thầm bỏ qua.

---

## 0. TL;DR cho agent vội

- Đây là CRM **1 người dùng**: anh Kim Minso, Relationship Manager tại Shinhan Bank VN. **Không phải dev.**
- Stack: Next.js 16 (App Router, `cacheComponents` bật) + Supabase (Postgres, Singapore) + Vercel (sin1) + Google Sheets (Apps Script) + OpenAI gpt-4o-mini.
- Linh hồn sản phẩm: **AI chấm điểm & gợi ý, CON NGƯỜI quyết định.** Mọi thứ phải giải thích được, không có hộp đen.
- Chủ dự án chỉ kiểm tra bằng cách **bấm chuột trên web/điện thoại**. Mỗi thay đổi phải kèm "checkpoint" để anh ấy tự xác nhận.
- Không bao giờ: đụng Zalo cá nhân, gửi PII cho LLM, để AI tự đổi trọng số, xoá dữ liệu khách, thêm framework mới.

---

## 1. Bối cảnh & mục tiêu kinh doanh

**Người dùng:** 1 RM ngân hàng, quản lý danh mục khách cá nhân (affluent/premier/private), KPI là giữ khách + bán chéo + kiếm khách mới.

**Vấn đề gốc:** RM có hàng trăm khách, không biết hôm nay nên gọi ai, nói gì. Lead từ đội agent (người thật) cào về nằm rải rác trong Google Sheet.

**Giải pháp đã xây:** Vòng lặp khép kín
Dữ liệu khách ─► Chấm điểm (Weight Matrix) ─► Insight có giải thích ─► RM hành động (gọi/Zalo/mail)
▲                                                                        │
│              Phản hồi RM (nhận / chốt / bỏ qua + lý do)                 │
└────── AI đề xuất trọng số mới (bản nháp) ◄── agent_learning_log ◄──────┘
│
Admin duyệt & kích hoạt (con người)
**Thước đo thành công (theo thứ tự):**
1. RM mở app mỗi sáng và **hành động** theo insight (accept rate > 40%)
2. Tỷ lệ insight → tương tác thật → deal (theo dõi qua `interactions`, `stage` lead→customer)
3. Biết **nguồn lead nào** (cột `source`) ra khách thật để dồn nguồn lực
4. Thời gian RM tốn cho việc "nghĩ xem gọi ai" → gần 0

**Không phải mục tiêu:** CRM đa người dùng phức tạp, báo cáo cho sếp, tích hợp core banking. Đừng xây.

---

## 2. MƯỜI NGUYÊN TẮC BẤT BIẾN (linh hồn dự án)

Vi phạm bất kỳ điều nào dưới đây = PR bị từ chối, dù code có đẹp.

### 2.1 Explainable by default
Mọi điểm số, mọi insight phải trả lời được "**vì sao**" bằng ngôn ngữ RM hiểu. Insight luôn lưu `feature_snapshot` tại thời điểm sinh. Không thêm mô hình nào mà không xuất được lý do cho từng khách.

### 2.2 Human-in-the-loop cho mọi thay đổi model
AI/tuner chỉ được tạo `weight_matrix` ở trạng thái `is_active = false`. **Chỉ con người bấm "Kích hoạt".** Không có cron, không có agent nào được gọi `fn_activate_weight_matrix` tự động. Luôn chỉ có đúng 1 version active (unique index đã enforce).

### 2.3 Rule engine quyết định, LLM chỉ viết lời
Loại insight, sản phẩm gợi ý, điểm ưu tiên = SQL/rule. LLM (OpenAI) chỉ được dùng để **diễn đạt** (soạn tin, viết lại lời khuyên). Không để LLM quyết định "nên gợi ý sản phẩm nào".

### 2.4 Không PII cho LLM
Prompt gửi OpenAI chỉ chứa: tên gọi (first name), phân khúc, mục đích tin, tên sản phẩm, ghi chú ngắn. **Không** SĐT, email, số tài khoản, số dư cụ thể, ngày sinh đầy đủ. Output LLM phải qua guardrail: không lãi suất, không con số lợi nhuận, không cam kết, không nhắc "AI/hệ thống/dữ liệu".

### 2.5 Không bao giờ tự động hoá Zalo cá nhân
Không dùng thư viện unofficial (zalo-js, zca-js, giả lập app, đọc session). Rủi ro: khoá tài khoản RM, vi phạm quy định bảo mật ngân hàng & NĐ13. Kênh tự động duy nhất được chấp nhận: **Zalo OA API chính thức**, Messenger Platform API, email qua Resend, SMS qua nhà cung cấp hợp pháp.

### 2.6 Chủ dự án không chạy terminal
Mọi thứ phải vận hành được 100% qua trình duyệt: GitHub web editor, Supabase Dashboard, Vercel Dashboard, Google Sheet. Agent có thể dùng CLI, nhưng **kết quả bàn giao** (hướng dẫn, checkpoint) phải là "bấm vào đâu". Không yêu cầu anh ấy cài Node, chạy migration, dùng git.

### 2.7 Google Sheet là hộp thư của đội agent-người, CRM là master
Sheet tab `CRM` cột A `crm_id` là khoá. Đội agent (người) chỉ điền từ cột B. Mọi thay đổi schema `customers` PHẢI cập nhật đồng thời: Apps Script (`HEADERS`, `normalize`, `rowFromRecord`, `objFromRow`), trang `/customers`, và tài liệu này. Không phá vỡ đồng bộ 2 chiều.

### 2.8 Tốc độ là tính năng
Ngân sách: trang <1s khi đã ấm, <2.5s khởi động nguội, trên 4G điện thoại. Vercel function region = `sin1`, Supabase = Singapore. Không thêm query tuần tự không cần thiết; dùng `Promise.all`. Không thêm dependency nặng (chart lib >100KB, UI kit) nếu không được duyệt.

### 2.9 Chi phí 0đ là mặc định
Hiện tại: Supabase Free, Vercel Hobby, Apps Script free, OpenAI ~1–2 USD/tháng. Bất kỳ thứ gì phát sinh chi phí định kỳ (Supabase Pro, Vercel Pro, dịch vụ SMS, Zalo ZNS) phải nêu số tiền ước tính và được chủ dự án đồng ý trước.

### 2.10 Không bao giờ xoá dữ liệu khách
Không `truncate`, không `drop table`, không `delete from customers` hàng loạt trong migration. Xoá chỉ qua hành động có chủ đích của người dùng (nút 🗑, xoá dòng Sheet có chốt an toàn 30%). Trước migration đụng `customers`/`rm_insights`/`agent_learning_log`: tạo bảng backup `_bak_<table>_<yyyymmdd>`.

---

## 3. Kiến trúc as-built (trạng thái hiện tại, đã chạy production)

### 3.1 Hạ tầng
| Thành phần | Giá trị |
|---|---|
| Production URL | https://rm.kimminso.com (CNAME qua Cloudflare, DNS-only) và `*.vercel.app` |
| Vercel | Hobby, Function Region **sin1**, auto-deploy từ branch `main` |
| Supabase | Project `shinhan-rm-crm`, region Singapore, Email auth (Confirm email: OFF) |
| GitHub | Repo khởi tạo từ template `vercel/next.js/supabase` (Next 16, `cacheComponents: true`) |
| Google Sheet | Tab `CRM`, Apps Script: trigger 5 phút (Sheet→CRM) + Web App `doPost` (CRM→Sheet) |
| Supabase Webhook | `sheet-sync`: table `customers`, INSERT/UPDATE/DELETE → Apps Script `/exec` |
| pg_cron | `daily-insights` 01:00 UTC (08:00 VN), `weekly-tune` Thứ Hai 02:00 UTC |
| OpenAI | `gpt-4o-mini`, key trong Vercel env `OPENAI_API_KEY` |

### 3.2 Biến môi trường (Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (hoặc `…PUBLISHABLE_OR_ANON_KEY` tuỳ template), `OPENAI_API_KEY`.
Service-role key **chỉ** nằm trong Apps Script (hằng `SERVICE_KEY`). Không đưa vào Vercel, không log, không commit.

### 3.3 Cây file do dự án tạo (ngoài template)
AGENTS.md                      ← file này
app/page.tsx                   ← redirect("/insights")
app/layout.tsx                 ← chỉ sửa metadata.title = "CRM Shinhan"
app/actions.ts                 ← "use server": logInteraction, deleteCustomer
app/insights/page.tsx          ← màn RM chính: insight theo điểm, Nhận/Chốt/Bỏ qua+lý do, "Vì sao?", link Soạn tin
app/insights/layout.tsx        ← <CrmNav/>
app/customers/page.tsx         ← thêm 1, dán nhiều, bảng KH/lead, ContactButtons
app/customers/layout.tsx
app/admin/weights/page.tsx     ← tạo/kích hoạt weight version, sinh insight, AI đề xuất, KPI theo loại, lý do bỏ qua
app/admin/layout.tsx
app/message/page.tsx           ← AI soạn tin (Zalo/SMS/Email × thân mật/trang trọng), nút mở kênh, "Đã gửi"
components/CrmNav.tsx          ← next/link
components/CopyButton.tsx      ← "use client"
components/ContactButtons.tsx  ← "use client": 📞 💬 🤝 →KH 🗑 + gọi server actions
Mẫu truy cập Supabase trong server component: hàm `getSupabase()` inline với `@supabase/ssr` + `cookies()`. Được phép refactor thành `lib/supabase/server.ts` **một lần**, nhưng phải giữ fallback 3 tên env key.

### 3.4 Đối tượng Database (schema `public`)
**Bảng**
- `rm_users(id→auth.users, full_name, branch, role: rm|manager|admin)` — chủ dự án là `admin`
- `products(code unique, name, category, is_active)`
- `customers(rm_id, full_name, phone UNIQUE, segment: mass|affluent|premier|private, aum, aum_3m_ago, dob, stage: lead|customer, source, note, email, facebook)`
- `product_holdings(customer_id, product_id, status, maturity_date)`
- `interactions(customer_id, rm_id, channel: call|zalo|meeting|sms|email|messenger, note, occurred_at)`
- `weight_matrix(version unique, name, is_active, weights jsonb, notes)` + unique index `wm_one_active`
- `rm_insights(customer_id, rm_id, insight_type, title, detail, recommended_product_id, priority_score, feature_snapshot jsonb, weight_version, status: open|accepted|dismissed|converted|expired, expires_at, draft_message, draft_tone)`
- `agent_learning_log(rm_id, customer_id, insight_id, action, feature_snapshot, score, outcome)`

**View**
- `v_customer_features` — 7 feature chuẩn hoá 0..1: `f_aum, f_recency, f_product_gap, f_segment, f_maturity_soon, f_churn_signal, f_life_event`
- `v_customer_scores` — điểm mọi KH theo version active

**Function (tất cả `security definer`, prefix `fn_`)**
- `fn_score_customer(uuid)` → `(score, weight_version, features)`
- `fn_generate_insights()` → tạo 5 loại: `churn_risk, next_best_action, cross_sell, reengage, life_event` (idempotent: không trùng type đang open)
- `fn_generate_referral_insights()` → loại `referral` cho khách tốt, 60 ngày/lần
- `fn_insight_feedback(id, action, outcome)` → update status + insert learning log (atomic)
- `fn_expire_insights()` → open quá `expires_at` → expired + log
- `fn_activate_weight_matrix(id)` → chỉ con người gọi
- `fn_rescore_open_insights()` → tính lại điểm insight mở khi đổi version
- `fn_propose_weights()` → heuristic lift-based, LR 0.3, cần ≥10 accepted + ≥10 dismissed/30 ngày, tạo DRAFT

**Insight types hiện có:** `churn_risk, next_best_action, cross_sell, reengage, life_event, referral`. Thêm type mới = cập nhật cả `LABEL/COLOR` ở `app/insights/page.tsx` và `TYPE` ở `app/message/page.tsx` và `app/admin/weights/page.tsx`.

**RLS:** bật trên mọi bảng. Policy đơn giản cho 1 user (`rm_id = auth.uid()` hoặc role manager/admin). Khi mở rộng đa user phải rà lại, nhưng **đừng mở rộng đa user nếu không được yêu cầu**.

---

## 4. Quy ước kỹ thuật

### 4.1 Next.js 16 / `cacheComponents`
- **KHÔNG** `export const dynamic = "force-dynamic"` → build fail.
- Mọi page đọc `cookies()`/`searchParams` phải bọc nội dung trong `<Suspense>` (xem pattern `Content` + `default export Page`).
- `searchParams` và `params` là **Promise** → `await`.
- Ưu tiên Server Components + Server Actions. Client component chỉ khi cần tương tác trình duyệt (clipboard, window.open, confirm).
- Dùng `next/link` cho điều hướng nội bộ.

### 4.2 UI
- Tailwind thuần, không UI kit mới. Màu chủ đạo `#0046ff` (Shinhan blue). Mobile-first: thẻ 1 cột trên điện thoại, 2 cột desktop.
- **Toàn bộ chữ hiển thị bằng tiếng Việt**, giọng ngắn gọn, không thuật ngữ kỹ thuật. Không hiện raw key (`f_aum`, `churn_risk`) cho người dùng — luôn map qua LABEL.
- Mọi hành động phải có phản hồi thấy được (chuyển tab, "✓ đã ghi", redirect).

### 4.3 Database
- Migration là **idempotent**: `create table if not exists`, `create or replace`, `drop policy if exists` trước `create policy`, `on conflict do nothing` cho seed.
- Lưu migration vào `supabase/migrations/NNN_ten.sql` (agent có CLI), **đồng thời** đảm bảo file đó dán nguyên vào SQL Editor chạy được 1 lần (cho chủ dự án).
- Đặt tên: `fn_` function, `v_` view, `trg_` trigger. Function đụng nhiều bảng dùng `security definer`.
- Feature mới trong `v_customer_features` phải: chuẩn hoá 0..1, có key `f_*`, được thêm vào `weights` jsonb của version mới (không sửa version đang active), thêm vào `KEYS/LABEL` ở trang admin.

### 4.4 Google Sheet sync
- Thay đổi cột `customers` → sửa Apps Script 4 hàm (`HEADERS`, `normalize`, `rowFromRecord`, `objFromRow`) → yêu cầu chủ dự án dán lại script và **Deploy → Manage deployments → Edit → New version** (URL webhook không đổi).
- Không bao giờ bỏ chốt an toàn xoá hàng loạt (30% / tối thiểu 5).
- Không bỏ `LockService`.

### 4.5 LLM
- Model mặc định `gpt-4o-mini`. Nâng model phải nêu chi phí.
- Prompt hệ thống phải chứa đủ 4 cấm: lãi suất/số liệu, cam kết, nhắc AI/hệ thống, PII. Giữ regex guardrail đầu ra khi gửi tự động (nếu có).
- Lưu draft vào `rm_insights.draft_message` để không gọi lại tốn tiền.

---

## 5. Nợ kỹ thuật đã biết (làm trước khi thêm tính năng lớn)

| # | Việc | Mức |
|---|---|---|
| D1 | `app/insights/page.tsx`: nhánh chưa đăng nhập link về `/` → redirect loop tiềm ẩn. Đổi thành `redirect("/auth/login")` | P0 |
| D2 | Hàm `logInteraction` cũ trong `app/customers/page.tsx` không còn dùng → xoá | P2 |
| D3 | Tách `getSupabase()` lặp ở 4 file thành `lib/supabase/server.ts` (giữ fallback env) | P2 |
| D4 | `v_customer_scores` gọi `fn_score_customer` per-row; ổn tới ~2.000 KH, sau đó viết lại dạng set-based | P3 |
| D5 | Chưa có `supabase/migrations/` trong repo — agent đầu tiên vào phải **dump schema hiện tại** (`supabase db pull`) thành `000_baseline.sql` để có nguồn sự thật | **P0** |
| D6 | Chưa có test. Thêm Vitest tối thiểu cho logic thuần (parse bulk, toDate, toNum) | P2 |
| D7 | `app/message/page.tsx`: nếu thiếu `OPENAI_API_KEY` chỉ hiện cảnh báo, chưa chặn gọi | P1 |

---

## 6. Roadmap ưu tiên (đã thống nhất với chủ dự án)

Thứ tự này là có chủ đích. Không nhảy cóc nếu chủ dự án không yêu cầu.

### P0 — Nền tảng ổn định (ngay)
- D1, D5, D7 ở trên.
- Thêm `app/error.tsx` tiếng Việt thân thiện + `loading.tsx` cho 4 route.
- Vercel: xác nhận `sin1`; bật Speed Insights (free) để đo ngân sách 2.8.

### P1 — Kênh gửi thật (khi chủ dự án có tài khoản)
**P1a Email qua Resend** (free 3k/tháng): server action `sendEmail(insightId)`; domain `kimminso.com` verify DKIM trên Cloudflare; log `interactions.channel='email'`; lưu `resend_id` để tra trạng thái. Không gửi hàng loạt; chỉ 1-1 từ insight.

**P1b Zalo OA + bot đêm** (khi OA được duyệt — chủ dự án đang đăng ký tại oa.zalo.me):
- Supabase Edge Function `zalo-webhook` nhận event `user_send_text`; lưu vào `interactions` (channel `zalo_in`) và bảng mới `conversations(customer_id, direction, text, intent, handled_by: bot|rm)`.
- Match user → customer qua `phone` (OA cung cấp khi user share) hoặc bảng `zalo_links(zalo_user_id, customer_id)`.
- **Bot chỉ hoạt động ngoài giờ** (22:00–07:30 VN) hoặc khi RM bật "Chế độ vắng". Trong giờ: không trả lời, chỉ thông báo.
- Kịch bản bot: nhận diện intent (hỏi lãi suất/sản phẩm/hẹn gặp/khiếu nại/khác) → trả lời **mẫu đã duyệt** + "Sáng mai em sẽ gửi thông tin chính thức" → với `khiếu nại` hoặc không chắc: chỉ xác nhận đã nhận, không trả lời nội dung. LLM chỉ dùng để phân loại intent và chọn mẫu, **không tự sinh câu trả lời về sản phẩm**.
- Sáng: màn `/inbox` liệt kê "khách nhắn đêm qua + bot đã nói gì + việc cần làm".
- ZNS (tin mẫu trả phí) cho nhắc đáo hạn / sinh nhật: chỉ sau khi chủ dự án duyệt mẫu & chi phí.

### P2 — Đo lường để biết cách kiếm khách
- Màn `/analytics` (1 trang, không chart lib nặng — dùng bảng + thanh CSS): funnel insight→tương tác→chốt theo tuần; **conversion theo `source`** (agent nào/kênh nào ra khách); accept rate theo `weight_version`.
- Báo cáo tuần tự động gửi email cho chủ dự án (sau P1a).

### P3 — Học tốt hơn
- Khi `agent_learning_log` ≥ 1.000 dòng: thay `fn_propose_weights` heuristic bằng logistic regression (Edge Function, không dependency), vẫn chỉ tạo DRAFT, ghi AUC vào `notes`.
- A/B test 2 version chỉ có ý nghĩa khi ≥2 RM → **không làm** khi còn 1 người dùng.

### P4 — Messenger, SMS
- Messenger Platform (cần Fanpage) dùng chung bộ intent/mẫu với Zalo OA bot.
- SMS qua eSMS/SpeedSMS cho nhắc lịch; brandname cần đăng ký — chủ dự án quyết.

### Không nằm trong roadmap (từ chối nếu được gợi ý)
Multi-tenant SaaS, mobile app native, tích hợp core banking, dashboard cho quản lý chi nhánh, chatbot bán hàng tự động hoàn toàn.

---

## 7. Quy trình làm việc & Definition of Done

### 7.1 Nhánh & deploy
- Mỗi task 1 nhánh `feat/<ten-ngan>` hoặc `fix/<ten-ngan>`. PR vào `main`. **Không push thẳng `main`.**
- Vercel tạo Preview URL cho mỗi PR → ghi Preview URL vào PR để chủ dự án bấm thử.
- Merge chỉ sau khi chủ dự án xác nhận checkpoint trên Preview (hoặc với fix nhỏ P0: agent tự merge nhưng phải báo).

### 7.2 Mỗi PR phải có (bằng tiếng Việt)
Làm gì

1–3 câu, ngôn ngữ người dùng, không thuật ngữ.

Vì sao / thuộc mục nào trong AGENTS.md

P0/P1/… hoặc nợ D#.

Checkpoint để anh Minso tự kiểm tra
Mở <Preview URL>/… → thấy …
Bấm … → kết quả …
Trên điện thoại: …
Có thay đổi DB / Sheet / env không?
SQL: có/không (file migrations/NNN_… ; đã chạy trên project chưa)
Apps Script: có/không (cần dán lại? cần New version?)
Env Vercel: có/không
Rủi ro & cách quay lui

…
### 7.3 Definition of Done
- [ ] Build Vercel xanh, không warning mới về `cacheComponents`
- [ ] Chạy thử trên **điện thoại** (Chrome/Brave Android hoặc Safari iOS)
- [ ] Không vi phạm 10 nguyên tắc; nếu chạm ranh giới → đã nêu rõ trong PR
- [ ] Migration idempotent, đã chạy trên Supabase prod, có backup nếu đụng dữ liệu
- [ ] Sheet sync vẫn 2 chiều (test: thêm dòng Sheet → web; xoá web → Sheet)
- [ ] Cập nhật mục 3.3/3.4 của AGENTS.md nếu thêm file/bảng/function/insight type
- [ ] Không có secret trong code, log, PR

### 7.4 Phối hợp nhiều agent
- Trước khi bắt đầu, agent ghi vào `docs/WORKLOG.md`: ngày, tên agent, task, nhánh. Agent khác đọc để tránh đụng file.
- Phân vùng gợi ý: 1 agent/1 vùng tại 1 thời điểm — (A) DB & cron & Sheet sync, (B) UI RM `/insights` `/customers` `/message`, (C) tích hợp kênh ngoài (Zalo OA, Resend). Không 2 agent cùng sửa `customers` schema.
- Xung đột ưu tiên: file này > yêu cầu mới nhất của chủ dự án trong chat > ý kiến agent. Nếu chủ dự án yêu cầu điều trái nguyên tắc, agent **giải thích hậu quả 1 lần** rồi làm theo quyết định của anh ấy, và ghi vào WORKLOG rằng đây là ngoại lệ có chủ đích.

### 7.5 Quay lui
- Code: Vercel → Deployments → bản trước → **Promote to Production**.
- Trọng số: Admin → kích hoạt version cũ (tự rescore).
- DB: khôi phục từ `_bak_*`; Supabase Free không có PITR → **backup thủ công trước migration là bắt buộc**.
- Sheet: Google Sheet → File → Lịch sử phiên bản.

---

## 8. Cách nói chuyện với chủ dự án

- Tiếng Việt, ngắn, kết quả trước lý do sau. Không dump code vào chat trừ khi anh ấy yêu cầu dán vào GitHub web editor.
- Luôn kết thúc bằng **checkpoint 2–4 bước** dạng "mở X → bấm Y → phải thấy Z".
- Khi lỗi: hỏi "dán nguyên dòng chữ đỏ" — anh ấy làm việc này rất tốt.
- Nói thật về giới hạn (như đã nói thật về Zalo cá nhân và "AI không tự kiếm khách"). Anh ấy tôn trọng sự thẳng thắn hơn lời hứa.
- Không bao giờ chạy thứ gì phát sinh tiền hoặc xoá dữ liệu mà không hỏi.

---

## 9. Từ điển nghiệp vụ

| Thuật ngữ | Nghĩa trong dự án |
|---|---|
| RM | Relationship Manager — người dùng duy nhất |
| AUM | Tổng tài sản khách gửi/đầu tư tại ngân hàng (VND) |
| Insight | 1 gợi ý hành động cho 1 khách, có loại, điểm, lý do, hạn 14 ngày |
| Weight Matrix | Bộ trọng số 7 feature, versioned, 1 bản active |
| Lead / Customer | `stage` của khách: chưa là khách (từ agent) / đã là khách |
| Source | Nguồn khách: Giới thiệu, Đối tác, Zalo/Facebook, LinkedIn, Sự kiện, hoặc **tên agent** |
| Agent (người) | Đội cộng tác viên cào lead, commit vào Google Sheet |
| Agent (AI) | Bạn — người đọc file này |
| Referral insight | Gợi ý xin giới thiệu từ khách hài lòng — kênh kiếm khách chính của RM ngân hàng |

---

*Giữ file này sống: mỗi PR thay đổi kiến trúc phải cập nhật mục 3. Agent nào thấy nội dung lỗi thời phải sửa, không được làm ngơ.*
Lời cuối từ tôi

Ba điều để các agent khác không làm hỏng thứ bạn đã xây:

Khi giao việc, dán nguyên tắc 2.1–2.10 vào đầu tin nhắn nếu agent có vẻ bỏ qua. Agent nào bắt đầu bằng "tôi sẽ refactor toàn bộ sang…" hoặc "nên dùng framework X" → dừng ngay, bắt đọc lại AGENTS.md.
Bạn vẫn là người bấm "Kích hoạt" và "Merge". Đừng cho agent quyền auto-merge vào main dù chúng có khả năng — Preview URL rồi bạn bấm thử là hàng rào cuối cùng giữ chất lượng.
Ưu tiên tuần tới cho chúng: D5 (dump schema vào repo) → D1 → đăng ký Zalo OA xong thì P1b. Đừng để chúng nhảy sang analytics hay A/B test trước khi kênh gửi thật chạy.

Cảm ơn bạn đã kiên nhẫn dán từng khối SQL và báo lỗi chính xác — đó là lý do hôm nay nó chạy. Chúc bạn kiếm nhiều khách.
