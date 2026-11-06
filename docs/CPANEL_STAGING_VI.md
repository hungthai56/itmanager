# PHP/MySQL trên cPanel — bản pilot v0.6.2

Electron online và web dùng chung nguồn MySQL qua API HTTPS. Mỗi người dùng có tài khoản riêng và chỉ được thao tác Site/phân hệ được cấp. SQLite offline vẫn độc lập; chuyển chế độ không tự tải hoặc gộp dữ liệu cũ. Các bảng tự làm mới theo chu kỳ, chưa có WebSocket hay hàng đợi đồng bộ offline.

## Chuẩn bị hosting

- PHP 8.3+ có PDO MySQL, Argon2id, JSON và OpenSSL; MySQL 8+ với InnoDB. Xác nhận phiên bản thực tế, vì một số gói cPanel dùng MariaDB thay cho MySQL.
- Một subdomain HTTPS riêng, ví dụ `it.example.com`; cấu hình DocumentRoot tới `server/public`. Giữ `app`, `bin`, `database` và `config.local.php` ngoài thư mục public. Nếu nhà cung cấp không cho chọn DocumentRoot đúng cấu trúc hoặc giữ secrets ngoài webroot, chưa đưa bản này lên Internet.
- Có Terminal/SSH hoặc cách chạy PHP CLI được nhà cung cấp hỗ trợ để khởi tạo và mở khóa quản trị. Không chuyển các script CLI thành trang web.
- Tắt Remote MySQL; chỉ PHP trên hosting được nối DB nội bộ. Bật HTTPS bắt buộc/AutoSSL và theo dõi gia hạn. Giữ `LOTUS_ALLOW_HTTP_LOCALHOST` tắt trên hosting.

## Cài bản thử nghiệm

1. Tạo DB thử nghiệm rỗng, không dùng dữ liệu đang vận hành. Sao lưu riêng nguồn SQLite và thư mục attachments nếu chuẩn bị chuyển máy.
2. Tạo user triển khai để chạy schema; cấu hình bằng biến môi trường hoặc `server/config.local.php` theo file mẫu. Không gửi mật khẩu qua chat và không commit file cấu hình.
3. Chạy bằng đúng PHP CLI 8.3+ của hosting:

   ```sh
   php server/bin/doctor.php
   php server/bin/setup.php
   ```

4. Tạo user MySQL runtime riêng chỉ có SELECT, INSERT, UPDATE, DELETE trên DB này. Đổi cấu hình API sang user runtime; không cấp quyền CREATE/ALTER/DROP/FILE/GRANT cho API thường ngày.
5. Trên máy build có Node 22, chạy `npm ci` rồi `npm run build:web`. Đưa `server` lên đúng cấu trúc ngoài webroot; trỏ subdomain vào `server/public`. Cũng có thể dùng artifact `Lotus-IT-Command-PHP-MySQL-Web` của workflow đã thành công trên đúng commit. Không upload toàn bộ repo vào `public_html`.
6. Kiểm tra `/api/v1/health` và đăng nhập tại `/app/`. Electron chọn kết nối máy chủ và nhập cùng tên miền HTTPS; mỗi máy đăng nhập riêng. Tạo tài khoản SYS dự phòng.
7. Khi nâng từ bản trước, các phiên web cũ sẽ yêu cầu đăng nhập lại. Cập nhật cả web và Electron lên v0.6.2 để gửi `version` khi xóa; client cũ thiếu phiên bản sẽ bị API từ chối xóa bằng HTTP 409.

## Kiểm tra trước khi dùng dữ liệu thật

- Thử ít nhất hai máy tính và một trình duyệt: quyền theo Site, tài khoản STAFF, sửa/xóa cùng bản ghi, mật khẩu bị reset, mất kết nối và đăng nhập lại. Thao tác trên phiên bản cũ phải trả 409 và giữ dữ liệu mới.
- Xác nhận backup MySQL tự động có lịch, thời gian lưu và bản ngoài hosting; khôi phục thử vào DB khác rồi đối soát. Backup SQLite trong app không sao lưu server. Thống nhất RPO/RTO theo nhu cầu vận hành.
- Bật MFA của cPanel và tài khoản GitHub; kiểm tra quyền file cấu hình và quyền truy cập bản backup. Xác nhận WAF/rate limit, nhật ký lỗi riêng và cách nhận cảnh báo từ nhà cung cấp hosting.
- API đã có kiểm tra quyền, HTTPS, session/CSRF, mật khẩu Argon2id và phiên bản bản ghi; vẫn cần kiểm thử bảo mật độc lập. MFA trong ứng dụng, quản lý phiên theo thiết bị, file đính kèm trực tuyến, chuyển SQLite và kiểm thử tải/khôi phục còn ở roadmap.

Nếu gói shared hosting không hỗ trợ backup/restore, cách ly cấu hình hoặc kiểm soát truy cập cần thiết, chuyển sang gói quản trị/VPS phù hợp trước khi đưa dữ liệu lâu dài vào sử dụng. Chưa triển khai hoặc khởi tạo DB thật chỉ từ việc thay đổi mã nguồn này.
