# An Châu Marketing V3.0 — hai nhân viên và bước Telegram

## Tài khoản được phép
- Giám đốc: phonganh99@gmail.com
- Nhân viên 1: phongspotify00@gmail.com
- Nhân viên 2: hathu0374@gmail.com

## Đã có trong mã V3
- Đăng nhập Google nhận diện đúng hai nhân viên.
- Giám đốc giao việc bằng lựa chọn email người nhận, thay cho nhập tên tự do.
- Mỗi nhân viên chỉ nhìn thấy công việc và kế hoạch của mình trên giao diện V3.
- Giám đốc lọc công việc theo nhân viên; KPI sản xuất và xuất bản theo nhân viên, theo kênh, theo tuần.
- Lịch làm chung hiển thị nhân viên và giờ bắt đầu–kết thúc.
- Quy tắc Firestore mới chỉ cho nhân viên cập nhật công việc được giao cho email mình; nhân viên không được đổi người nhận.
- Việc cũ không có assigneeEmail quy về Nhân viên 1. Giám đốc có thể đổi người phụ trách trước khi có sản lượng.

## VIỆC CẦN LÀM trên Firebase trước khi kiểm thử
1. Lưu bản sao Rules hiện hành.
2. Mở tệp `firestore.rules` trên nhánh `main` của repo và sao chép **toàn bộ nội dung**, không chỉ thay email. Bản mới còn đổi cách xác thực người được giao.
3. Firebase Console → `an-chau-marketing` → Firestore Database → Rules → dán bản mới, kiểm tra dòng cuối không có ký tự thừa rồi Publish.
4. Mở `https://phonganh99.github.io/an-chau-marketing/v3.html`, tải lại, đăng nhập Giám đốc và thử giao việc lần lượt cho từng nhân viên.
5. Đăng nhập từng nhân viên trên cửa sổ riêng; kiểm tra chỉ thấy việc của mình, cập nhật trạng thái và dữ liệu Giám đốc đồng bộ.
6. Kiểm tra lịch của cả hai và KPI riêng. Cần nhớ rằng phân tách **hiển thị** khác với giới hạn **đọc** trong Firestore: các thành viên Marketing được phép đọc dữ liệu chung, chỉ quyền **ghi/sửa** công việc bị giới hạn theo người nhận.

## Telegram (chưa bật)
Kế hoạch: một Telegram Bot, nhắn riêng cho ba người.
- Nhân viên nhận việc do Giám đốc giao; được trả lời brief, kết quả duyệt.
- Giám đốc nhận câu hỏi và nội dung cần duyệt.
- Thông báo nhắc hạn, lịch và tổng hợp cần tránh gửi trùng.
- Người dùng tự mở Bot, nhấn Start, xác thực bằng mã kết nối một lần; không dựa vào Telegram username.
- Token Bot phải lưu trong máy chủ/secrets; **không** lưu trong mã JS, Firebase config trên GitHub hay gửi trong chat.
- Firebase Cloud Functions cần dự án Blaze có liên kết thanh toán. Nếu giữ Spark, phải chọn một backend ngoài Firebase để phát thông báo; GitHub Pages riêng lẻ không làm được realtime notification.
- Chưa triển khai Telegram API, webhook, liên kết chatId hoặc lịch nền. Không hiển thị trạng thái đã kết nối khi chưa có xác nhận từ máy chủ.
