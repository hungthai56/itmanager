# Lotus IT Command v0.6 – Web/API security design and rollout controls

## Threat model and protections

1. **Broken object-level authorization:** Every record query requires the requested `site_id` to match an authorized site, and action permissions and reporting hierarchy are checked in PHP. Server ignores client-supplied user ownership. No anonymous web API record endpoints.
2. **Authentication attacks:** Passwords use Argon2id; five failed user attempts lock account pending SYS unlock; per-IP+username server throttle. Desktop bearer token uses 256-bit CSPRNG, stored hashed on MySQL, held only in Electron main process memory, expires after eight hours. Web uses PHP session cookie (`HttpOnly`, `Secure`, `SameSite=Strict`) and session CSRF token. No permissive CORS. Limit credentials to HTTPS only.
3. **Race/data loss:** MySQL InnoDB transactions + row locks + `records.version`, `project_tasks.version`, `contract_addenda.version` optimistic concurrency: a stale editor gets HTTP 409 and must refresh instead of silently overwriting another technician. Generated unique indexes enforce site/device asset codes, roster day and checklist period.
4. **Mass assignment:** PHP validates record module and allowlisted fields, date/status validation, fixed SQL statements with PDO prepared parameters. Site and creator fields come from authenticated server context.
5. **Injection/XSS:** PDO native parameter binding; React escapes text; deny remote HTML injection; CSP, nosniff, frame and referrer restrictions. No unsafe dynamic SQL with arbitrary table/column names.
6. **Network/transport:** API requires TLS and rejects untrusted forwarded scheme, no wildcard CORS. Electron main rejects non-HTTPS URLs, credentials in URL and redirects; no disabled certificate verification. MySQL must be private/loopback, accessible only from PHP.
7. **Backup/recovery:** Backup and restore must be configured by operators at MySQL/infrastructure layer, with encryption, PITR/binlogs, restore drills, retained recovery points and offsite copy. Built-in offline `.db` backup does NOT backup server.
8. **Online risks remaining:** MVP excludes MFA, security assessment/penetration testing, rate-limiting for all actions, WAF, HA, central SIEM, signed release, server-side attachment scans/storage, granular per-action permissions and end-to-end performance testing. **This is not a production security certification.**

## Data flow

- Offline Desktop: `Electron UI → electron/storage.cjs → local SQLite`. No automatic sync.
- Online Desktop: `Electron UI → IPC allowlist → electron/remote.cjs (HTTPS, token in memory) → /api/v1/dispatch → PHP Auth/Api → MySQL`.
- Browser: `React UI (same bundle) → same-origin fetch with CSRF + HttpOnly PHP session → /api/v1/dispatch → MySQL`.
- Desktop configuration only stores HTTPS server URL + enabled flag. Switching online/offline never merges, uploads or overwrites local SQLite.
- Data views refresh after updates, or by explicit refresh. Browser/server use one authoritative database, but *real-time push notifications and offline edit queue are not implemented*.

## Required release gates before production

- Independent OWASP ASVS/API Top 10 security review (including BOLA/IDOR tests on every endpoint and object).
- MFA (prefer phishing-resistant passkeys for SYS/MANAGER), account recovery, per-device session revocation, anomaly alerting.
- Database backups tested in restore drills; MySQL separate DB user without DDL privilege for API runtime; patch and restore playbook.
- HTTPS certificate monitoring, DNS security, IP access controls/VPN for administrative features where possible, reverse proxy WAF and strict rate limits.
- File upload security: size/extension/MIME/content validation, AV scanning, path traversal protections, private file storage with permission checks.
- Automated integration tests against MySQL for all roles/site separation, concurrent updates, secure bootstrap; human user acceptance and load tests.
- Third-party dependency auditing, signed installers, secrets review and protected branches on GitHub.

**Emergency admin unlock:** only through `php server/bin/unlock-account.php` on a trusted server shell. Never expose password reset/unlock over public unauthenticated HTTP.