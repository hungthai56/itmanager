# Đánh giá demo và các tính năng đã đưa vào Lotus IT Command 0.2.0

Nguồn: video `video.mp4` do người dùng cung cấp, thời lượng ~10:35, giao diện ITMKit chạy trên trình duyệt. So sánh với nền tảng Electron 0.1.0.

| Thời điểm quan sát | Tính năng đáng chú ý trong video | Tình trạng v0.2.0 |
| --- | --- | --- |
| 00:40–02:20 | Ma trận phân quyền, mẫu checklist, mã ca, audit | Tiếp tục dùng nền tảng sẵn có, thêm kiểm soát quyền backend cho API mới |
| 02:40–03:10 | Daily Tasks, trạng thái và Excel A4 landscape | Đã có từ v0.1, giữ nguyên |
| 03:20–03:50 | Checklist theo chu kỳ, đánh dấu Done/Not Done và lý do | **Nâng cấp:** board theo ngày/kỳ, ghi người thực hiện, thời điểm và lịch sử thay đổi |
| 03:50–04:10 | Lưới Roster tô màu, gán ca nhiều ngày | **Nâng cấp:** lưới tháng, kéo chọn ngày, cập nhật một lượt bằng giao dịch SQLite, cộng WD theo hệ số |
| 04:10–05:30 | Inventory, chỉnh tài sản, bảo hành, QR, xuất và in tem | **Nâng cấp:** phát hiện mã tài sản trùng; lịch sử thay đổi trước/sau. QR in giữ như cũ |
| 05:45–06:10 | Contracts, addendum | Đã có tham chiếu phụ lục; quy trình gia hạn chuyên sâu là giai đoạn sau |
| 06:20–07:40 | P&L linh hoạt, CAPEX 10-Year Forecast | Đã có ngân sách/variance và dự phóng cơ bản từ v0.1 |
| 07:50–08:20 | Project Task Registry, giao việc, trạng thái | **Nâng cấp:** bảng đầu việc riêng, CRUD, tự tính % hoàn thành dự án |
| 08:30–09:35 | Documents, hướng dẫn Rich Text Editor | Knowledge Base cơ bản có sẵn; rich-text/PDF cần triển khai thêm |
| 09:40–10:35 | Supervisor giới hạn theo cơ sở/quyền | Backend giữ kiểm tra RBAC và site isolation; quyền trên UI tiếp tục hoàn thiện |

## Phân biệt với phần mềm trong video

- Bản Electron là ứng dụng **offline-first cài trên Windows**, một SQLite cục bộ, không phải hệ thống web nhiều người dùng chung.
- Checklist board tính kỳ từ ngày người dùng chọn; **không có tiến trình scheduler chạy khi đóng ứng dụng**.
- QR hiện chứa mã tài sản và cơ sở; **không tạo URL web truy cập từ điện thoại**.
- Lịch sử thay đổi mới ghi từ khi phiên bản mới được sử dụng; không thể tạo lại lịch sử của các thao tác trước đó.
- Tiến độ dự án lấy tỷ lệ task Done trên tổng task (không có trọng số).
- Roster tính WD dựa trên factor cấu hình; chưa hỗ trợ chu kỳ payroll tùy chọn.

## Kiểm tra thủ công trước vận hành

1. Mở v0.1 đã có dữ liệu, sao lưu DB, sau đó mở v0.2; không mất bản ghi cũ.
2. Tạo mẫu checklist `Kiểm tra NAS|Daily`; đánh dấu Not Done phải nhập lý do, đổi thành Done và xem History.
3. Tạo 2 nhân viên roster, dùng chuột kéo chọn 3 ngày, gán ca D, kiểm tra tính WD; đổi cùng ngày sang HD không tạo dòng trùng.
4. Tạo dự án, 2 đầu việc: một Done một In Progress, tiến độ tăng lên 50%, cả hai Done lên 100%.
5. Tạo thiết bị trùng mã trong cùng site phải bị chặn; khác site được phép.
6. Đăng nhập STAFF thử sửa đầu việc project phải bị chặn từ backend.
7. Kiểm tra Excel export, QR print, Dashboard, nhập/khôi phục DB và file đính kèm (backup DB không gồm attachment).