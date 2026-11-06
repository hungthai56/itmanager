<?php
declare(strict_types=1);
// Run only in an ephemeral CI database; this test deliberately creates users and records.
if (PHP_SAPI!=='cli') exit(1);
$_SERVER['REMOTE_ADDR']='127.0.0.1';$_SERVER['HTTP_X_LOTUS_CLIENT']='desktop';
require_once dirname(__DIR__).'/app/Api.php';
function ok(bool $condition,string $message): void { if(!$condition)throw new RuntimeException('FAIL '.$message);echo "OK ".$message."\n"; }
function deny(callable $fn,int $code): void {try{$fn();throw new RuntimeException('FAIL: request unexpectedly succeeded');}catch(ApiError $e){ok($e->httpStatus===$code,'denied with HTTP '.$code);}}
$auth=new Auth();$api=new Api($auth);
$login=$api->run('auth.login',['username'=>'ciadmin','password'=>'CIPassword_123456']);
$token=$login['bearerToken']??'';ok(strlen($token)===64,'desktop has 256-bit opaque credential');
ok(query('SELECT count(*) n FROM access_tokens WHERE token_hash=?',[$token])->fetch()['n']==0,'raw token is never stored');
ok(query('SELECT count(*) n FROM access_tokens WHERE token_hash=?',[hash('sha256',$token)])->fetch()['n']==1,'token hash stored');
$_SERVER['HTTP_AUTHORIZATION']='Bearer '.$token;
$auth=new Auth();$api=new Api($auth);$sites=$api->run('sites.list',[]);$site=$sites[0]['id'];
$other=$api->run('sites.save',['name'=>'Second Hotel','code'=>'SITE2','currency'=>'VND'])['id'];
$asset=$api->run('records.save',['siteId'=>$site,'module'=>'inventory','record'=>['data'=>['assetCode'=>'IT001','name'=>'Switch','status'=>'Active']]]);
$record=$api->run('records.list',['siteId'=>$site,'module'=>'inventory'])[0];ok($record['version']===1,'record has optimistic version');
deny(fn()=> $api->run('records.save',['siteId'=>$site,'module'=>'inventory','record'=>['id'=>$asset['id'],'version'=>0,'data'=>['assetCode'=>'IT001','name'=>'HACKED']]]),409);
$okResult=$api->run('records.save',['siteId'=>$site,'module'=>'inventory','record'=>['id'=>$asset['id'],'version'=>1,'data'=>['assetCode'=>'IT001','name'=>'Updated']]]);
ok($okResult['version']===2,'version increments on edit');
deny(fn()=> $api->run('records.save',['siteId'=>$site,'module'=>'inventory','record'=>['data'=>['assetCode'=>'it001','name'=>'Duplicate']]]),409);
$staff=$api->run('users.save',['username'=>'cistaff','full_name'=>'Staff','role'=>'STAFF','active'=>1,'siteIds'=>[$site],
 'default_site_id'=>$site,'force_reset'=>0,'password'=>'StaffPassword12345']);
$adminId=$auth->principal()['id'];
$adminTask=$api->run('records.save',['siteId'=>$site,'module'=>'tasks','record'=>['data'=>['title'=>'Private manager task','status'=>'Open']]])['id'];

$proj=$api->run('records.save',['siteId'=>$site,'module'=>'projects','record'=>['data'=>['name'=>'Wi-Fi upgrade','progress'=>0]]])['id'];
$sub=$api->run('project.tasks.save',['siteId'=>$site,'projectId'=>$proj,'task'=>['title'=>'Audit','status'=>'Not Started']])['id'];
$tasks=$api->run('project.tasks.list',['siteId'=>$site,'projectId'=>$proj]);
ok((int)$tasks[0]['version']===1,'project subtask starts at version 1');
deny(fn()=> $api->run('project.tasks.save',['siteId'=>$site,'projectId'=>$proj,'task'=>['id'=>$sub,'version'=>0,'title'=>'Audit','status'=>'Done']]),409);
$api->run('project.tasks.save',['siteId'=>$site,'projectId'=>$proj,'task'=>['id'=>$sub,'version'=>1,'title'=>'Audit','status'=>'Done']]);
ok((int)$api->run('project.tasks.list',['siteId'=>$site,'projectId'=>$proj])[0]['version']===2,'subtask version protected');
$contract=$api->run('records.save',['siteId'=>$site,'module'=>'contracts','record'=>['data'=>['name'=>'Leased line','contractNo'=>'WAN-1','endDate'=>'2026-12-31']]])['id'];
$add=$api->run('contract.addenda.save',['siteId'=>$site,'contractId'=>$contract,'addendum'=>['addendum_no'=>'A1','new_end_date'=>'2027-12-31']])['id'];
$addInfo=$api->run('contract.addenda.list',['siteId'=>$site,'contractId'=>$contract])[0];
ok((int)$addInfo['version']===1,'contract addendum starts at version 1');
deny(fn()=> $api->run('contract.addenda.save',['siteId'=>$site,'contractId'=>$contract,'addendum'=>['id'=>$add,'version'=>0,'addendum_no'=>'A1','new_end_date'=>'2028-12-31']]),409);
$api->run('contract.addenda.save',['siteId'=>$site,'contractId'=>$contract,'addendum'=>['id'=>$add,'version'=>1,'addendum_no'=>'A1','new_end_date'=>'2028-12-31']]);
ok($api->run('records.list',['siteId'=>$site,'module'=>'contracts'])[0]['effectiveEndDate']==='2028-12-31','contract effective end from latest addendum');

$auth->logout();unset($_SERVER['HTTP_AUTHORIZATION']);
$auth2=new Auth();$login2=$auth2->login('cistaff','StaffPassword12345',true);$_SERVER['HTTP_AUTHORIZATION']='Bearer '.$login2['bearerToken'];
$auth3=new Auth();$api3=new Api($auth3);
deny(fn()=> $api3->run('records.list',['siteId'=>$other,'module'=>'tasks']),403);
deny(fn()=> $api3->run('records.save',['siteId'=>$site,'module'=>'tasks','record'=>['id'=>$adminTask,'version'=>1,'data'=>['title'=>'Edited by staff','status'=>'Done']]]),403);
deny(fn()=> $api3->run('users.list',[]),403);
$staffTask=$api3->run('records.save',['siteId'=>$site,'module'=>'tasks','record'=>['data'=>['title'=>'Own work','status'=>'Open']]])['id'];
$api3->run('records.batchStatus',['siteId'=>$site,'module'=>'tasks','ids'=>[$staffTask],'status'=>'Done']);
$taskRows=$api3->run('records.list',['siteId'=>$site,'module'=>'tasks']);
ok(count(array_filter($taskRows,fn($r)=>$r['id']===$staffTask&&$r['data']['status']==='Done'))===1,'staff modifies own records');
$auth3->logout();ok(true,'all server DB integration checks passed');