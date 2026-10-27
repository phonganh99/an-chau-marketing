# AN CHÂU Marketing V3.0 — nâng cấp an toàn

Trạng thái: **đã viết mã trên nhánh `upgrade/marketing-v3`; chưa triển khai Firebase Rules hoặc kích hoạt trên trang GitHub Pages chính thức.**

## Giữ nguyên dữ liệu V2
- V2.1 nằm nguyên trên nhánh `main` cho đến khi chuyển phiên bản.
- Bản V2.1 cũng được lưu tại `legacy-v2.html` trong nhánh nâng cấp để có đường lui sau khi phát hành.
- Mô-đun `marketingTasks` dùng chung dữ liệu Firestore cũ. Không có bước xóa hay chuyển dữ liệu hàng loạt.
- `firebase-config.js` và hai tài khoản Google được cấp phép không thay đổi.

## Chức năng đã có mã nguồn
- Dashboard riêng Giám đốc và Nhân viên; danh sách việc, câu hỏi chờ trả lời, hàng chờ duyệt.
- Giám đốc giao việc theo chín trường; nhân viên tự tạo việc, nhận việc hoặc hỏi lại brief.
- Sản xuất nội dung và ghi nhận lượt đăng độc lập; một nội dung ghi nhận một sản phẩm, được đăng nhiều kênh mà không tính lặp trong cùng kênh.
- Phân luồng duyệt nội dung có điều kiện dựa trên từ khóa nhạy cảm và quyền Giám đốc yêu cầu duyệt thêm; không có thêm lượt nghiệm thu KPI.
- Nhân viên tạo và kích hoạt kế hoạch tuần/tháng/chiến dịch/định kỳ; mã công việc từ kế hoạch có tính xác định để tránh tạo trùng.
- Lịch Marketing 3 lớp: lịch làm việc tự đăng ký, deadline, ngày đăng; cảnh báo khi nghỉ trùng deadline.
- Giám đốc đặt KPI tối thiểu theo tuần, theo TikTok/Facebook/Website và sản xuất/xuất bản; nhân viên được ghi giải trình; Giám đốc chốt báo cáo, lưu nhiều phiên bản.
- Nhật ký sự kiện, đối thoại trong từng công việc và tính năng sao lưu JSON/CSV cho Giám đốc.

## Cần thực hiện **trước** khi hợp nhất nhánh vào main
1. **Sao lưu Firestore**, sau đó đăng nhập [Firebase Console](https://console.firebase.google.com/) → dự án `an-chau-marketing` → Firestore Database → Rules.
2. Xem và kiểm tra toàn bộ tệp `firestore.rules` ở nhánh nâng cấp; triển khai quy tắc mới vào Firestore bằng Firebase Console hoặc CLI tài khoản được cấp quyền.
3. Kiểm thử đăng nhập bằng đúng hai tài khoản: `phonganh99@gmail.com` (Giám đốc), `duhocanchau@gmail.com` (Nhân viên). Thử quyền tạo và sửa, các luồng duyệt và KPI; kiểm tra người lạ không được đọc dữ liệu.
4. Thực hiện checklist ở `QA-V3.md`. Sau khi đạt, mới hợp nhất PR vào `main`. GitHub Pages đang phát hành từ `main`.
5. Nếu cần quay lui giao diện, khôi phục `legacy-v2.html` thành `index.html`. Dữ liệu V3 đã nhập không tự bị xóa.

## Những giới hạn chưa được kích hoạt
- **Telegram Bot:** V3 có nhật ký sự kiện nhưng **chưa có dịch vụ gửi tin Telegram thực tế**. Cần Bot Token và một backend bảo mật để gửi riêng cho từng người; tuyệt đối không đưa token vào mã GitHub Pages.
- **Tác vụ lịch chạy khi không ai mở ứng dụng:** Công việc định kỳ hiện sinh khi có người đăng nhập/mở ứng dụng và trong phiên đang mở. Để tạo việc lúc không ai trực tuyến, cần lịch chạy phía máy chủ.
- **Tự động xác minh link đã đăng:** KPI xuất bản đang dựa vào lời xác nhận và link do nhân viên nhập; chưa tích hợp API TikTok/Meta.
- Các bản ghi V2 cũ không có thời điểm sản xuất / xuất bản riêng; chúng được bảo toàn, nhưng không tự suy diễn thành KPI sản xuất V3.
- Bộ lọc nội dung nhạy cảm theo từ khóa là cơ chế kiểm soát ban đầu, không thay thế rà soát của con người với các thông tin tuyển sinh/visa/học phí.

## Tệp chính
- `index.html`: giao diện V3.
- `v3.css`: giao diện responsive.
- `v3.js`: xử lý nghiệp vụ và Firebase.
- `firestore.rules`: quyền Firestore cần triển khai thủ công.
- `legacy-v2.html`: phiên bản giao diện cũ dự phòng.

Đây là ứng dụng nội bộ cho hai tài khoản. Không đưa thông tin hồ sơ học sinh hoặc dữ liệu nhạy cảm vào brief khi chưa có chính sách truy cập và lưu giữ phù hợp.
