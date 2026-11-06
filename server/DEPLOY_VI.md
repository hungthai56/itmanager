# Lotus IT Command Server v0.6 — triển khai thử nghiệm có kiểm soát

**Mức sẵn sàng:** Preview/pilot nội bộ; không mặc định an toàn cho sản xuất. Cần kiểm toán bảo mật độc lập, kiểm thử xâm nhập, chính sách backup/restore và đánh giá hosting trước khi xử lý dữ liệu quan trọng.

## Kiến trúc

- Một máy chủ PHP 8.3+ (bật Argon2id, PDO MySQL) và MySQL 8+ quản lý **nguồn dữ liệu trung tâm**. Electron và web React đều gọi chung PHP API qua HTTPS.
- API xác minh vai trò, quyền của từng chi nhánh, quyền bản ghi. Token desktop ngẫu nhiên 256-bit, chỉ lưu SHA-256 trên DB, hết hạn 8 giờ, giữ nguyên trong bộ nhớ main process Electron; không gửi token vào React renderer.
- Web dùng cookie phiên HttpOnly/Secure/SameSite=Strict và CSRF token. API chặn yêu cầu không có JSON hợp lệ và không bật CORS.
- Không cung cấp endpoint import cơ sở dữ liệu SQLite tùy ý qua Internet, không nhận file upload trong bản đầu. Không để MySQL 3306 ra Internet.

## Cài đặt PHP/MySQL (cPanel hoặc VPS)

1. Tạo MySQL database và **user chỉ được truy cập database đó**, không có quyền SUPER/FILE/GRANT. Bảo đảm kết nối DB nội bộ (127.0.0.1/socket). Không bật Remote MySQL.
2. Sử dụng PHP 8.3+ với `pdo_mysql`, `openssl`, `json` và Argon2id; chạy `php server/bin/doctor.php` qua CLI.
3. **DocumentRoot phải trỏ tới `server/public`**, không được trỏ tới thư mục chứa `app/`, `bin/`, `config.local.php`, `database/`. Để trên hosting, cấu hình subdomain root đúng thư mục; không upload toàn bộ repository vào `public_html`.
4. Đặt biến môi trường `LOTUS_DB_HOST`, `LOTUS_DB_PORT`, `LOTUS_DB_NAME`, `LOTUS_DB_USER`, `LOTUS_DB_PASSWORD` qua panel hosting; hoặc tạo `server/config.local.php` (bên ngoài public) theo file mẫu. Dùng mật khẩu ngẫu nhiên mạnh. **Không commit bí mật vào GitHub.**
5. HTTPS chứng chỉ hợp lệ, chặn HTTP, HSTS, tường lửa, cập nhật PHP/MySQL và webserver. Nếu đứng sau reverse proxy, cấu hình HTTPS thực tại webserver upstream; bản mặc định không tin `X-Forwarded-Proto` tự gửi từ client.
6. Chạy `php server/bin/setup.php` từ CLI để tạo bảng và SYS đầu tiên. Không expose `setup.php` ra web. Đăng nhập và tạo SYS dự phòng.
7. Sau khi chạy `npm ci && npm run build:web` từ repo, copy toàn bộ nội dung `server/public` tới document root đúng cấu trúc `/app/` và `/api/v1/dispatch`. Không cho phép PHP trong `/app`.
8. Kiểm tra `https://your-domain/api/v1/health` trả về `{ok:true,service:"Lotus IT API"}`; mở `https://your-domain/app/` để đăng nhập.
9. Trong Electron, vào màn hình đăng nhập, chọn kết nối máy chủ và nhập **đúng tên miền HTTPS**. Mỗi máy đăng nhập tài khoản được cấp; không chia sẻ tài khoản.

## Dữ liệu SQLite cũ

Chưa có tự động upload/import. SQLite cũ vẫn nằm trên máy, độc lập MySQL. Cần một công cụ chuyển đổi **một lần**, có chế độ preview, kiểm tra trùng, đối chiếu số lượng/hàm băm và sao lưu trước và sau. **Không đồng bộ hai chiều giữa SQLite và MySQL** khi dùng bản 0.6; tránh tạo xung đột/sai dữ liệu.

## Những chức năng cần hoàn thiện trước triển khai thực tế

- Chưa có: MFA (TOTP/FIDO2), quản trị phiên theo thiết bị, đăng nhập SSO, tập tin/chứng từ và QR đọc web, import SQLite lên MySQL có kiểm tra, báo cáo Excel trực tuyến, backup cả file đính kèm, SSE/WebSocket real-time. Bản online hiện đồng bộ theo các lượt đọc/lưu và nút Làm mới, không phát sự kiện realtime.
- API có kiểm tra quyền tại server và version chống ghi đè cho **records**, nhưng bảng `project_tasks`, `contract_addenda` chưa có version concurrency riêng.
- Chưa kiểm thử tải lớn, phục hồi sau lỗi ổ đĩa, failover, active-active. Với dữ liệu quan trọng cần UPS, backup DB mã hóa, PITR binlog, restore drill định kỳ, giám sát lỗi, kiểm tra quyền filesystem, WAF/rate limiting ngoài ứng dụng, logging tập trung và penetration test độc lập.
- Hosting shared cPanel có thể thiếu quyền điều chỉnh PHP/webserver/MySQL/binlog, cron và chính sách session. Nếu không đáp ứng các điều kiện trên, nên dùng VPS hoặc hạ tầng quản trị có backup/giám sát thực tế.

## Đường dẫn/API

- `GET /api/v1/health` kiểm tra dịch vụ (không tiết lộ tài khoản/DB).
- `GET /api/v1/csrf` khởi tạo CSRF cho web.
- `POST /api/v1/dispatch` JSON `{ "action": "auth.login", "payload": {"username":"...","password":"..."} }`.
- Không sử dụng `Access-Control-Allow-Origin: *`; web cùng origin và Electron có giao tiếp do main process quản lý.

## Hướng vận hành an toàn

1. Tạo **hai SYS**, áp dụng mật khẩu khác nhau, không gửi qua chat.
2. Chỉ tài khoản thực sự cần mới được quyền Manager/SYS; review role & user-site định kỳ.
3. Bật firewall DB, backup 3-2-1, kiểm thử phục hồi; mã hóa bản sao DB & logs, phân quyền cPanel hạn chế.
4. Bảo vệ domain DNS, certificate renewal, kiểm thử chứng chỉ và các security headers; không tắt TLS verification.
5. Chạy security scanning, OWASP ASVS/API Top 10 review, penetration testing rồi mới khai thác dữ liệu thật.