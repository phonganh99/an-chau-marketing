# AN CHÂU MARKETING V3 — TELEGRAM BOT (Cloudflare Free)

## Trạng thái hiện tại
- **Đã viết mã nguồn** Cloudflare Worker, D1 migration, kết nối Google → Telegram và thông báo định kỳ.
- **Chưa triển khai Cloudflare**, vì chưa kết nối tài khoản Cloudflare, chưa có bot token, chưa tạo D1 và chưa có quyền đọc Firestore phía máy chủ.
- Website V3 đã có menu Telegram; khi chưa cấu hình `telegramWorkerUrl` sẽ hiển thị "Chưa kích hoạt".
- Không phải nâng Firebase Spark lên Blaze và không cần server riêng.

## Kiến trúc
GitHub Pages V3 → Firebase Authentication / Firestore → Cloudflare Worker (cron 5 phút, cron 09:00 giờ Việt Nam)
→ Cloudflare D1 lưu liên kết email-chat và chống gửi trùng → Telegram Bot API (tin nhắn riêng).

Dữ liệu Firestore được Worker **đọc** bằng service account có quyền Cloud Datastore Viewer,
không dùng Firebase Admin SDK và không thay đổi Firestore Rules khi chỉ phục vụ thông báo.

## 1. Tạo Telegram Bot (chỉ cần một bot)
1. Mở https://t.me/BotFather, gửi `/newbot`.
2. Chọn tên và username kết thúc bằng `bot` (ví dụ `AnChauMarketingBot`, nếu còn trống).
3. Giữ **bot token riêng tư**; không gửi vào ChatGPT, không commit GitHub, không đưa vào URL website công khai.
4. Ba tài khoản sẽ liên kết **qua mã một lần trên website**, không nhập chat ID thủ công.

## 2. Tạo Cloudflare Workers Free / D1
1. Đăng ký https://dash.cloudflare.com/ bằng gói Free.
2. Cài Node 20+ trên máy có thể chạy lệnh, mở terminal ở thư mục `telegram-worker`.
3. D1 `anchau_mkt` đã được tạo trên Cloudflare Dashboard (ID: `2763c04a-205e-4d97-a3d4-665abfc221ea`). Cài đặt CLI khi cần triển khai Worker:
   ```
   npm install
   npx wrangler login
   ```
4. `database_id` đã được cập nhật đúng vào `wrangler.toml`.
5. Chạy:
   ```
   npx wrangler d1 migrations apply anchau_mkt --remote
   ```
6. Chỉnh `BOT_USERNAME` trong `wrangler.toml` theo username bot (không có @).

Tài liệu Cloudflare: https://developers.cloudflare.com/workers/configuration/cron-triggers/
D1 Free: https://developers.cloudflare.com/d1/platform/pricing/

## 3. Tạo tài khoản đọc Firestore (Google Cloud IAM)
1. Vào https://console.cloud.google.com/iam-admin/serviceaccounts?project=an-chau-marketing
2. Tạo service account riêng, ví dụ `an-chau-telegram-reader`.
3. Chỉ cấp vai trò **Cloud Datastore Viewer** (`roles/datastore.viewer`).
   Không dùng tài khoản Owner/Editor, không dùng khóa mặc định có toàn quyền.
4. Nếu chính sách dự án cho phép, tạo một JSON key để Worker xác thực OAuth.
5. Giữ tệp JSON cục bộ, không gửi vào chat, không commit vào GitHub.
6. Nếu hệ thống chặn tạo khóa (do chính sách bảo mật), **dừng lại** và chuyển sang thiết kế ủy quyền không dùng khóa; không tìm cách tắt chính sách bảo mật.

> Cảnh báo: Khóa service account rất nhạy cảm. Đặt trong Cloudflare Secrets, chỉ tạo quyền đọc tối thiểu và xoay vòng/revoke nếu nghi ngờ lộ.

Firebase Firestore REST với OAuth2: https://firebase.google.com/docs/firestore/use-rest-api

## 4. Thêm 4 Secrets Cloudflare (không phải vars công khai)
Tại thư mục `telegram-worker`, lần lượt chạy và nhập giá trị trong prompt riêng của Wrangler:

```
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put PAIRING_PEPPER
npx wrangler secret put GCP_SERVICE_ACCOUNT_JSON
```

- `BOT_TOKEN`: token do BotFather cấp.
- `TELEGRAM_WEBHOOK_SECRET`: chuỗi ngẫu nhiên dài 32–64 ký tự `[A-Za-z0-9_-]`.
- `PAIRING_PEPPER`: chuỗi ngẫu nhiên dài tối thiểu 32 ký tự, **khác** webhook secret.
- `GCP_SERVICE_ACCOUNT_JSON`: nội dung nguyên vẹn của JSON key service account, nhập bằng cách dán vào input multiline của công cụ hoặc nhập từ tệp cục bộ qua stdin. Không đưa lên GitHub.
- Không lưu `.dev.vars`, `.env`, `.pem`, `.json` credential trong repository.

## 5. Deploy Worker
1. Chạy `npx wrangler deploy`.
2. Ghi lại URL dạng `https://an-chau-telegram.<account>.workers.dev`.
3. Thay `PUBLIC_WORKER_URL` trong `wrangler.toml` bằng đúng URL đó, chạy deploy lại.
4. Mở URL thêm `/health`: phải có `{"ok":true,"service":"an-chau-telegram",...}`.
5. Cập nhật `telegramWorkerUrl` trong `firebase-config.js` trên GitHub bằng **URL Worker công khai** (không chứa token). V3 sẽ hiện nút kết nối.

## 6. Kích hoạt Telegram cho 3 người
1. Giám đốc (`phonganh99@gmail.com`) đăng nhập V3 → **Telegram** → nhấn **Kích hoạt webhook (quản lý)**.
2. Giám đốc nhấn **Lấy liên kết kết nối**, mở link Telegram, nhấn **Start**, quay lại V3 → **Làm mới trạng thái**.
3. Hai nhân viên (`phongspotify00@gmail.com`, `hathu0374@gmail.com`) đăng nhập tài khoản riêng, làm tương tự bước 2.
4. V3 báo **Đã liên kết** cho từng tài khoản tương ứng.
5. Nếu ngừng dùng, chọn **Ngắt liên kết** trên V3 hoặc gõ `/stop` trong Telegram.

Mã kết nối được băm và hết hạn sau 10 phút, chỉ được dùng một lần. Không chia sẻ link mã kết nối.

## 7. Kiểm thử gửi tin
- Đợi lần Cron 5 phút đầu tiên chạy để xác lập mốc bắt đầu; lịch cũ trước mốc đó **không bị gửi dồn**.
- Tạo một việc **mới** từ tài khoản quản lý, giao cho Hà Thu. Chỉ Hà Thu nhận Telegram.
- Tạo việc mới cho Nhân viên 1; chỉ Nhân viên 1 nhận.
- Nhân viên hỏi lại → quản lý nhận tin; quản lý phản hồi → đúng nhân viên nhận.
- Gửi duyệt → quản lý nhận; yêu cầu sửa / duyệt → đúng nhân viên.
- Nhắc deadline: Cron hằng ngày 02:00 UTC (= 09:00 Việt Nam), gửi tối đa một lần mỗi giai đoạn ngày mai/hôm nay/quá hạn. Lỗi gửi được lưu D1 để thử lại, có giới hạn số lần.
- Các thao tác chốt KPI, duyệt và nhập link vẫn làm trên website, **không** qua Telegram.

## Giới hạn và vận hành
- Worker Cron 5 phút có thể bị trễ; đây không phải push ngay lập tức.
- Worker Free có hạn mức request/subrequest và CPU; quy mô ba người phù hợp, không cam kết mọi tình huống đều miễn phí mãi.
- Cloudflare D1 có giới hạn sử dụng Free; khi vượt hạn mức, thông báo có thể ngừng chứ không tự chuyển gói.
- Chưa có dashboard lịch sử gửi tin nâng cao; D1 lưu receipts để tránh gửi trùng.
- Nếu không liên kết Telegram trước khi sự kiện diễn ra, sẽ không tự gửi lại các sự kiện đã qua.
- D1 chỉ lưu email/chat ID liên kết, hash mã và receipt; Worker có quyền đọc dữ liệu công việc theo IAM, vì vậy cần bảo vệ service account.
