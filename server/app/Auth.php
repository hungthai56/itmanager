<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';

final class Auth {
    private ?array $principal = null;
    private ?string $bearerHash = null;
    public const MODULES = ['tasks','checklists','roster','inventory','contracts','pl','capex','projects','knowledge'];
    private const READ = ['SYS'=>self::MODULES,'MANAGER'=>self::MODULES,'SUPERVISOR'=>self::MODULES,
        'STAFF'=>['tasks','checklists','roster','inventory','contracts','projects','knowledge']];
    private const WRITE = ['SYS'=>self::MODULES,'MANAGER'=>self::MODULES,
        'SUPERVISOR'=>['tasks','checklists','roster','inventory','contracts','projects','knowledge'],
        'STAFF'=>['tasks','checklists','roster','knowledge']];
    private bool $desktop = false;

    public function __construct() {
         $bearer = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (($_SERVER['HTTP_X_LOTUS_CLIENT']??'')==='desktop' && !preg_match('/^Bearer ([a-f0-9]{64})$/Di', $bearer)) {
            $this->desktop=true; // Unauthenticated desktop login. No cookie session is created.
        } elseif (preg_match('/^Bearer ([a-f0-9]{64})$/Di', $bearer, $m)) {
            $this->desktop=true;
            $this->bearerHash=hash('sha256',strtolower($m[1]));
            $record=query('SELECT u.* FROM access_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND t.expires_at>UTC_TIMESTAMP(6) AND u.active=1 AND u.account_locked=0',[$this->bearerHash])->fetch();
            $this->principal=$record ?: null;
        } else if (!$this->desktop) {
            ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');
            ini_set('session.cookie_httponly','1');
            session_name((getenv('LOTUS_ALLOW_HTTP_LOCALHOST')==='1'&&in_array($_SERVER['REMOTE_ADDR']??'', ['127.0.0.1','::1'],true))?'lotus_dev_session':'__Host-lotus_session');
            session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>!(getenv('LOTUS_ALLOW_HTTP_LOCALHOST')==='1' && in_array($_SERVER['REMOTE_ADDR']??'', ['127.0.0.1','::1'],true)),'httponly'=>true,'samesite'=>'Strict']);
            session_start();
            if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
            if (isset($_SESSION['user_id'],$_SESSION['last_active']) && (time()-(int)$_SESSION['last_active'] <= 8*3600)) {
                $u=query('SELECT * FROM users WHERE id=? AND active=1 AND account_locked=0',[$_SESSION['user_id']])->fetch();
                $this->principal=$u ?: null;
                $_SESSION['last_active']=time();
            }
            if (!$this->principal) unset($_SESSION['user_id']);
            if (isset($_SESSION['rotated']) && time()-$_SESSION['rotated']>1800) {
                session_regenerate_id(true);$_SESSION['rotated']=time();
            }
        }
    }
    public function desktop(): bool {return $this->desktop;}
    public function csrf(): string {return (string)($_SESSION['csrf']??'');}
    public function checkCsrf(): void {
        if ($this->desktop)return;
        $header=$_SERVER['HTTP_X_CSRF_TOKEN']??'';
        if (!is_string($header) || !hash_equals($this->csrf(),$header)) throw new ApiError('CSRF verification failed',403);
        $origin=$_SERVER['HTTP_ORIGIN']??null;
        if ($origin !== null) {
            $host=$_SERVER['HTTP_HOST']??'';
            if ($origin!=='https://'.$host && !(getenv('LOTUS_ALLOW_HTTP_LOCALHOST')==='1' && $origin==='http://'.$host))
                throw new ApiError('Origin denied',403);
        }
    }
    public function principal(): array {
        if (!$this->principal)throw new ApiError('Please sign in',401);
        return $this->principal;
    }
    public function siteList(): array {
        $u=$this->principal();
        if ($u['role']==='SYS')return query('SELECT * FROM sites WHERE active=1 ORDER BY name')->fetchAll();
        return query('SELECT s.* FROM sites s JOIN user_sites us ON s.id=us.site_id WHERE us.user_id=? AND s.active=1 ORDER BY s.name',[$u['id']])->fetchAll();
    }
    public function site(string $siteId): void {
        if ($siteId==='' || !array_filter($this->siteList(),static fn($x)=>$x['id']===$siteId))throw new ApiError('Access denied to this site',403);
    }
    public function module(string $module,string $siteId,string $mode): void {
        $this->site($siteId);
        $u=$this->principal();
        if (!in_array($module,self::MODULES,true)||!in_array($mode,['read','write'],true))throw new ApiError('Invalid module',422);
        if ($u['force_reset'])throw new ApiError('Password change required',403);
        if ($u['role']==='SYS')return;
        $o=jsonArray($u['overrides'])[$module][$mode]??null;
        if ($o==='deny')throw new ApiError('Permission denied',403);
        if ($o==='allow')return;
        $p=query('SELECT can_read,can_write FROM role_permissions WHERE role=? AND module=?',[$u['role'],$module])->fetch();
        $permitted=$p ? (bool)$p[$mode==='read'?'can_read':'can_write'] : in_array($module,$mode==='read'?self::READ[$u['role']]:self::WRITE[$u['role']],true);
        if (!$permitted)throw new ApiError('Permission denied',403);
    }
    public function manageRecord(array $row,string $module): void {
        $u=$this->principal();
        if (in_array($u['role'],['SYS','MANAGER'],true)||$row['created_by']===$u['id'])return;
        if ($u['role']==='STAFF')throw new ApiError('You cannot change this record',403);
        if ($module!=='tasks' && $u['role']==='SUPERVISOR')return;
        if ($u['role']==='SUPERVISOR') {
            $owner=query('SELECT role,report_to FROM users WHERE id=?',[$row['created_by']])->fetch();
            if ($owner && $owner['role']==='STAFF' && $owner['report_to']===$u['id'])return;
            $details=jsonArray($row['data']);$assigned=strtolower(trim((string)($details['assignedTo']??'')));
            if ($assigned!=='') {
                $members=query("SELECT id,username,full_name FROM users WHERE role='STAFF' AND report_to=?",[$u['id']])->fetchAll();
                foreach ($members as $person)if (in_array($assigned,[strtolower($person['id']),strtolower($person['username']),strtolower($person['full_name'])],true))return;
            }
        }
        throw new ApiError('You cannot change this record',403);
    }
    public function admin(): void { if ($this->principal()['role']!=='SYS')throw new ApiError('System admin required',403); }
    public function status(): array {
        if (!$this->principal)return ['authenticated'=>false,'ready'=>true];
        $u=$this->principal();
        $sites=$this->siteList();
        $siteId=(string)($this->desktop ? ($GLOBALS['lotusRemoteSiteId']??$u['default_site_id']) : ($_SESSION['site_id']??$u['default_site_id']));
        if (!array_filter($sites,static fn($x)=>$x['id']===$siteId))$siteId=$sites[0]['id']??'';
        return ['authenticated'=>true,'ready'=>true,'user'=>['id'=>$u['id'],'username'=>$u['username'],'name'=>$u['full_name'],
            'role'=>$u['role'],'siteId'=>$siteId,'forceReset'=>(bool)$u['force_reset'],'overrides'=>jsonArray($u['overrides'])],
            'sites'=>$sites];
    }
    public function login(string $username,string $password,bool $desktopRequest): array {
        $username=strtolower(trim($username));
        if (!preg_match('/^[a-z0-9._-]{1,100}$/D',$username)||strlen($password)>1024)throw new ApiError('Invalid credentials',401);
        $remote=$_SERVER['REMOTE_ADDR']??'';
        $finger=hash('sha256',$remote.'|'.$username);
         $result=transactional(function()use($username,$password,$finger,$desktopRequest){
            $throttle=query('SELECT * FROM login_throttle WHERE fingerprint=? FOR UPDATE',[$finger])->fetch();
            if ($throttle && (strtotime($throttle['window_start'])+900)>time() && (int)$throttle['attempts']>=20)
                throw new ApiError('Too many requests',429);
            if (!$throttle || strtotime($throttle['window_start'])+900<=time())query('INSERT INTO login_throttle (fingerprint,attempts,window_start) VALUES (?,0,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE attempts=0,window_start=UTC_TIMESTAMP(6)',[$finger]);
            query('UPDATE login_throttle SET attempts=attempts+1 WHERE fingerprint=?',[$finger]);
            $u=query('SELECT * FROM users WHERE username=? FOR UPDATE',[$username])->fetch();
            if (!$u || !$u['active'] || $u['account_locked']) {
                audit($u?:null,'LOGIN_DENIED',null,['reason'=>'invalid']);
                return ['error'=>'Invalid credentials or account locked','http'=>401];
            }
            if (!password_verify($password,$u['password_hash'])) {
                $attempts=(int)$u['failed_attempts']+1;
                query('UPDATE users SET failed_attempts=?,account_locked=? WHERE id=?',[min(5,$attempts),$attempts>=5?1:0,$u['id']]);
                audit($u,'LOGIN_FAILED',null,['locked'=>$attempts>=5]);
                // Return after committing failed counters; exceptions would roll them back.
                return ['error'=>'Invalid credentials','http'=>401];
            }
            query('UPDATE users SET failed_attempts=0 WHERE id=?',[$u['id']]);
            audit($u,'LOGIN', $u['default_site_id']?:null,[]);
            $this->principal=$u;
            if ($desktopRequest) {
                $token=bin2hex(random_bytes(32));
                query('INSERT INTO access_tokens(token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 8 HOUR))',[hash('sha256',$token),$u['id']]);
                return ['bearerToken'=>$token,'status'=>$this->status()];
            }
            session_regenerate_id(true);
            $_SESSION['user_id']=$u['id'];$_SESSION['last_active']=time();$_SESSION['rotated']=time();
            $_SESSION['csrf']=bin2hex(random_bytes(32));
            return ['csrf'=>$_SESSION['csrf'],'status'=>$this->status()];
        });
        if (isset($result['error']))throw new ApiError($result['error'], (int)$result['http']);
        return $result;
    }
    public function logout(): array {
        if ($this->bearerHash)query('UPDATE access_tokens SET revoked_at=UTC_TIMESTAMP(6) WHERE token_hash=?',[$this->bearerHash]);
        if ($this->principal)audit($this->principal,'LOGOUT',null,[]);
        $this->principal=null;
        if (!$this->desktop){$_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));}
        return ['authenticated'=>false];
    }
    public function changePassword(string $old,string $new): array {
        $u=$this->principal();
        if (strlen($new)<12 || !preg_match('/[A-Za-z]/',$new)||!preg_match('/[0-9]/',$new)||strlen($new)>256)throw new ApiError('Password requires at least 12 characters, letters and digits',422);
        if (!password_verify($old,$u['password_hash']))throw new ApiError('Current password is incorrect',403);
        $hash=password_hash($new,PASSWORD_ARGON2ID);
        transactional(function()use($u,$hash){
            query('UPDATE users SET password_hash=?,force_reset=0 WHERE id=?',[$hash,$u['id']]);
            // Revoke other devices immediately. Caller must sign in again after change.
            query('UPDATE access_tokens SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=?',[$u['id']]);
            audit($u,'PASSWORD_CHANGED',null,[]);
        });
        $this->principal=null;if(!$this->desktop){unset($_SESSION['user_id']);}
        return ['success'=>true,'requiresRelogin'=>true];
    }
}