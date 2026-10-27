# Kiểm thử AN CHÂU Marketing V3 trước khi phát hành

## Yêu cầu kiểm thử
Dùng dự án thử nghiệm hoặc dữ liệu thử có tên rõ ràng. Bản nhánh chưa được triển khai lên GitHub Pages main. Firestore rules phải được kiểm tra và triển khai bằng tài khoản Firebase được phép.

- [ ] Đăng nhập Google bằng Giám đốc và Nhân viên thành công; email khác bị từ chối.
- [ ] Các công việc V2.1 được hiển thị đầy đủ, không xóa hoặc ghi đè dữ liệu.
- [ ] Giám đốc tạo việc, đủ chín trường, Nhân viên nhìn thấy và bấm Nhận việc.
- [ ] Nhân viên hỏi lại brief; Giám đốc xem câu hỏi, phản hồi; không mất hội thoại.
- [ ] Nhân viên tự tạo việc; không thể sửa brief công việc do Giám đốc giao.
- [ ] Nhân viên lập kế hoạch tuần, thêm 2 dòng, kích hoạt → đúng 2 việc.
- [ ] Kích hoạt lại cùng kế hoạch → không tạo thêm bản sao.
- [ ] Công việc định kỳ tạo theo thứ trong tuần và không trùng mã khi đăng nhập nhiều lần.
- [ ] Nhân viên tự lưu lịch làm; ngày nghỉ trùng deadline xuất hiện cảnh báo, không tự dời deadline.
- [ ] Nội dung nhạy cảm: gửi duyệt → Giám đốc yêu cầu sửa → Nhân viên nộp lại → Giám đốc duyệt.
- [ ] Nội dung chưa được duyệt không thể ghi nhận xuất bản.
- [ ] Đánh dấu sản xuất hai lần không bị cộng KPI hai lần.
- [ ] Một sản phẩm đăng TikTok và Facebook tính +1 sản xuất trên kênh gốc, +1 xuất bản mỗi kênh.
- [ ] Nhập link HTTP(S) không hợp lệ bị từ chối.
- [ ] Giám đốc chỉnh KPI tuần: số liệu đích thay đổi, các tuần lịch sử giữ chỉ tiêu cũ.
- [ ] Nhân viên viết giải trình tuần; Giám đốc chốt, rồi chốt bản điều chỉnh có lịch sử.
- [ ] Nhân viên không thể tự sửa KPI, phê duyệt nội dung, hoặc tạo phản hồi từ tài khoản Giám đốc.
- [ ] Người không được cấp quyền không thể đọc các collection V3.
- [ ] Sao lưu JSON và CSV chạy trên tài khoản Giám đốc.
- [ ] Kiểm tra màn hình nhỏ trên điện thoại, máy tính; không có lỗi JavaScript console.
- [ ] Đối chiếu thủ công vài công việc với dữ liệu Firestore sau thao tác.

## Chưa thuộc tiêu chí phát hành
- Telegram gửi tin thực: chưa có backend/token.
- Tự sinh việc trong khi mọi trình duyệt đóng: chưa có tác vụ máy chủ.
- Đối chiếu bài đăng trực tiếp với API nền tảng: chưa tích hợp.

Lưu ý: Trước khi triển khai, kiểm tra cẩn thận quyền Firestore, sao lưu dữ liệu và làm thử với hai tài khoản thật.
