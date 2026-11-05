# Lotus IT Command v0.4.0 — Thao tác nhanh, giảm số lần nhấp

## Thay đổi theo video demo của người dùng

| Phân hệ | Trước | Bản 0.4.0 |
|---|---|---|
| Daily Tasks | Mở popup để tạo task | Dòng nhập nhanh có người phụ trách, ngày hạn, ưu tiên; nhấn **Enter** để tạo |
| Daily Tasks | Mở dropdown trạng thái | Nhấn **1 lần** vào trạng thái để luân chuyển Open → In Progress → Done → Open |
| Daily Tasks | Mở modal để chỉnh nội dung | Nhấp **đúp** vào tên việc hoặc người phụ trách; Enter/blur để lưu, Esc để hủy |
| Tasks / Inventory | Chỉnh trạng thái từng dòng | Chọn nhiều dòng bằng checkbox rồi **Áp dụng** trạng thái; một giao dịch dữ liệu có kiểm tra quyền và nhật ký |
| Inventory | Mở biểu mẫu chi tiết | Sửa nhanh tên thiết bị, vị trí bằng nhấp đúp; đổi tình trạng qua dropdown ngay trong bảng |
| Checklist | Mở modal dù chọn Done | Nhấn **Done** để lưu ngay, **Not Done** vẫn yêu cầu lý do |
| Roster | Chọn ô rồi chọn mã ca, cuối cùng Lưu | Bật **Gán ca nhanh**, chọn mã D/N/... và kéo/nhả chuột để lưu một ô hoặc một dải |
| Dự án | Mở popup để tạo/đổi trạng thái đầu việc | Thêm đầu việc nhanh bằng Enter, sửa trạng thái ngay trong danh sách |
| Mọi phân hệ | Chọn menu trên sidebar | **Ctrl+K** tìm & mở phân hệ; **/** đặt con trỏ vào tìm kiếm trong bảng; **Ctrl+N** tạo bản ghi mới |
| Mọi phân hệ | Màn hình load lại sau lưu | Giữ lại bộ lọc, kỳ xem và lựa chọn; làm mới dữ liệu nền thay vì che toàn màn hình cho thao tác nhanh |

## Bảo vệ dữ liệu

- Không thay đổi schema dữ liệu; không xóa bản ghi.
- Backend `records.batchStatus` kiểm tra `siteId`, module, vai trò, quyền ghi, trạng thái hợp lệ, chủ sở hữu khi là STAFF. Chặn toàn bộ nếu có dù chỉ một ID sai/không đủ quyền (atomic transaction), ghi history & audit.
- Batch hỗ trợ tối đa 500 ID mỗi lần. Việc trùng ID không được tính hai lần. Trạng thái không đổi không tạo lịch sử thừa.
- Mã trạng thái lưu trong SQLite là tiếng Anh; nhãn hiển thị đổi theo Tiếng Việt / English.
- Chức năng gán ca nhanh được **tắt mặc định** để tránh thao tác nhầm; chỉ bật khi cần. Thao tác kéo chọn thông thường vẫn hoạt động như trước.
- Các tính năng mới không đồng bộ dữ liệu giữa nhiều máy. Hãy **sao lưu cơ sở dữ liệu** trước khi nâng cấp.

## Lưu ý sử dụng

- Nhấp vào ô status task sẽ luân chuyển nhanh; có thể click tiếp để quay lại Open nếu thao tác nhầm. Lịch sử thay đổi được lưu.
- Double-click ô tên/assignee (Tasks) hoặc tên/vị trí (Inventory) để sửa tại chỗ.
- Với quyền STAFF, cập nhật hàng loạt chỉ được thực hiện trên các bản ghi do chính tài khoản tạo.
- UI Electron tiếng Việt/English; giao diện không yêu cầu trình duyệt hoặc máy chủ. `npm run dist:win` dùng cấu hình Windows không ký số để tránh lỗi symbolic link ở máy không có đặc quyền.

## Kiểm thử

Chạy `npm test` và `npm run build`, sau đó `npm run dist:win`. Workflow GitHub Actions tự thực hiện các bước trên Windows.