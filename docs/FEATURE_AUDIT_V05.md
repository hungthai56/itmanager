# Rà soát chức năng Lotus IT Command v0.5.0 so với đặc tả người dùng

**Nguồn yêu cầu:** văn bản “PHẦN 1–7: Xác thực, Quản trị, Cluster, Daily, Operational, Strategic, Knowledge Base” do người dùng cung cấp ngày 06/11/2026.  
**Nguồn đối chiếu:** mã nguồn và unit test trên repository `hungthai56/itmanager`, nhánh `main`.  
**Ký hiệu:** **Có** = đã có xử lý cốt lõi; **Một phần** = triển khai chưa hết điều kiện; **Chưa** = chưa có tính năng thực; **Kiến trúc mới** = cần dịch vụ máy chủ, không thể giả vờ đã có trong ứng dụng offline.

> Kiểm thử CI là kiểm tra tự động và tạo bộ cài trên Windows runner. Chưa thay thế kiểm thử thao tác thật tại các máy trong khách sạn.

## 1. CORE & AUTH

| Mục yêu cầu | Trạng thái v0.5 | Ghi chú trung thực |
|---|---|---|
| 1.1 Đăng nhập, 5 lần sai, bộ đếm, khóa tài khoản | Có | v0.5 khóa đến khi SYS mở khóa; hiển thị số lần còn lại. Cần bố trí **ít nhất hai tài khoản SYS** để tránh khóa mất toàn bộ quyền quản trị. |
| Bắt buộc đổi mật khẩu, ghi audit login | Có | Lưu hash scrypt+salt, có audit; chưa ghi IP nguồn đáng tin cậy. |
| Liệt kê các Site trên màn hình đăng nhập | Có | Danh sách tên và mã Site từ DB local. |
| 1.2 Default Site, chuyển nhanh trong phiên | Có | Kiểm tra site trong backend; không cần đăng nhập lại. |
| Multi-database vật lý và đồng bộ đa máy | **Kiến trúc mới** | Hiện **SQLite một máy, tách bản ghi theo site_id**. Không dùng chung tệp .db qua SMB/OneDrive. |
| 1.3 Vai trò SYS/MANAGER/SUPERVISOR/STAFF | Có | Ma trận mặc định read/write + override allow/deny. |
| Ma trận `tasks.view/add/edit/delete/export` riêng | **Một phần** | Mới có quyền đọc/ghi theo module, chưa phân quyền chi tiết từng hành động. |
| Reports To giới hạn sửa/xóa Task | Có | SYS/MANAGER toàn Site; SUPERVISOR tự làm hoặc STAFF báo cáo trực tiếp; STAFF chỉ bản ghi tự tạo. Backend chặn sửa/xóa/batch. |

## 2. SYSTEM ADMIN

| Mục yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| 2.1 Users: profile, role, job title, department | Có | Có thêm/sửa/vô hiệu hóa, chưa có xóa cứng và tìm kiếm chuyên dụng. |
| Access: allowed sites, default site, force reset, khóa/mở khóa | Có | Khóa được quản trị bằng tài khoản SYS. |
| Reporting, override quyền | Có một phần | Reports To và override read/write; chưa đủ quyền theo từng nút. |
| 2.2 Sites: mã/tên/tiền tệ | Có | Thêm/sửa + cô lập theo site ID. **Chưa có** Active/Inactive và DB vật lý riêng. |
| 2.3 Settings danh mục động/global/per-site | Một phần | Category chung, shift, checklist và kỳ công riêng từng site; chưa đủ Vendors, Departments, Account codes, categories theo global/site riêng. |
| Upload Config | Một phần | Giới hạn 10 MB + whitelist trong Electron main; chưa có UI cấu hình tùy ý. |
| 2.4 Checklist Templates 3 kiểu Recurring/Periodic/Custom | Một phần | Hỗ trợ frequency ngày/tuần/tháng/quý/nửa năm/năm/custom. Chưa có chọn thứ trong tuần, cột Custom giai đoạn và note-required tùy mẫu. |
| 2.5 Shift Types: factor | Một phần | Mã ca và hệ số; bản mới AL mặc định factor=0. Chưa có tên/màu riêng cho từng mã ca. |
| Chu kỳ lương 1–tháng, 21–20, 25–24, 26–25 | Có | Cài riêng cho từng Site trong Settings. |
| 2.6 Audit Log | Một phần | Timestamp, người, module, hành động trong details; chưa có IP nguồn và bộ lọc nhiều điều kiện. |

## 3. CLUSTER & DASHBOARD

| Mục yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| 3.1 9 nhóm KPI toàn cụm | Có một phần | Đã có 9 nhóm so sánh và thanh biểu diễn theo Site. KPI tiền tệ P&L/CAPEX, trạng thái dự án/roster được lấy từ dữ liệu mỗi Site; biểu đồ chưa đầy đủ chiều dữ liệu giống video 1:1. |
| 3.2 Dashboard Daily | Một phần | Task, checklist, hợp đồng sắp hết hạn; chưa hiển thị đầy đủ tên người trực hôm nay và tỷ lệ kỳ checklist được sinh tự động. |
| Dashboard Strategic | Có một phần | Đã có P&L YTD, CAPEX và dự án; thiếu nhiều đồ thị lịch sử. |
| Dashboard Operational | Có một phần | Thiết bị hết bảo hành/≤90 ngày, record gần đây; chưa đầy đủ bảng tài liệu mới kèm lọc. |

## 4. DAILY MODULES

| Mục yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| 4.1 Daily Tasks: tạo/sửa/xóa, trạng thái, ưu tiên, phòng ban | Có | Sửa nhanh một ô, gán trách nhiệm, ngày công việc, ghi chú xử lý. |
| Today / Tomorrow / Records; From Prior Days | Có | Có khối overdue riêng; tìm theo từ, trạng thái và khoảng ngày. |
| Xuất Excel theo bộ lọc hiện tại A4 ngang | Có | API export nhận ID đang lọc, không vô tình xuất toàn Site; lưu sự kiện export. |
| 4.2 Checklist theo kỳ, Done/Not Done, lý do, actor, timestamp | Có một phần | Có bảng trực tiếp/auto-upsert theo kỳ. Chưa có grid nhiều cột ngày của một tuần và chọn Recurring theo thứ. |
| Bằng chứng của từng ô | Một phần | Form bản ghi hỗ trợ tệp, nhưng bảng checklist nhanh chưa gắn tệp chứng cứ riêng từng ô. |
| 4.3 Roster theo payroll, WD hệ số | Có | Kỳ 21–20/25–24/26–25, đầu/cuối tháng; tính lại WD theo shift factor hiện hành. |
| Kéo nhiều ô cùng một nhân viên | Có | Có quick mode và batch upsert. Chưa hỗ trợ kéo nhiều hàng nhân viên và thống kê riêng AL/DO/PH/SL. |
| Ghi chú ô ca | Có một phần | Lưu note khi gán hàng loạt, xem bằng tooltip; chưa có editor note trên từng ô. |

## 5. OPERATIONAL MODULES

| Mục yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| 5.1 Inventory: code/model/serial/MAC/IP/vendor/department/location/warranty | Có | Bộ trường được mở rộng, mã tài sản unique theo Site. |
| Thẻ lọc Total / Warranty Expired / ≤90D / Categories | Có | Có bộ lọc kết hợp với từ khóa và trạng thái. |
| Lịch sử cấp phát/di chuyển | Một phần | Có record history trước/sau, chưa có sổ bàn giao chuyên dụng và chữ ký. |
| Đính kèm chứng từ | Một phần | File kèm bản ghi, chưa lưu nhiều tệp và lịch sử file đầy đủ. |
| QR in hàng loạt | Có | **QR vẫn là mã dữ liệu local**, chưa phải URL có thể mở điện thoại. |
| QR URL read-only / điện thoại | **Kiến trúc mới** | Cần web/API server có xác thực & quyền xem. |
| Import Excel tài sản | Chưa | Có export Excel, chưa có import/upsert với preview và kiểm tra trùng. |
| 5.2 Contracts: hợp đồng gốc và phụ lục 1-n | Có | Có bảng riêng `contract_addenda`; không ghi đè ngày hợp đồng gốc. |
| Effective End Date từ phụ lục mới nhất | Có | Tính từ mốc xa nhất; Dashboard cảnh báo trong 60 ngày. |
| File scan từng phụ lục và nhiều mức nhắc hạn | Một phần | Chưa gắn file riêng vào mỗi phụ lục; chưa có scheduler nhắc email/desktop. |

## 6. STRATEGIC MODULES

| Mục yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| 6.1 P&L 12 tháng, Budget/Actual, YTD, Variance | Có một phần | Có bảng 12 tháng, tổng theo tài khoản, YTD và màu variance; mã tài khoản còn nhập thủ công thay vì bắt buộc đọc từ Settings. |
| Ẩn Revenue nếu không dùng | Có một phần | Ẩn theo số liệu Revenue có sẵn, chưa dựa trên cấu hình danh mục Revenue Accounts. |
| 6.2 CAPEX Annual, quantity×unit cost, lifecycle | Có | Có các trường target quarter/priority/actual spent, tính ngân sách hiện hành không tính Deferred/Cancelled. |
| 10-Year Forecast và Deferred | Có | Bắt đầu từ năm sau, Deferred đẩy đầu tư sang năm kế và vòng đời tính từ mốc đó. Chưa điều chỉnh lạm phát/giá thay thế. |
| 6.3 Projects Master + Task Registry | Có | Task có owner/due/status, % theo số task Done. |
| Weighted milestones, column visibility, export task chi tiết | Chưa | Tiến độ chưa tính trọng số; Excel hiện export master chứ chưa gồm mọi task con. |

## 7. KNOWLEDGE BASE

| Mục yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| Documents, Tutorials, tìm nội dung và tags | Một phần | Text + file đính kèm/tags, tìm từ khóa trong record JSON. |
| Rich Text Editor (bảng/hình/code), SOP PDF A4 | **Chưa** | Chưa có editor nâng cao, chưa có PDF chuẩn SOP. |
| All Sites / Specific Sites có thực thi bảo mật | **Chưa** | UI có nhãn `Site/Cluster`, **backend vẫn giới hạn bản ghi theo site_id**. Tuyệt đối không xem nhãn Cluster là đã chia sẻ được cho các site khác. |

## 8. KIẾN TRÚC, DỮ LIỆU VÀ ĐỘ TIN CẬY

- CSDL: `sql.js` SQLite offline trên từng máy. Không hỗ trợ chỉnh sửa đồng thời nhiều máy.
- Tệp đính kèm đang lưu riêng; backup .db **không bao gồm attachments**. Sao lưu và restore cần kế hoạch thống nhất cả hai.
- Mật khẩu scrypt+salt, nhưng file DB không mã hóa toàn bộ. Đề xuất BitLocker và ACL Windows.
- Người quản trị đầu tiên có thể bị khóa sau 5 lần sai như yêu cầu: **tạo ít nhất hai tài khoản SYS**; hệ thống hiện chưa có cơ chế self-service khôi phục SYS an toàn.
- GitHub Actions kiểm tra unit tests, TypeScript/Vite và đóng gói NSIS; cần chạy thử thủ công trên Windows trước khi dùng thật.

## Ưu tiên triển khai tiếp (được phân biệt rõ với tính năng đã có)

1. **Vận hành cốt lõi**: per-action permissions; checklist calendar grid theo thứ/cột custom + evidence theo ô; báo cáo Excel roster/Project Task Registry; import Excel tài sản.
2. **Quản trị nâng cao**: bộ danh mục Global/Site, audit filter/IP, status Active/Inactive Site, lịch sử bàn giao tài sản, nhiều tệp cho mỗi hợp đồng.
3. **Knowledge Base**: Rich Text an toàn, SOP có ảnh, tìm toàn văn, xuất PDF A4, chia sẻ Specific Sites thực chất.
4. **Máy chủ trung tâm**: API/PostgreSQL hoặc cơ sở dữ liệu server, xác thực tập trung, phân quyền theo site; trang web chỉ đọc QR, đồng bộ Windows client và điện thoại, backup đầy đủ. Giai đoạn này **phải thay đổi kiến trúc**, không nên chia sẻ tệp SQLite trực tiếp.

Tài liệu này là **bảng kiểm chứng thực trạng**, không phải cam kết mọi yêu cầu đã hoàn thành. Mọi điều chỉnh tiếp theo nên bổ sung unit test/CI và đối chiếu lại từng dòng.