> **Phiên bản 0.4.0 — Quick Workflow.** Giảm số bước trong Daily Tasks, Checklists, Roster, Inventory và Projects, thêm Ctrl+K / Ctrl+N / tìm trong bảng, cập nhật hàng loạt an toàn. Xem [QUICK_WORKFLOW_V04.md](docs/QUICK_WORKFLOW_V04.md).

> **Phiên bản 0.3.0** — Đã xử lý lỗi winCodeSign symbolic link cho build không ký số trên Windows 10 và thêm song ngữ Tiếng Việt / English. Xem [WINDOWS_BUILD_V03.md](docs/WINDOWS_BUILD_V03.md).

# Lotus IT Command — Hotel IT Operations Desktop

**Version 0.2.0 · Electron + React + TypeScript + SQLite (sql.js)**

Đây là **bản nền tảng chạy offline cho một máy Windows**, phát triển theo danh sách chức năng video do người dùng cung cấp. Không phải bản sao 1:1 đã hoàn thiện. Những điểm đã có và chưa có được ghi rõ bên dưới.

## Khởi chạy trên Windows

Yêu cầu: Windows 10/11 x64, **Node.js 22 LTS** và Internet cho lần tải dependency đầu tiên.

1. Tải/clone mã nguồn về máy; giải nén nếu tải ZIP.
2. Nhấp đúp **`RUN_DEV.cmd`** để chạy chế độ phát triển, hoặc mở Terminal tại thư mục dự án rồi chạy:

   ```powershell
   npm install
   npm run dev
   ```

3. Để build file cài đặt EXE, nhấp đúp **`BUILD_WINDOWS.cmd`**, hoặc chạy:

   ```powershell
   npm install
   npm test
   npm run dist:win
   ```

4. File cài đặt được tạo trong `release/Lotus-IT-Command-Setup-0.2.0.exe` (sau khi build thành công).
5. Lần mở đầu tiên: tạo tài khoản quản trị **SYS** bằng mật khẩu ít nhất **10 ký tự** chứa chữ và số. Không có tài khoản/mật khẩu mặc định.

> **Lưu ý:** Windows Defender/SmartScreen có thể cảnh báo ứng dụng chưa có chứng chỉ ký số. Không tắt antivirus để cài. Hãy kiểm tra mã nguồn và chỉ chạy bản build do bạn tin cậy.


## Nâng cấp theo video demo (0.2.0)

Các chức năng sau đã được triển khai thêm trong bản 0.2.0:

- **Checklist board:** hiển thị mẫu cấu hình theo Daily / Weekly / Monthly / Quarterly / Semiannual / Yearly / Custom và ngày chọn; thao tác Done / Not Done trực tiếp, bắt buộc nhập lý do khi Not Done; ghi họ tên + thời điểm người kiểm tra; mỗi mẫu chỉ có một kết quả trong kỳ, sửa kết quả tạo lịch sử. **Lưu ý:** đây là bảng checklist theo lịch khi người dùng mở app, không phải scheduler chạy nền.
- **Roster calendar:** lưới tháng theo nhân viên/ngày, kéo để chọn các ngày liên tiếp và gán ca hàng loạt; backend cập nhật bản ghi cũ thay vì tạo ca trùng, tự tra hệ số công theo cấu hình.
- **Project Task Registry:** danh sách đầu việc thuộc từng dự án; tên việc, người phụ trách, hạn, trạng thái, ghi chú; tự cập nhật tiến độ dự án bằng % đầu việc Done.
- **Record History:** lưu snapshot trước/sau mỗi lần sửa, ngày giờ và người thao tác; xem được tại bảng bằng biểu tượng đồng hồ lịch sử.
- **Inventory:** từ chối mã thiết bị trùng nhau trong cùng một cơ sở, kể cả khác hoa/thường.
- **Backend authorization:** tất cả tính năng mới đều được kiểm tra vai trò và phạm vi Site trong Electron; dữ liệu bổ sung nằm trong SQLite, tự tạo bảng mới khi nâng cấp từ bản trước.
- **Kiểm thử:** test cho checklist kỳ, phân ca gán hàng loạt, tiến độ dự án, lịch sử dữ liệu, cách ly giữa các site.

**Chưa có:** server đồng bộ nhiều máy, QR URL truy cập bằng điện thoại, checklist scheduler tự chạy khi tắt app, multi-database vật lý. Đừng sử dụng SQLite trên NAS/OneDrive như database ghi chung.

## Đã triển khai (0.1.0)

- **Desktop:** Electron, React/TypeScript, thiết kế sidebar navy, dashboard, bảng tìm kiếm, form nhập và giao diện thích ứng.
- **Bảo mật:** tạo admin lần đầu, đăng nhập, khóa 15 phút sau 5 lần sai, mật khẩu scrypt + salt, đổi mật khẩu, role SYS / MANAGER / SUPERVISOR / STAFF, phân quyền read/write theo module và override theo người dùng.
- **Multi-site offline:** thêm/sửa site, mã và tiền tệ riêng, phân quyền user-site; dữ liệu bản ghi luôn có site_id và kiểm tra trong backend.
- **Dashboard:** số lượng công việc mở, checklist đã làm, hợp đồng và bảo hành sắp hết hạn; bảng gần đây; cluster overview.
- **Daily Tasks:** tạo/sửa/xóa, Today/Tomorrow/Records, thay trạng thái trực tiếp trên bảng, xuất Excel.
- **Checklist:** ghi nhận kết quả Done / Not Done, bắt nhập lý do Not Done, tải file bằng chứng; cấu hình mẫu checklist (nhập nhanh).
- **Roster:** ca làm, hệ số công, nhập lịch từng ngày hoặc gán liên tiếp tối đa 62 ngày.
- **Inventory:** thiết bị, serial, MAC, vị trí, người dùng, hạn bảo hành; mã QR chứa mã tài sản; in tem QR cho một/nhiều thiết bị.
- **Contracts:** thời hạn, giá trị, trạng thái; có ô tham chiếu hợp đồng gốc khi ghi phụ lục.
- **P&L:** số budget, actual, variance thể hiện trên biểu mẫu và Dashboard phân hệ.
- **CAPEX:** số lượng × đơn giá; dự báo thay thế 10 năm dựa trên vòng đời.
- **Projects:** dự án, thời hạn, tiến độ, ngân sách, mục milestone dạng văn bản.
- **Knowledge Base:** bài hướng dẫn, phân loại, nội dung dạng văn bản, tệp đính kèm.
- **Admin:** người dùng, cơ sở, ma trận quyền, danh mục, ca trực, mẫu checklist, audit log, sao lưu/phục hồi DB.
- **Export:** Excel `.xlsx` có định dạng tiêu đề, auto-filter, khổ A4 ngang.

## Chưa triển khai (roadmap, không được hiểu là có sẵn)

1. **Máy chủ/API dùng chung + đồng bộ real-time trên nhiều PC** và truy cập từ điện thoại.
2. Multi-database vật lý cho từng khách sạn (hiện là **một SQLite DB, tách logic bằng site_id**).
3. Mã QR dẫn đến **trang web chỉ đọc** trên điện thoại. Mã QR hiện tại chỉ chứa mã tài sản và cơ sở, không có URL truy cập mạng.
4. Checklist tự sinh theo lịch Recurring / Periodic / Custom; yêu cầu xác minh hoàn tất; ảnh evidence có preview.
5. Lưới roster drag-to-select, tự cộng WD theo kỳ lương, hệ thống duyệt ca.
6. Contract renewal/Addendum có lịch sử/version chi tiết và notification tự động.
7. P&L dynamic account tree, CAPEX deferral cascade và dự báo có điều chỉnh lạm phát.
8. Dự án có Task Registry quan hệ nhiều-một, dependency, phân cấp mốc tiến độ.
9. Rich Text Editor trong Knowledge Base; xuất bài viết PDF.
10. Quản lý tệp dùng chung giữa nhiều máy và toàn cụm, backup **bao gồm** attachments.
11. Audit Log IP máy khách chính xác (hiện lưu thời gian, tài khoản và hành động trên desktop).
12. Tổng hợp biểu đồ đầy đủ và đồng bộ 9 module ở cluster overview như video.

## Cơ sở dữ liệu, bảo mật và sao lưu

- DB được tạo tại thư mục dữ liệu ứng dụng Electron (`app.getPath('userData')/storage/lotus-it.db`). Trên Windows thông thường ở `%APPDATA%/lotus-it-command/storage/lotus-it.db` hoặc dưới thư mục product name tương ứng.
- Attachments lưu trong thư mục `attachments` ở `app.getPath('userData')`.
- Không lưu file `.db` hay mật khẩu/token vào GitHub.
- Database hiện **không được mã hóa toàn tệp**. Nếu chứa dữ liệu nhạy cảm, hãy bật BitLocker và quyền file Windows, hạn chế chia sẻ thư mục người dùng.
- Chức năng Backup/Restore xuất/nhập **chỉ file database**; sao lưu thư mục `attachments` riêng trước khi di chuyển máy hoặc restore.
- SQLite dùng `sql.js` phiên bản asm (không yêu cầu compile native module và Visual Studio C++ Build Tools).
- Với nhiều máy dùng chung: **không** đặt file SQLite trực tiếp trên SMB/NAS/OneDrive để nhiều tiến trình cùng ghi. Cần thay bằng API + database server.

## GitHub Actions

Workflow `.github/workflows/windows-build.yml` được cấu hình chạy trên `windows-latest`, gồm `npm test`, kiểm tra TypeScript/Vite và đóng gói NSIS. Sau khi đẩy lên GitHub, vào **Actions → Windows build and test → Run workflow**, tải artifact `Lotus-IT-Command-Windows-Installer` khi workflow thành công.

## Phát triển

```powershell
npm run dev      # Vite + Electron
npm test         # unit tests SQLite, quyền truy cập
npm run build    # TypeScript + Vite renderer
npm run dist:win # Windows Installer
```

**Ghi chú chất lượng:** Các file đã được kiểm tra cú pháp trong môi trường soạn thảo. GitHub Actions sẽ chạy kiểm thử, kiểm tra TypeScript và đóng gói Windows cho từng commit. Cần kiểm tra thủ công trên máy Windows trước khi triển khai vận hành. Không sử dụng cho vận hành production trước khi test và chuẩn bị kế hoạch backup/restore.