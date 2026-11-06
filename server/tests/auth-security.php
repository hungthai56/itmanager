<?php
declare(strict_types=1);
// Creates disposable fixtures and a localhost HTTP server. Never run against a live database.
if (PHP_SAPI!=='cli') exit(1);
if (getenv('LOTUS_TEST_DATABASE')!=='1') {
    fwrite(STDERR,"Set LOTUS_TEST_DATABASE=1 only for an isolated test database.\n");
    exit(1);
}
require_once dirname(__DIR__).'/app/Api.php';

function securityOk(bool $condition,string $message): void {
    if (!$condition)throw new RuntimeException('FAIL '.$message);
    echo 'OK '.$message."\n";
}
function securityDeny(callable $operation,int $status): void {
    try {$operation();}catch(ApiError $e) {
        if ($e->httpStatus===$status)return;
        throw new RuntimeException('Expected HTTP '.$status.', received '.$e->httpStatus);
    }
    throw new RuntimeException('Expected HTTP '.$status.', operation succeeded');
}
function securityDesktop(string $username,string $password): array {
    $_SERVER['REMOTE_ADDR']='127.0.0.1';
    $_SERVER['HTTP_X_LOTUS_CLIENT']='desktop';
    unset($_SERVER['HTTP_AUTHORIZATION']);
    $login=(new Auth())->login($username,$password,true);
    $_SERVER['HTTP_AUTHORIZATION']='Bearer '.$login['bearerToken'];
    $auth=new Auth();
    return [$auth,new Api($auth),$login['bearerToken']];
}
function securityHttp(string $base,array &$client,string $path,?array $body=null,?string $origin=null): array {
    $headers=['Accept: application/json','Connection: close'];
    if ($client['cookies']) {
        $pairs=[];
        foreach ($client['cookies'] as $name=>$value)$pairs[]=$name.'='.$value;
        $headers[]='Cookie: '.implode('; ',$pairs);
    }
    if ($body!==null) {
        $headers[]='Content-Type: application/json';
        $headers[]='X-CSRF-Token: '.($client['csrf']??'');
        $headers[]='Origin: '.($origin??$base);
    }
    $options=['method'=>$body===null?'GET':'POST','header'=>implode("\r\n",$headers),
        'ignore_errors'=>true,'follow_location'=>0,'timeout'=>5];
    if ($body!==null)$options['content']=json_encode($body,JSON_THROW_ON_ERROR);
    $raw=@file_get_contents($base.$path,false,stream_context_create(['http'=>$options]));
    if ($raw===false)throw new RuntimeException('Local HTTP request failed');
    $responseHeaders=$http_response_header??[];
    $status=0;
    foreach ($responseHeaders as $header) {
        if (preg_match('/^HTTP\/\S+ (\d{3})/',$header,$m))$status=(int)$m[1];
        if (preg_match('/^Set-Cookie:\s*([^=;]+)=([^;]*)/i',$header,$m))$client['cookies'][$m[1]]=$m[2];
    }
    return ['status'=>$status,'body'=>json_decode($raw,true,32,JSON_THROW_ON_ERROR)];
}
function securityDispatch(string $base,array &$client,string $action,array $payload=[],?string $origin=null): array {
    return securityHttp($base,$client,'/api/v1/dispatch',['action'=>$action,'payload'=>$payload],$origin);
}
function securityWebLogin(string $base,array &$client,string $username,string $password): array {
    $csrf=securityHttp($base,$client,'/api/v1/csrf');
    if ($csrf['status']!==200||!is_string($csrf['body']['csrf']??null))throw new RuntimeException('Cannot obtain web CSRF token');
    $client['csrf']=$csrf['body']['csrf'];
    $response=securityDispatch($base,$client,'auth.login',['username'=>$username,'password'=>$password]);
    if ($response['status']!==200||!($response['body']['result']['status']['authenticated']??false))throw new RuntimeException('Web fixture login failed');
    $client['csrf']=$response['body']['result']['csrf'];
    return $response['body']['result']['status'];
}

$suffix=bin2hex(random_bytes(6));
$siteId=uuid();$forcedId=uuid();$webId=uuid();
$forcedName='sec_forced_'.$suffix;$webName='sec_web_'.$suffix;
$password='Fixture_'.bin2hex(random_bytes(12));
$changedPassword='Changed_'.bin2hex(random_bytes(12));
$resetPassword='Reset_'.bin2hex(random_bytes(12));
$finalPassword='Final_'.bin2hex(random_bytes(12));
$userIds=[$forcedId,$webId];$throttleNames=[$forcedName,$webName];
$timezone=date_default_timezone_get();
$process=null;$tempDir=null;

try {
    transactional(function()use($siteId,$forcedId,$webId,$forcedName,$webName,$password,$suffix){
        query('INSERT INTO sites(id,code,name,currency) VALUES (?,?,?,?)',[$siteId,'SEC_'.$suffix,'Security test fixture','VND']);
        foreach ([[$forcedId,$forcedName,1],[$webId,$webName,0]] as [$id,$name,$force]) {
            query("INSERT INTO users(id,username,full_name,role,password_hash,force_reset,default_site_id) VALUES (?,?,?,'SYS',?,?,?)",
                [$id,$name,'Security test user',password_hash($password,PASSWORD_ARGON2ID),$force,$siteId]);
            query('INSERT INTO user_sites(user_id,site_id) VALUES (?,?)',[$id,$siteId]);
        }
    });

    [$forcedAuth,$forcedApi,$oldToken]=securityDesktop($forcedName,$password);
    securityOk($forcedApi->run('auth.status',[])['user']['forceReset']===true,'forced-reset login reports required password change');
    securityOk($forcedApi->run('app.info',[])['mode']==='server','application metadata remains available before password change');
    securityDeny(fn()=> $forcedAuth->admin(),403);
    foreach (['users.list','users.save','users.password','permissions.get','permissions.save','settings.get','settings.save',
        'sites.list','sites.save','sites.switch','audit.list','records.list','dashboard.get'] as $action) {
        securityDeny(fn()=> $forcedApi->run($action,[]),403);
    }
    securityOk((int)query('SELECT force_reset FROM users WHERE id=?',[$forcedId])->fetch()['force_reset']===1,
        'forced-reset SYS cannot bypass the gate using administrative or site operations');
    $changed=$forcedApi->run('auth.changePassword',['oldPassword'=>$password,'newPassword'=>$changedPassword]);
    securityOk($changed['requiresRelogin']===true,'forced-reset user can change the password');
    $_SERVER['HTTP_AUTHORIZATION']='Bearer '.$oldToken;
    securityDeny(fn()=> (new Api(new Auth()))->run('users.list',[]),401);
    [$adminAuth,$adminApi]=securityDesktop($forcedName,$changedPassword);
    securityOk(count($adminApi->run('users.list',[]))>=2,'administration works after changing password and signing in again');

    foreach (['UTC','Asia/Ho_Chi_Minh','America/New_York'] as $index=>$testTimezone) {
        date_default_timezone_set($testTimezone);
        $missing='sec_missing_'.$index.'_'.$suffix;$throttleNames[]=$missing;
        unset($_SERVER['HTTP_AUTHORIZATION']);
        for ($attempt=0;$attempt<20;$attempt++)securityDeny(fn()=> (new Auth())->login($missing,$password,true),401);
        securityDeny(fn()=> (new Auth())->login($missing,$password,true),429);
        $fingerprint=hash('sha256','127.0.0.1|'.$missing);
        securityOk((int)query('SELECT attempts FROM login_throttle WHERE fingerprint=?',[$fingerprint])->fetch()['attempts']===20,
            'login throttle enforces its limit in '.$testTimezone);
        query('UPDATE login_throttle SET window_start=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 16 MINUTE) WHERE fingerprint=?',[$fingerprint]);
        securityDeny(fn()=> (new Auth())->login($missing,$password,true),401);
        securityOk((int)query('SELECT attempts FROM login_throttle WHERE fingerprint=?',[$fingerprint])->fetch()['attempts']===1,
            'expired login throttle starts a new window in '.$testTimezone);
    }
    date_default_timezone_set($timezone);

    $tempDir=sys_get_temp_dir().'/lotus-auth-security-'.$suffix;
    if (!mkdir($tempDir,0700))throw new RuntimeException('Cannot create isolated HTTP session directory');
    $listener=stream_socket_server('tcp://127.0.0.1:0',$socketError,$socketMessage);
    if ($listener===false)throw new RuntimeException('Cannot reserve a localhost test port');
    $address=stream_socket_get_name($listener,false);fclose($listener);
    $base='http://'.$address;
    $environment=getenv();$environment['LOTUS_ALLOW_HTTP_LOCALHOST']='1';
    unset($environment['PHP_CLI_SERVER_WORKERS']);
    $command=[PHP_BINARY,'-d','session.save_path='.$tempDir,'-d','session.serialize_handler=php_serialize',
        '-S',$address,'-t',dirname(__DIR__).'/public',__DIR__.'/router.php'];
    $process=proc_open($command,[0=>['pipe','r'],1=>['file',$tempDir.'/http.log','a'],2=>['file',$tempDir.'/http.log','a']],$pipes,null,$environment);
    if (!is_resource($process))throw new RuntimeException('Cannot start localhost PHP test server');
    fclose($pipes[0]);
    $ready=false;$deadline=microtime(true)+5;
    do {
        $connection=@stream_socket_client('tcp://'.$address,$socketError,$socketMessage,0.1);
        if ($connection!==false){fclose($connection);$ready=true;break;}
        usleep(20000);
    } while (microtime(true)<$deadline);
    if (!$ready)throw new RuntimeException('Localhost PHP test server did not start');

    $clientA=['cookies'=>[]];$clientB=['cookies'=>[]];$legacy=['cookies'=>[]];
    $status=securityWebLogin($base,$clientA,$webName,$password);
    securityWebLogin($base,$clientB,$webName,$password);
    securityOk(!array_key_exists('password_fingerprint',$status['user'])&&!array_key_exists('password_hash',$status['user']),
        'web authentication does not expose the server-side password stamp');
    securityOk(securityDispatch($base,$clientA,'users.list')['status']===200
        &&securityDispatch($base,$clientB,'users.list')['status']===200,'two independent browser sessions can access the API');

    $savedCsrf=$clientA['csrf'];$clientA['csrf']=str_repeat('0',64);
    securityOk(securityDispatch($base,$clientA,'users.list')['status']===403,'web API rejects a wrong CSRF token');
    $clientA['csrf']=$savedCsrf;
    securityOk(securityDispatch($base,$clientA,'users.list',[],'https://wrong-origin.example')['status']===403,
        'web API rejects a foreign Origin even with a valid CSRF token');

    securityWebLogin($base,$legacy,$webName,$password);
    $legacySession=$legacy['cookies']['lotus_dev_session']??'';
    if (!preg_match('/^[A-Za-z0-9,-]+$/D',$legacySession))throw new RuntimeException('Missing isolated test session identifier');
    $legacyFile=$tempDir.'/sess_'.$legacySession;
    $legacyData=unserialize((string)file_get_contents($legacyFile),['allowed_classes'=>false]);
    if (!is_array($legacyData))throw new RuntimeException('Cannot read isolated legacy-session fixture');
    unset($legacyData['password_fingerprint']);
    file_put_contents($legacyFile,serialize($legacyData));
    securityOk(securityDispatch($base,$legacy,'users.list')['status']===401,'sessions created without a password stamp must sign in again');

    $response=securityDispatch($base,$clientA,'auth.changePassword',['oldPassword'=>$password,'newPassword'=>$changedPassword]);
    securityOk($response['status']===200&&($response['body']['result']['requiresRelogin']??false),
        'browser password change requires a new login');
    securityOk(securityDispatch($base,$clientA,'users.list')['status']===401,'password change invalidates the current browser session');
    securityOk(securityDispatch($base,$clientB,'users.list')['status']===401,'password change invalidates another PC browser session');

    securityWebLogin($base,$clientA,$webName,$changedPassword);
    securityWebLogin($base,$clientB,$webName,$changedPassword);
    $adminApi->run('users.password',['userId'=>$webId,'password'=>$resetPassword]);
    securityOk(securityDispatch($base,$clientA,'users.list')['status']===401
        &&securityDispatch($base,$clientB,'users.list')['status']===401,'administrator reset invalidates every existing browser session');

    $resetClient=['cookies'=>[]];
    $status=securityWebLogin($base,$resetClient,$webName,$resetPassword);
    securityOk($status['user']['forceReset']===true,'browser login with a reset password requires a password change');
    securityOk(securityDispatch($base,$resetClient,'users.save')['status']===403
        &&securityDispatch($base,$resetClient,'records.list',['siteId'=>$siteId,'module'=>'tasks'])['status']===403,
        'forced-reset browser cannot perform administrative or module operations');
    $response=securityDispatch($base,$resetClient,'auth.changePassword',['oldPassword'=>$resetPassword,'newPassword'=>$finalPassword]);
    securityOk($response['status']===200,'forced-reset browser can complete the password change');
    securityWebLogin($base,$resetClient,$webName,$finalPassword);
    securityOk(securityDispatch($base,$resetClient,'users.list')['status']===200,'browser access resumes after changing the reset password and signing in again');
    echo "All authentication security regression checks passed.\n";
} finally {
    date_default_timezone_set($timezone);
    if (is_resource($process)){proc_terminate($process);proc_close($process);}
    if ($tempDir!==null&&is_dir($tempDir)) {
        foreach (glob($tempDir.'/*')?:[] as $file)unlink($file);
        rmdir($tempDir);
    }
    foreach ($userIds as $id) {
        query('DELETE FROM audit WHERE user_id=?',[$id]);
        query('DELETE FROM users WHERE id=?',[$id]);
    }
    query('DELETE FROM sites WHERE id=?',[$siteId]);
    foreach ($throttleNames as $name)query('DELETE FROM login_throttle WHERE fingerprint=?',[hash('sha256','127.0.0.1|'.$name)]);
}
