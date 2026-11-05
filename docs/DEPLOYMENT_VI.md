# Triển khai Lotus IT Command

## A. Build trên máy Windows

1. Cài Node.js 22 LTS và Git.
2. Dùng `git clone https://github.com/hungthai56/itmanager.git` (nếu đã có repository) hoặc tải gói ZIP mã nguồn.
3. Mở PowerShell trong thư mục mã nguồn, chạy:

   ```powershell
   npm install
   npm test
   npm run dist:win
   ```

4. Mở thư mục `release`, chạy file `Lotus-IT-Command-Setup-0.1.0.exe`.
5. Tạo SYS account lần đầu. Đặt mật khẩu mạnh; tránh ghi mật khẩu trong README/issue.

Nếu Windows chặn script ở PowerShell, dùng `BUILD_WINDOWS.cmd` hoặc CMD. Không cần đổi execution policy toàn hệ thống.

## B. GitHub lần đầu

### 1. Tạo repository

Trên GitHub (tài khoản đã kết nối), chọn `New repository`, repository đã tạo: `hungthai56/itmanager`. Repo này hiện **Public**; chuyển sang Private trên GitHub Settings nếu muốn hạn chế người xem mã nguồn. Không lưu mật khẩu hoặc dữ liệu khách sạn thật lên GitHub.

### 2. Đẩy mã nguồn

Trong thư mục đã giải nén:

```powershell
git init -b main
git add .
git commit -m "Initial Lotus IT Command v0.1.0"
git remote add origin https://github.com/hungthai56/itmanager.git
git push -u origin main
```

Lệnh `git remote` là ví dụ tương ứng với tài khoản `hungthai56`; chỉ dùng nếu tên repository tạo thực tế trùng khớp. Có thể dùng GitHub Desktop để Add repository > Publish repository (Private).

### 3. Pull bản cập nhật

```powershell
cd C:\\DuAn\\itmanager
git pull origin main
npm install
npm run dist:win
```

Hoặc tải file exe đã build trong Actions để cài mà không cần Node.js.

## C. Những dữ liệu không được push

Không commit DB `.db`, file backup, tệp chứng cứ/đính kèm, tên đăng nhập thực tế của khách sạn, mật khẩu, API token, chứng chỉ ký số, file `.env`, `node_modules`, `release`.

## D. Khi triển khai đa máy

Phần mềm Electron có thể được cài ở nhiều PC nhưng hiện **chưa có đồng bộ**. Tạo các database rời trên từng máy sẽ không đồng bộ nhiệm vụ và thông tin thiết bị. Giai đoạn đa máy nên triển khai API server (Node/NestJS hoặc ASP.NET Core), PostgreSQL/MySQL và file storage tập trung, có HTTPS, backup, log, ACL theo cơ sở và phiên đăng nhập bảo mật. Máy khách Electron chỉ làm frontend.