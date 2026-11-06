<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/app/Api.php';

secureHeaders();
$requestId=bin2hex(random_bytes(8));
header('X-Request-ID: '.$requestId);
try {
    enforceHttps();
    $path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH);
    if($path==='/' && ($_SERVER['REQUEST_METHOD']??'')==='GET'){
        header('Location: /app/',true,302);exit;
    }
    if($path==='/api/v1/health' && ($_SERVER['REQUEST_METHOD']??'')==='GET'){
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok'=>true,'service'=>'Lotus IT API','version'=>'0.6.2']);exit;
    }
    if(!in_array($path,['/api/v1/dispatch','/api/v1/csrf'],true))throw new ApiError('Not found',404);
    $auth=new Auth();
    if($path==='/api/v1/csrf'){
        if($_SERVER['REQUEST_METHOD']!=='GET')throw new ApiError('Method not allowed',405);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['csrf'=>$auth->csrf()],JSON_THROW_ON_ERROR);exit;
    }
    if($_SERVER['REQUEST_METHOD']!=='POST')throw new ApiError('Method not allowed',405);
    $type=strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]));
    if($type!=='application/json')throw new ApiError('Only application/json is accepted',415);
    $size=(int)($_SERVER['CONTENT_LENGTH']??0);
    if($size>256*1024)throw new ApiError('Request too large',413);
    $raw=file_get_contents('php://input',false,null,0,256*1024+1);
    if($raw===false||strlen($raw)>256*1024)throw new ApiError('Request too large',413);
    $body=json_decode($raw,true,32,JSON_THROW_ON_ERROR);
    if(!is_array($body)||!is_string($body['action']??null)||!is_array($body['payload']??[]))throw new ApiError('Invalid request',422);
    $action=$body['action'];
    // Unauthenticated desktop login is JSON + a non-simple custom header, with no CORS enabled.
    if(!(($_SERVER['HTTP_X_LOTUS_CLIENT']??'')==='desktop' && $action==='auth.login'))$auth->checkCsrf();
    $api=new Api($auth);
    $result=$api->run($action,$body['payload']??[]);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok'=>true,'result'=>$result],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
} catch(ApiError $e) {
    http_response_code($e->httpStatus);header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok'=>false,'error'=>$e->getMessage(),'requestId'=>$requestId],JSON_THROW_ON_ERROR);
} catch(Throwable $e) {
    // Real errors go to server log only; never leak SQL, filesystem paths, tokens or stack traces.
    error_log('[Lotus API] '.$requestId.' '.$e::class.' '.$e->getMessage());
    http_response_code(500);header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok'=>false,'error'=>'Internal server error','requestId'=>$requestId]);
}
