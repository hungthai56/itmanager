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

// A stale screen must never delete another operator's updated parent or its children.
foreach (['projects'=>['name'=>'Delete regression project','progress'=>0],
          'contracts'=>['name'=>'Delete regression contract','endDate'=>'2027-12-31']] as $module=>$data) {
    $parent=$api->run('records.save',['siteId'=>$site,'module'=>$module,'record'=>['data'=>$data]]);
    $parentId=$parent['id'];
    if($module==='projects') {
        $api->run('project.tasks.save',['siteId'=>$site,'projectId'=>$parentId,'task'=>['title'=>'Retain until current delete','status'=>'Not Started']]);
        $childTable='project_tasks';$parentColumn='project_id';
    } else {
        $api->run('contract.addenda.save',['siteId'=>$site,'contractId'=>$parentId,'addendum'=>['addendum_no'=>'DELETE-REGRESSION','new_end_date'=>'2028-12-31']]);
        $childTable='contract_addenda';$parentColumn='contract_id';
    }
    $current=$api->run('records.save',['siteId'=>$site,'module'=>$module,'record'=>[
        'id'=>$parentId,'version'=>$parent['version'],'data'=>[...$data,'name'=>'Updated by another operator']]]);
    $before=query('SELECT * FROM records WHERE id=?',[$parentId])->fetch();
    $children=query("SELECT * FROM $childTable WHERE $parentColumn=? ORDER BY id",[$parentId])->fetchAll();
    $history=query('SELECT * FROM record_history WHERE record_id=? ORDER BY id',[$parentId])->fetchAll();
    $deleteAuditCount=(int)query("SELECT COUNT(*) AS n FROM audit WHERE action='RECORD_DELETE' AND JSON_UNQUOTE(JSON_EXTRACT(details,'$.id'))=?",[$parentId])->fetch()['n'];
    foreach ([[],['version'=>$parent['version']]] as $versionPayload) {
        deny(fn()=> $api->run('records.delete',[...$versionPayload,'siteId'=>$site,'module'=>$module,'id'=>$parentId]),409);
        ok(query('SELECT * FROM records WHERE id=?',[$parentId])->fetch()===$before,"$module parent unchanged after rejected delete");
        ok(query("SELECT * FROM $childTable WHERE $parentColumn=? ORDER BY id",[$parentId])->fetchAll()===$children,"$module children unchanged after rejected delete");
        ok(query('SELECT * FROM record_history WHERE record_id=? ORDER BY id',[$parentId])->fetchAll()===$history,"$module history unchanged after rejected delete");
        ok((int)query("SELECT COUNT(*) AS n FROM audit WHERE action='RECORD_DELETE' AND JSON_UNQUOTE(JSON_EXTRACT(details,'$.id'))=?",[$parentId])->fetch()['n']===$deleteAuditCount,"$module rejected delete has no success audit");
    }
    $api->run('records.delete',['siteId'=>$site,'module'=>$module,'id'=>$parentId,'version'=>$current['version']]);
    ok(!query('SELECT id FROM records WHERE id=?',[$parentId])->fetch(),"$module current version can be deleted");
    ok(query("SELECT * FROM $childTable WHERE $parentColumn=?",[$parentId])->fetchAll()===[],"$module current delete removes children");
    $deletedHistory=query("SELECT * FROM record_history WHERE record_id=? AND action='DELETE'",[$parentId])->fetchAll();
    ok(count($deletedHistory)===1&&jsonArray($deletedHistory[0]['before_data'])===jsonArray($before['data']),"$module delete records the latest data in history");
}

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
