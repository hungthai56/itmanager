**1. Đăng nhập & Bảo mật hệ thống**

- **Giao diện cổng đăng nhập** hiển thị danh sách các cơ sở trực thuộc cụm (*New York Site 1* đến *New York Site 5*) [[00:00](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=0)].
- **Cơ chế chống dò mật khẩu (Brute-force protection):** Khi nhập sai mật khẩu tài khoản `itmanager`, hệ thống cảnh báo đỏ và đếm ngược số lần thử còn lại trước khi khóa tài khoản (*4 attempts remaining*, sau đó giảm xuống *3 attempts remaining*) [[00:05](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=5)].

**2. Tổng quan Cụm (Cluster Overview) & Bảng điều khiển (Dashboard)**

- **Cluster Overview (`/cluster`):** Dành cho cấp quản lý chuỗi theo dõi và so sánh trực quan dữ liệu của cả 5 khách sạn (*JFKS1* đến *JFKS5*) trên cùng một màn hình thông qua 9 biểu đồ cột: *Daily Tasks, Checklist, Roster, Contracts, P&L YTD, CAPEX, Projects, Inventory* và *Knowledge Base* [[00:19](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=19)].
- **Chuyển đổi cơ sở (Site Switcher):** Menu góc trên bên phải cho phép chuyển nhanh giữa từng khách sạn hoặc bấm vào biểu tượng quả địa cầu để quay lại màn hình tổng quan toàn cụm [[00:29](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=29)].
- **Dashboard từng cơ sở (`/dashboard`):** Tóm tắt toàn bộ tình hình hoạt động của khách sạn đang chọn theo 3 tầng: *Daily Operations* (Số task đang mở, tiến độ checklist, quân số trực tuần, hợp đồng sắp hết hạn), *Strategic* (Biểu đồ P&L, ngân sách CAPEX, tiến độ dự án) và *Operational* (Tình trạng thiết bị trong kho và tài liệu mới) [[00:33](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=33)].

**3. Quản trị Hệ thống (System Admin Panel)**

- **Quản lý người dùng (`Users`):** Phân chia theo các cấp *SYS, MANAGER, SUPERVISOR, STAFF* [[00:46](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=46)]. Cửa sổ chỉnh sửa nhân sự gồm 5 tab:
  - *Profile:* Thông tin cá nhân, chức danh hiển thị và phòng ban [[00:50](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=50)].
  - *Access:* Cấp quyền truy cập vào từng khách sạn cụ thể, chọn khách sạn mặc định khi đăng nhập, khóa tài khoản hoặc bắt buộc đổi mật khẩu ở lần đăng nhập kế tiếp (*Force Password Reset*) [[00:53](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=53)].
  - *Reporting:* Thiết lập người quản lý trực tiếp (*Reports To*) để phân luồng hiển thị công việc theo cấp bậc [[00:56](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=56)].
  - *Permissions:* Ghi đè quyền hạn cá nhân (*Override: Allow / Deny*) độc lập với quyền mặc định của nhóm [[01:00](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=60)].
  - *Security:* Đặt lại mật khẩu có kiểm tra độ mạnh [[01:06](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=66)].
- **Quản lý chi nhánh (`Sites`):** Khai báo mã cơ sở (ví dụ `JFKS1`), tên khách sạn và tiền tệ cơ sở (`USD`). Điểm đặc biệt về kiến trúc kỹ thuật là **tự động khởi tạo Multi-database**: khi thêm một Site mới, hệ thống tự động tạo cơ sở dữ liệu riêng và đăng ký vào hệ thống mà không cần khởi động lại máy chủ (*"Adding a new site automatically creates its database and registers it — no server restart required"*) [[01:10](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=70)].
- **Cài đặt hệ thống (`Settings`):**
  - Cấu hình đường dẫn lưu trữ file đính kèm (`C:\itmkit-data\uploads`), giới hạn dung lượng (10 MB) và các đuôi file cho phép [[01:23](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=83)].
  - Cho phép thêm/xóa linh hoạt toàn bộ các thẻ danh mục (hỗ trợ áp dụng chung toàn cụm `global` hoặc riêng từng khách sạn) cho tất cả các module: loại công việc, chu kỳ tính công (*Payroll Cycle* như `21-20` hoặc `25-24`), danh mục thiết bị, phòng ban, nhà cung cấp (*Vendors*), mã tài khoản kế toán chi phí/doanh thu (*P&L Accounts*) [[01:27](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=87)].
- **Ma trận phân quyền (`Permissions`):** Bảng bật/tắt quyền hạn mặc định cho 3 vai trò (*Manager, Supervisor, Staff*) trên từng tính năng nhỏ của cả 10 phân hệ [[01:40](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=100)].
- **Thiết lập mẫu kiểm tra (`Checklists`):** Tạo mẫu checklist theo từng cơ sở với 3 chế độ: *Recurring* (lặp lại theo các thứ trong tuần), *Periodic* (định kỳ Tháng/Quý/Nửa năm/Năm) và *Custom* (tùy chỉnh cột giai đoạn), kèm cấu hình bắt buộc nhập ghi chú (*note req.*) khi đánh dấu lỗi [[02:01](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=121)].
- **Cấu hình ca làm việc (`Shift Types`):** Định nghĩa mã ca trực và nghỉ phép (`D, N, HD, BT, AL, CL, SL, DO...`), gắn màu sắc và hệ số tính công (*Factor*: `1`, `0.5`, `0`) [[02:11](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=131)].
- **Nhật ký truy vết (`Audit Log`):** Lưu lịch sử đăng nhập và thao tác của toàn bộ người dùng kèm địa chỉ IP để phục vụ kiểm toán bảo mật [[02:19](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=139)].

**4. Nhóm phân hệ Vận hành Hàng ngày (DAILY)**

- **Daily Task (`/tasks`):** Quản lý công việc trong ngày (*Today*), lên lịch ngày mai (*Tomorrow*) và tra cứu lịch sử (*Records*) [[02:37](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=157)]. Hỗ trợ đổi trạng thái nhanh (*Open -> In Progress -> Done*) trực tiếp trên dòng [[02:41](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=161)], tự động gom các việc tồn đọng từ những ngày trước (*From Prior Days*) và xuất báo cáo Excel đã được căn chỉnh sẵn khổ in A4 ngang [[03:02](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=182)].
- **Check List (`/checklist`):** Bảng kiểm tra hệ thống định kỳ (kiểm tra máy POS/PMS, máy in, UPS, đường truyền mạng, Server/NAS, Backup) [[03:19](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=199)]. Khi nhân viên tích chọn trạng thái, hệ thống lưu lại tên người làm và giờ thực hiện; nếu chọn *Not Done*, phần mềm bắt buộc nhập lý do (ví dụ: `"too busy"`) mới cho phép lưu [[03:34](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=214)], đồng thời hỗ trợ đính kèm ảnh chụp bằng chứng (*Evidence*) [[03:27](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=207)].
- **Roster (`/roster`):** Bảng phân ca trực nhân sự IT theo chu kỳ lương, tự động cộng tổng số ngày công làm việc (*WD*) [[03:51](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=231)]. Hỗ trợ chọn từng ô hoặc **kéo quét chọn nhiều ngày liên tiếp** để gán ca hàng loạt cực nhanh [[04:05](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=245)].

**5. Nhóm phân hệ Tài sản & Hợp đồng (OPERATIONAL)**

- **Inventory (`/inventory`):** Quản lý thiết bị phần cứng, theo dõi số Serial, địa chỉ MAC, vị trí lắp đặt, lịch sử cấp phát, đính kèm chứng từ và cảnh báo hạn bảo hành [[04:11](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=251)].
  - **Tích hợp QR Code:** Mỗi thiết bị tự động sinh một mã QR dẫn tới trang thông tin chi tiết ở chế độ chỉ đọc (`/qr/JFKS1-SV001`) để quét kiểm kê bằng điện thoại [[04:33](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=273)].
  - Hỗ trợ tích chọn nhiều thiết bị để **dàn trang và in tem QR hàng loạt (`Print QR`)** [[05:07](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=307)], tìm kiếm theo từ khóa và xuất danh sách ra Excel [[04:51](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=291)].
- **Contracts (`/contracts`):** Quản lý hợp đồng dịch vụ (Internet, bản quyền Microsoft 365, Oracle OPERA Cloud PMS, bảo trì phần cứng) kèm cảnh báo sắp hết hạn [[05:45](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=345)]. Hỗ trợ tạo hợp đồng mới hoặc thêm **Phụ lục gia hạn (*Add Addendum*)** liên kết trực tiếp với hợp đồng gốc [[05:55](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=355)].

**6. Nhóm phân hệ Chiến lược & Ngân sách (STRATEGIC)**

- **P&L (`/pl`):** Quản lý ngân sách (*Budget*) và chi phí thực tế (*Actual*) hàng tháng theo từng mã tài khoản kế toán IT, tự động tính tỷ lệ chênh lệch (*Variance*) [[06:20](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=380)]. Video minh họa tính năng tự động thích ứng: khi vào *Settings* xóa các mã tài khoản doanh thu (*Revenue Accounts*) [[06:36](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=396)], bảng P&L tự động ẩn phần doanh thu và chuyển sang chế độ chỉ theo dõi chi phí (*Total Controllables*) [[06:44](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=404)].
- **CAPEX (`/capex`):** Quản lý ngân sách đầu tư mua sắm tài sản lớn. Khi thay đổi số lượng hoặc đơn giá, hệ thống tự động tính lại tổng tiền; hỗ trợ đổi trạng thái **Hoãn đầu tư (*Deferred*)** sang năm sau [[07:18](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=438)]. Đặc biệt, dựa vào số năm vòng đời thiết bị (*Lifecycle Years*, ví dụ 5 năm hoặc 7 năm), tab **10-Year Forecast** sẽ tự động tính toán và lập bảng dự phóng ngân sách thay thế thiết bị cho 10 năm tiếp theo [[07:31](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=451)].
- **Project Update (`/projects`):** Quản lý tiến độ và ngân sách các dự án công nghệ (như nâng cấp hạ tầng Wi-Fi 6 hay chuyển đổi OPERA Cloud PMS), chia nhỏ đầu việc (*Task Registry*), tùy chỉnh ẩn/hiện cột hiển thị và xuất báo cáo dự án ra Excel [[07:40](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=460)].

**7. Cơ sở Tri thức (Knowledge Base)**

- Quản lý tài liệu đính kèm (*Documents* - cho phép phân quyền chia sẻ toàn chuỗi hoặc chỉ định từng khách sạn) [[08:26](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=506)] và bài viết hướng dẫn xử lý sự cố (*Tutorials* - tích hợp trình soạn thảo Rich Text Editor và nút xuất nhanh bài viết ra file PDF để in ấn) [[08:53](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=533)].

**8. Kiểm thử Phân quyền theo Vai trò (Role-Based Access Control)**

- Cuối video, người dùng đăng xuất tài khoản Admin và đăng nhập bằng tài khoản `david` (vai trò **Supervisor**) [[09:44](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=584)]. Giao diện lập tức giới hạn phạm vi: ẩn menu *System Admin*, ẩn nút xem toàn cụm, chỉ hiển thị 2 chi nhánh được phân công (*New York Site 1 & 3*) [[09:59](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=599)], khóa nút sửa đối với các công việc không thuộc phạm vi quản lý [[10:09](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=609)], và chuyển các phân hệ *P&L, CAPEX, Project Update* sang chế độ chỉ xem (*Read-only*) [[10:22](https://www.youtube.com/watch?v=2GRzvY2tbpA\&t=622)].