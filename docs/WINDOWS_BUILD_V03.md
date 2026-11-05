# Lotus IT Command v0.3 — Sửa build và giao diện song ngữ

## 1. Nguyên nhân lỗi Windows 10

Lỗi `Cannot create symbolic link : A required privilege is not held by the client` xuất hiện khi electron-builder 25.1.8 giải nén `winCodeSign-2.6.0.7z` trên máy Windows không có quyền tạo symbolic links. Các tệp `darwin/10.12/lib/*.dylib` là thành phần macOS trong gói ký mã, không phải dữ liệu hay lỗi của ứng dụng. Đừng xóa database hoặc cài lại Windows để sửa lỗi này.

## 2. Giải pháp trong dự án

Đã cấu hình `build.win.signAndEditExecutable=false` trong `package.json` để bản build cá nhân không chạy giai đoạn chỉnh sửa tài nguyên/ký file `.exe` vốn dẫn tới giải nén `winCodeSign`. Bản desktop tiếp tục dùng biểu tượng cửa sổ `assets/icon.png`; bộ cài dùng `assets/icon.ico` theo khả năng của NSIS. **Đánh đổi:** file `.exe` chưa được ký số và metadata/biểu tượng nhúng vào riêng file executable có thể không đầy đủ. Khi phát hành đại trà, nên dùng certificate code-signing và bật lại resource editing trên CI có quyền phù hợp.

Nếu một máy vẫn vướng lỗi giải nén do cache cũ: bật *Windows Settings > Update & Security > For Developers > Developer Mode* (nếu chính sách công ty cho phép), hoặc mở PowerShell/CMD dưới quyền Administrator rồi chạy build, sau đó dọn cache chỉ khi cần:

```powershell
Remove-Item "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Recurse -Force -ErrorAction SilentlyContinue
```

Không cần chạy phần mềm hằng ngày bằng quyền quản trị viên. Chỉ cân nhắc quyền nâng cao cho **quá trình build** nếu vẫn gặp lỗi tương tự.

## 3. Cập nhật về máy

```powershell
cd D:\Hung\AppCongty\ITManager\itmanager
git pull origin main
npm install
npm run dist:win
```

Hoặc `npm run dev` để thử trực tiếp mà không đóng gói. Mã nguồn, dữ liệu mẫu và mật khẩu không được lưu trong GitHub. Trước khi nâng cấp, hãy tự sao lưu `.db` và thư mục tệp đính kèm trong AppData.

## 4. Song ngữ Việt / Anh

- Mặc định Tiếng Việt trên máy mới.
- Chọn **Tiếng Việt** hoặc **English** trên màn hình đăng nhập và góc trên ứng dụng.
- Lựa chọn lưu vào `localStorage` của ứng dụng và nhớ sau khi khởi động lại.
- Dịch giao diện, menu, biểu mẫu, lựa chọn trạng thái, thông báo phổ biến và các màn hình Checklist/Roster/Projects.
- **Không dịch giá trị nội bộ khi ghi dữ liệu** (`Done`, `Not Done`, `In Progress`, mã ca `D/N/AL`, module IDs, record keys); dữ liệu cũ tương thích.
- Tên riêng do nhân viên nhập, mã tài sản, số serial, nhật ký thô và mã kỹ thuật không được dịch tự động.

## 5. Kiểm tra

Chạy `npm test`, `npm run build`, `npm run dist:win`. GitHub Actions chạy ba bước kiểm thử/đóng gói tương tự trên `windows-latest` và cung cấp Windows Installer trong mục **Artifacts**.