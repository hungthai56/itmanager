# Lotus IT Command — Lộ trình từng giai đoạn cho PHP/MySQL + Web + Electron

Cập nhật: 06/11/2026. Định hướng: **ổn định từng bước, không đưa dữ liệu thật lên API chưa được kiểm toán**.

## Kiến trúc mục tiêu

```
Electron Windows ── HTTPS ──┐
                           ├─ PHP 8.3+ API ── MySQL 8+ (private network)
Web browser /app ── HTTPS ─┘          │
                                     ├─ Private attachment storage (future)
                                     ├─ Audit logs + monitoring
                                     └─ Encrypted backups, binlog PITR, restore drills
```

- **MySQL server là nguồn sự thật duy nhất khi bật chế độ online**; mỗi người dùng đăng nhập tài khoản riêng.
- Bản Electron offline có SQLite riêng. Chuyển chế độ **không đồng nghĩa tự đồng bộ**. Không tự động gộp dữ liệu offline và online; chỉ chuyển dữ liệu qua công cụ migration có preview, đối soát, rollback ở giai đoạn sau.
- Web và Electron dùng chung API, cùng mô hình vai trò/phân quyền/site; web nên chạy cùng origin với API tại `https://it.example.com/app/` và `https://it.example.com/api/v1/` để giảm nguy cơ CORS/CSRF.
- Không công khai cổng 3306; mã nguồn có thể công khai nhưng **secrets, bản sao DB, khóa mã hóa, dữ liệu thật và .env không được đưa lên GitHub**.

## Giai đoạn 0 — Hotfix Desktop v0.6.1 (đang thực hiện)

**Chỉ tiêu:** Xử lý `Cannot access 'inDays' before initialization`, không thay đổi API PHP hay dữ liệu.
- Di chuyển hàm so ngày bảo hành/hợp đồng khỏi phạm vi nội bộ Dashboard và tránh Temporal Dead Zone.
- Kiểm thử lặp Dashboard với thời hạn quá khứ và tương lai.
- Chạy `npm test`, TypeScript/Vite, đóng gói Windows trong GitHub Actions.
- **Tiêu chí qua cổng:** test xanh + Windows installer được tạo; sau đó kiểm tra mở Dashboard trên Windows thật. Nếu kiểm thử thủ công chưa đạt, KHÔNG triển khai tiếp trên máy đang vận hành.

## Giai đoạn 1 — Rà soát/bọc bảo mật PHP/MySQL trên staging

**Chỉ tiêu:** Server API v0.6 hiện có chỉ được sử dụng với dữ liệu giả lập, ưu tiên kiểm toán và sửa điểm yếu trước khi mở Internet.
- Threat model: lộ token/session, BOLA/IDOR, vượt quyền/site, SQL injection, XSS, CSRF, brute force, replay/race condition, mất điện/bị mã hóa tống tiền, rò rỉ file upload và backup.
- Kiểm thử bảo mật tất cả route: không login; sai Site; quyền STAFF/SUPERVISOR; role override; phê duyệt dữ liệu; stale version 409; input dài/JSON sai; replay/rate limit.
- Harden TLS, headers/CSP, cookie `Secure/HttpOnly/SameSite`, CSRF, rotation/revocation, quota/rate limits và log an toàn; không tin client gửi `user_id`, `site_id`, `role`.
- Audit PHP/Composer/npm phụ thuộc, secret scan, khóa CI và protected branches. Không ghi bearer token/password/SQL vào log.
- Định chuẩn **OWASP ASVS 5.0.0** và OWASP API Security Top 10; dùng checklist test có bằng chứng chứ không chỉ đánh dấu thủ công.
- **Tiêu chí qua cổng:** PHP lint, MySQL integration tests, negative authorization tests, QA staging, review bảo mật độc lập với findings nghiêm trọng đã xử lý.

## Giai đoạn 2 — Đăng nhập online và phân quyền dùng chung

**Chỉ tiêu:** Login/đăng xuất, quản lý phiên, Site switch, CRUD thử nghiệm dùng cùng database trên desktop/web.
- Triển khai MFA cho SYS/MANAGER (ưu tiên passkey/WebAuthn hoặc TOTP với thủ tục khôi phục an toàn).
- Phiên web server-side và cookie bảo mật; Electron token ngắn hạn được giữ ở main process, có thu hồi thiết bị/phiên và không lưu token vào renderer/localStorage.
- Bắt buộc kiểm tra quyền từng đối tượng và từng thao tác ở PHP, DB query luôn ràng buộc Site; kiểm thử user thuộc Site A không thể xem/chỉnh Site B.
- Chống ghi đè bằng `version`/optimistic locking; lỗi 409 rõ ràng cho người dùng khi máy khác đã sửa.
- **Tiêu chí qua cổng:** 2 máy Windows + 1 browser thử CRUD cùng DB, quyền đúng, không lộ token, không mất/cộng dồn bản ghi, audit đầy đủ.

## Giai đoạn 3 — Dữ liệu bền vững, backup/restore, vận hành an toàn

**Chỉ tiêu:** API/MySQL và bản web có thể vận hành lâu dài trong điều kiện sự cố thực tế.
- MySQL InnoDB; DB user runtime chỉ quyền cần thiết, tách account migrate và runtime; backup snapshot + binlog/PITR, backup được mã hóa và kiểm thử phục hồi định kỳ.
- Có số liệu **RPO/RTO** được chủ hệ thống phê duyệt, log cảnh báo sự cố, theo dõi hết hạn TLS/backup, kế hoạch nâng cấp và rollback database schema.
- Dữ liệu/tệp đính kèm private (ngoài webroot), kiểm tra phân quyền khi xem/tải; giới hạn kích thước + MIME/content validation + quét malware.
- Kiểm thử mạng chập chờn, đứt kết nối, conflict, hiệu năng/concurrency và restore drill từ backup sang môi trường sạch.
- **Tiêu chí qua cổng:** giả lập mất máy chủ/DB vẫn khôi phục được, đối soát số bản ghi và checksum; không phát hiện lộ dữ liệu qua URL/path hoặc log.

## Giai đoạn 4 — Chuyển dữ liệu cũ và đồng bộ nhiều máy

**Chỉ tiêu:** Migrator một lần từ SQLite sang MySQL với preview/đối soát; khi đã chuyển, desktop/web online cùng ghi vào nguồn MySQL duy nhất.
- Khóa ghi nguồn trong thời gian cutover; trước khi import sao lưu cả SQLite và thư mục attachments.
- Mapping site/user, mã tài sản, FK, trùng khóa; dry run, đối soát số hàng, giá trị tài chính và checksum. Có rollback thực sự.
- Không thiết kế đồng bộ SQLite ↔ MySQL hai chiều nếu chưa có chiến lược offline queue, conflict resolution, idempotency và thử nghiệm đầy đủ.
- **Tiêu chí qua cổng:** 100% bản ghi được đối soát, không trùng asset/code hoặc lệch khoản tiền/ca, các quyền Site và audit được giữ đúng.

## Giai đoạn 5 — Mở rộng bản web/QR và bảo trì dài hạn

- Sử dụng dashboard, checklist, roster, inventory qua trình duyệt; tách upload tài liệu và QR read-only có quyền xem, không nhúng thông tin nội bộ/bí mật trong QR.
- WAF, security alerts, rotation keys, định kỳ vá PHP/MySQL/Electron, pentest lại sau thay đổi quan trọng.
- Triển khai theo từng nhóm khách sạn, có quy trình support/rollback; không mở dịch vụ public cho toàn bộ người dùng một lần.

## Các quy tắc phát hành bắt buộc

1. Một giai đoạn chỉ đụng tới phạm vi đã đặt; không đồng thời thay cả UI, auth, DB và sync.
2. Mỗi lỗi có regression test. PR/commit chỉ chuyển sang giai đoạn sau khi CI đạt.
3. Không tự đẩy/tạo dữ liệu production; không đặt mật khẩu DB/API vào GitHub hoặc đoạn chat.
4. **Không tuyên bố “100% bảo mật”.** Security review, penetration test và khả năng restore là điều kiện trước khi xử lý dữ liệu lâu dài.
5. Repository hiện **public**; dùng biến môi trường/secret manager, branch protection; cân nhắc chuyển repo private khi dự án đi vào vận hành.

## Hạ tầng cần xác nhận trước giai đoạn 1

- PHP 8.3+ và MySQL 8+ của bạn chạy trên VPS/dedicated host hay shared cPanel.
- Có khả năng chỉ định document root riêng ngoài thư mục chứa config, giới hạn mạng DB, backup MySQL/binlog, firewall/WAF và chạy CLI/cron hay không.
- Một subdomain HTTPS riêng được quản trị độc lập, không dùng chung mật khẩu quản trị hosting với tài khoản ứng dụng.

**Trạng thái bản v0.6 hiện tại:** PHP/MySQL/Web là bản pilot; dù CI xanh, chưa được bảo đảm đủ điều kiện production.