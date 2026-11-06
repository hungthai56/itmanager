<?php
declare(strict_types=1);

// Never place secrets in the web document root. Use environment variables or server/config.local.php (gitignored).
if (is_file(dirname(__DIR__).'/config.local.php')) {
    require_once dirname(__DIR__).'/config.local.php';
}

function db(): PDO {
    static $db = null;
    if ($db !== null) return $db;
    $host = getenv('LOTUS_DB_HOST') ?: '127.0.0.1';
    $name = getenv('LOTUS_DB_NAME') ?: '';
    $user = getenv('LOTUS_DB_USER') ?: '';
    $pass = getenv('LOTUS_DB_PASSWORD');
    if ($name === '' || $user === '' || $pass === false) throw new RuntimeException('Database configuration is missing');
    $port = (int)(getenv('LOTUS_DB_PORT') ?: '3306');
    $dsn = 'mysql:host='.$host.';port='.$port.';dbname='.$name.';charset=utf8mb4';
    $db = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $db->exec("SET time_zone = '+00:00'");
    return $db;
}
function query(string $sql, array $params = []): PDOStatement {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}
function uuid(): string {
    $a = bin2hex(random_bytes(16));
    $a[12] = '4'; $a[16] = dechex((hexdec($a[16]) & 3) | 8);
    return substr($a,0,8).'-'.substr($a,8,4).'-'.substr($a,12,4).'-'.substr($a,16,4).'-'.substr($a,20);
}
function utc(): string { return gmdate('Y-m-d H:i:s'); }
function fail(int $code, string $message): never { http_response_code($code); throw new ApiError($message, $code); }
class ApiError extends RuntimeException {
    public function __construct(string $message, public readonly int $httpStatus = 400) { parent::__construct($message); }
}
function assertString(mixed $v, int $max = 200): string {
    if (!is_string($v) || strlen($v) > $max) throw new ApiError('Invalid input', 422);
    return trim($v);
}
function assertDate(mixed $date): ?string {
    if ($date === '' || $date === null) return null;
    if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date)) throw new ApiError('Invalid date',422);
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('UTC'));
    if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new ApiError('Invalid date',422);
    return $date;
}
function audit(?array $user, string $action, ?string $siteId, array $details = []): void {
    query('INSERT INTO audit (id,user_id,username,action,site_id,details,ip_address) VALUES (?,?,?,?,?,?,?)', [
        uuid(), $user['id'] ?? null, $user['username'] ?? 'unknown', $action, $siteId,
        json_encode($details, JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),
        substr((string)($_SERVER['REMOTE_ADDR'] ?? ''),0,45),
    ]);
}
function jsonValue(mixed $v): string { return json_encode($v,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE); }
function jsonArray(?string $v): array {
    $decoded = json_decode($v ?? '{}', true);
    return is_array($decoded) ? $decoded : [];
}
function transactional(callable $fn): mixed {
    $db=db();$db->beginTransaction();
    try { $result=$fn();$db->commit();return $result; }
    catch (Throwable $e) { if ($db->inTransaction())$db->rollBack();throw $e; }
}
function secureHeaders(): void {
    header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');header('Cache-Control: no-store, private');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    header('Permissions-Policy: camera=(),microphone=(),geolocation=()');
    if (($_SERVER['HTTPS'] ?? '') === 'on') header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}
function enforceHttps(): void {
    // Configure HTTPS at the reverse proxy. Never trust client-supplied X-Forwarded-* headers.
    $ssl = ($_SERVER['HTTPS']??'') === 'on';
    $local = in_array($_SERVER['REMOTE_ADDR']??'', ['127.0.0.1','::1'],true)
        && (getenv('LOTUS_ALLOW_HTTP_LOCALHOST') === '1');
    if (!$ssl && !$local) throw new ApiError('HTTPS is required',403);
}