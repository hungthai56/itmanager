<?php
declare(strict_types=1);
// Destructive regression test. Never run against operational data.
if(PHP_SAPI!=='cli'||getenv('LOTUS_TEST_DATABASE')!=='1'||getenv('LOTUS_DB_NAME')!=='lotus_ci') {
    fwrite(STDERR,"Requires LOTUS_TEST_DATABASE=1 and a disposable lotus_ci database.\n");exit(2);
}
$_SERVER['REMOTE_ADDR']='127.0.0.1';$_SERVER['HTTP_X_LOTUS_CLIENT']='desktop';
require_once dirname(__DIR__).'/app/Api.php';

if(($argv[1]??'')==='--worker') {
    try {
        $input=json_decode((string)fgets(STDIN),true,512,JSON_THROW_ON_ERROR);
        $_SERVER['HTTP_AUTHORIZATION']='Bearer '.$input['token'];
        $api=new Api(new Auth());
        query('SET SESSION innodb_lock_wait_timeout=20');
        echo jsonValue(['ready'=>(int)query('SELECT CONNECTION_ID() AS id')->fetch()['id']])."\n";flush();
        $api->run($input['action'],$input['payload']);
        echo jsonValue(['http'=>200])."\n";
    } catch(ApiError $e) {
        echo jsonValue(['http'=>$e->httpStatus])."\n";
    } catch(Throwable $e) {
        echo jsonValue(['http'=>500,'errorType'=>get_class($e)])."\n";
    }
    exit;
}

function check(bool $condition,string $message): void {
    if(!$condition)throw new RuntimeException('FAIL '.$message);
    echo 'OK '.$message."\n";
}
function workerMessage($pipe,string &$buffer): array {
    $deadline=microtime(true)+15;
    do {
        $buffer.=(string)stream_get_contents($pipe);
        $newline=strpos($buffer,"\n");
        if($newline!==false) {
            $line=substr($buffer,0,$newline);$buffer=substr($buffer,$newline+1);
            return json_decode($line,true,512,JSON_THROW_ON_ERROR);
        }
        if(feof($pipe))throw new RuntimeException('Worker exited without a result');
        $read=[$pipe];$write=null;$except=null;stream_select($read,$write,$except,0,100000);
    } while(microtime(true)<$deadline);
    throw new RuntimeException('Worker result timed out');
}
function awaitBlockedMutation(int $connectionId,$pipe,string &$buffer): void {
    $deadline=microtime(true)+10;
    do {
        $buffer.=(string)stream_get_contents($pipe);
        if(str_contains($buffer,"\n")||feof($pipe))throw new RuntimeException('Child mutation completed while its parent was locked');
        // SHOW PROCESSLIST exposes this user's own connections without PROCESS privilege.
        foreach(db()->query('SHOW FULL PROCESSLIST')->fetchAll() as $process) {
            $sql=(string)($process['Info']??'');
            if((int)$process['Id']===$connectionId
                && preg_match('/\b(records|project_tasks|contract_addenda)\b/i',$sql)
                && (str_contains(strtoupper($sql),'FOR UPDATE')||preg_match('/INSERT\s+INTO\s+(project_tasks|contract_addenda)/i',$sql)))return;
        }
        usleep(10000);
    } while(microtime(true)<$deadline);
    throw new RuntimeException('Worker never reached the locked database rows');
}

$loginAuth=new Auth();$login=$loginAuth->login('ciadmin','CIPassword_123456',true);
$token=$login['bearerToken'];$_SERVER['HTTP_AUTHORIZATION']='Bearer '.$token;
$auth=new Auth();$api=new Api($auth);$site=$api->run('sites.list',[])[0]['id'];
foreach(['projects','contracts'] as $module)foreach(['create','update','delete'] as $operation) {
    $data=$module==='projects'?['name'=>'Concurrent deletion','progress'=>0]:['name'=>'Concurrent deletion','endDate'=>'2027-12-31'];
    $parentId=$api->run('records.save',['siteId'=>$site,'module'=>$module,'record'=>['data'=>$data]])['id'];
    if($module==='projects') {
        $table='project_tasks';$parentColumn='project_id';$parentKey='projectId';$childKey='task';
        $saveAction='project.tasks.save';$deleteAction='project.tasks.delete';
        $childData=['title'=>'Concurrent task','status'=>'Not Started'];
    } else {
        $table='contract_addenda';$parentColumn='contract_id';$parentKey='contractId';$childKey='addendum';
        $saveAction='contract.addenda.save';$deleteAction='contract.addenda.delete';
        $childData=['addendum_no'=>'RACE','new_end_date'=>'2028-12-31'];
    }
    $base=['siteId'=>$site,$parentKey=>$parentId];
    $childId=$api->run($saveAction,[...$base,$childKey=>$childData])['id'];
    $payload=$operation==='delete'?[...$base,'id'=>$childId,'version'=>1]
        :[...$base,$childKey=>$operation==='update'?[...$childData,'id'=>$childId,'version'=>1]:$childData];
    $pipes=[];$process=null;$buffer='';
    try {
        // Stage the same parent-first locks and child removal used by records.delete.
        db()->beginTransaction();
        query('SELECT id FROM records WHERE id=? AND site_id=? FOR UPDATE',[$parentId,$site]);
        query("DELETE FROM $table WHERE site_id=? AND $parentColumn=?",[$site,$parentId]);
        $process=proc_open([PHP_BINARY,__FILE__,'--worker'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
        if(!is_resource($process))throw new RuntimeException('Cannot start concurrent PHP worker');
        stream_set_blocking($pipes[1],false);stream_set_blocking($pipes[2],false);
        fwrite($pipes[0],jsonValue(['token'=>$token,'action'=>$operation==='delete'?$deleteAction:$saveAction,'payload'=>$payload])."\n");
        fclose($pipes[0]);unset($pipes[0]);
        $ready=workerMessage($pipes[1],$buffer);
        if(!isset($ready['ready']))throw new RuntimeException('Worker failed before database barrier');
        awaitBlockedMutation($ready['ready'],$pipes[1],$buffer);
        query('DELETE FROM records WHERE id=? AND site_id=?',[$parentId,$site]);
        db()->commit();
        $result=workerMessage($pipes[1],$buffer);
        check(($result['http']??0)===404,"$module $operation rechecks a concurrently deleted parent");
        check(query("SELECT id FROM $table WHERE site_id=? AND $parentColumn=?",[$site,$parentId])->fetchAll()===[],"$module $operation leaves no orphan children");
    } finally {
        if(db()->inTransaction())db()->rollBack();
        if(is_resource($process)) {
            if(proc_get_status($process)['running'])proc_terminate($process);
            foreach($pipes as $pipe)if(is_resource($pipe))fclose($pipe);
            proc_close($process);
        }
    }
}
$auth->logout();
echo "All parent/child concurrency checks passed.\n";
