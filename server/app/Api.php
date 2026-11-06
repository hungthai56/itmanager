<?php
declare(strict_types=1);
require_once __DIR__.'/Auth.php';
require_once __DIR__.'/ApiRecords.php';

final class Api {
    use ApiRecords;
    private Auth $auth;
    private const STATUS = ['tasks'=>['Open','In Progress','Done'], 'inventory'=>['Active','Spare','Maintenance','Retired']];
    private const FIELDS = [
        'tasks'=>['title','description','assignedTo','dueDate','priority','category','department','status','remarks'],
        'checklists'=>['title','category','frequency','checkedAt','status','reason','note','evidence','_attachmentName','boardKey','periodKey','checkedBy','checkedTime'],
        'roster'=>['employee','date','shift','factor','note'],
        'inventory'=>['assetCode','name','category','model','serial','mac','ip','vendor','department','location','assignedTo','purchaseDate','warrantyUntil','purchasePrice','status','notes','_attachmentName','file'],
        'contracts'=>['name','vendor','category','billingCycle','contractNo','startDate','endDate','amount','status','parentContract','note','file','_attachmentName'],
        'pl'=>['period','account','type','budget','actual','note'],
        'capex'=>['name','category','department','priority','targetQuarter','actualSpent','year','quantity','unitPrice','lifecycleYears','status','note'],
        'projects'=>['projectCode','name','category','vendor','owner','startDate','dueDate','progress','budget','actual','status','milestones','executiveSummary','note','_attachmentName','file'],
        'knowledge'=>['title','type','visibility','category','tags','updatedAt','content','attachment','_attachmentName'],
    ];
    private const SETTINGS=['categories','shiftTypes','checklistTemplates','payrollCycles','departments','vendors','inventoryCategories','projectCategories','capexCategories','revenueAccounts','expenseAccounts'];
    public function __construct(Auth $auth) { $this->auth=$auth; }
    private function payload(array $p,string $field,int $limit=150): string {return assertString($p[$field]??'', $limit);}
    private function site(array $p): string { $id=$this->payload($p,'siteId',36);$this->auth->site($id);return $id; }
    private function mod(array $p,string $mode): array {
        $module=$this->payload($p,'module',40);$site=$this->payload($p,'siteId',36);
        $this->auth->module($module,$site,$mode);return [$module,$site];
    }
    private function record(string $module,string $site,string $id,bool $forUpdate=false): array {
        $row=query('SELECT * FROM records WHERE id=? AND site_id=? AND module=?'.($forUpdate?' FOR UPDATE':''),[$id,$site,$module])->fetch();
        if (!$row)throw new ApiError('Record not found',404);
        return $row;
    }
    private function decodeRow(array $row): array {
        $row['data']=jsonArray($row['data']);$row['version']=(int)$row['version'];
        $row['can_edit']=$this->canEdit($row);
        if ($row['module']==='contracts')$row['effectiveEndDate']=$this->effectiveEnd($row['site_id'],$row['id'],$row['data']['endDate']??null);
        return $row;
    }
    private function canEdit(array $row): bool {
        try {$this->auth->module($row['module'],$row['site_id'],'write');$this->auth->manageRecord($row,$row['module']);return true;}
        catch(ApiError) {return false;}
    }
    private function effectiveEnd(string $site,string $contractId,mixed $original): string {
        $row=query('SELECT MAX(new_end_date) AS expires FROM contract_addenda WHERE site_id=? AND contract_id=?',[$site,$contractId])->fetch();
        return max((string)($original??''),(string)($row['expires']??''));
    }
    private function cleanData(string $module,array $data): array {
        $result=[];
        foreach ($data as $key=>$value) {
            if (!is_string($key)||!in_array($key,self::FIELDS[$module],true))continue;
            if (!is_scalar($value)&&$value!==null)throw new ApiError('Invalid field type',422);
            if (is_string($value)&&strlen($value)>15000)throw new ApiError('Field too long',422);
            if($module==='checklists' && in_array($key,['checkedBy','checkedTime','boardKey','periodKey'],true))continue;
            $result[$key]=$value;
        }
        if (strlen(jsonValue($result))>200000)throw new ApiError('Record too large',413);
        if ($module==='inventory'&&!trim((string)($result['assetCode']??'')))throw new ApiError('Asset code required',422);
        if ($module==='checklists'&&($result['status']??'')==='Not Done'&&!trim((string)($result['reason']??'')))throw new ApiError('Reason required for Not Done',422);
        if (isset($result['dueDate']))assertDate($result['dueDate']);
        if (isset($result['warrantyUntil']))assertDate($result['warrantyUntil']);
        if (isset($result['endDate']))assertDate($result['endDate']);
        if (isset($result['date']))assertDate($result['date']);
        if (isset($result['status'])&&in_array($module,['tasks','inventory'],true)&&!in_array((string)$result['status'],self::STATUS[$module],true))throw new ApiError('Invalid status',422);
        return $result;
    }
    private function history(array $row,string $action,?array $before,?array $after): void {
        query('INSERT INTO record_history(id,record_id,site_id,module,action,before_data,after_data,username) VALUES (?,?,?,?,?,?,?,?)',[
            uuid(),$row['id'],$row['site_id'],$row['module'],$action,$before===null?null:jsonValue($before),$after===null?null:jsonValue($after),$this->auth->principal()['username']]);
    }
    private function parseModuleRow(array $row): array {return [...$row,'data'=>jsonArray($row['data'])];}
    public function run(string $action,array $p): mixed {
        if (!in_array($action,['app.info','auth.status','auth.login','auth.logout','auth.changePassword'],true)) {
            $this->auth->assertPasswordChanged();
        }
        switch ($action) {
            case 'app.info': return ['version'=>'0.6.2','mode'=>'server','modules'=>Auth::MODULES];
            case 'auth.status': return $this->auth->status();
            case 'auth.login': return $this->auth->login($this->payload($p,'username',100),$this->payload($p,'password',1024),($_SERVER['HTTP_X_LOTUS_CLIENT']??'')==='desktop');
            case 'auth.logout': return $this->auth->logout();
            case 'auth.changePassword': return $this->auth->changePassword($this->payload($p,'oldPassword',1024),$this->payload($p,'newPassword',256));
            case 'auth.setup': throw new ApiError('Server first administrator must be created by CLI',403);
            case 'sites.list': return $this->auth->siteList();
            case 'sites.switch': {
                $site=$this->site($p);
                if (!$this->auth->desktop()) $_SESSION['site_id']=$site;
                return ['siteId'=>$site];
            }
            case 'sites.save': return $this->siteSave($p);
            case 'users.list':return $this->usersList();
            case 'users.save':return $this->usersSave($p);
            case 'users.password':return $this->userPassword($p);
            case 'permissions.get':return $this->permissionsGet();
            case 'permissions.save':return $this->permissionsSave($p);
            case 'records.list':return $this->recordsList($p);
            case 'records.save':return $this->recordsSave($p);
            case 'records.delete':return $this->recordsDelete($p);
            case 'records.history':return $this->recordsHistory($p);
            case 'records.batchStatus':return $this->recordsBatchStatus($p);
            case 'checklist.mark':return $this->checklistMark($p);
            case 'roster.batch':return $this->rosterBatch($p);
            case 'project.tasks.list':return $this->projectTasksList($p);
            case 'project.tasks.save':return $this->projectTaskSave($p);
            case 'project.tasks.delete':return $this->projectTaskDelete($p);
            case 'contract.addenda.list':return $this->addendaList($p);
            case 'contract.addenda.save':return $this->addendaSave($p);
            case 'contract.addenda.delete':return $this->addendaDelete($p);
            case 'settings.get':return $this->settingsGet($p);
            case 'settings.save':return $this->settingsSave($p);
            case 'dashboard.get':return $this->dashboard($p);
            case 'audit.list':return $this->auditList($p);
            case 'file.pick':case 'file.open':case 'file.save':case 'reports.export':case 'qr.print':case 'backup.export':case 'backup.import':
                throw new ApiError('This operation is not yet available in online mode',501);
            default:throw new ApiError('Unknown action',404);
        }
    }
    private function siteSave(array $p): array {
        $this->auth->admin();$id=$this->payload($p,'id',36) ?: uuid();$code=strtoupper($this->payload($p,'code',32));$name=$this->payload($p,'name',190);$currency=strtoupper($this->payload($p,'currency',3));
        if (!preg_match('/^[A-Z0-9_-]{2,32}$/D',$code)||$name===''||!preg_match('/^[A-Z]{3}$/D',$currency))throw new ApiError('Invalid site',422);
        transactional(function()use($id,$code,$name,$currency,$p){
            if (!empty($p['id'])){
                if (!query('SELECT id FROM sites WHERE id=?',[$id])->fetch())throw new ApiError('Site not found',404);
                query('UPDATE sites SET code=?,name=?,currency=? WHERE id=?',[$code,$name,$currency,$id]);
            } else query('INSERT INTO sites(id,code,name,currency) VALUES (?,?,?,?)',[$id,$code,$name,$currency]);
            audit($this->auth->principal(),'SITE_SAVE',$id,['code'=>$code]);
        });return ['id'=>$id];
    }
    private function usersList(): array {
        $this->auth->admin();$out=query('SELECT id,username,full_name,job_title,department,role,active,account_locked,force_reset,default_site_id,report_to,overrides,created_at FROM users ORDER BY full_name')->fetchAll();
        foreach ($out as &$u){$u['overrides']=jsonValue(jsonArray($u['overrides']));$u['siteIds']=array_column(query('SELECT site_id FROM user_sites WHERE user_id=?',[$u['id']])->fetchAll(),'site_id');}
        return $out;
    }
    private function usersSave(array $p): array {
        $this->auth->admin();
        $id=$this->payload($p,'id',36) ?: uuid();$username=strtolower($this->payload($p,'username',100));$name=$this->payload($p,'full_name',190);$role=$this->payload($p,'role',12);
        if (!preg_match('/^[a-z0-9._-]{1,100}$/D',$username)||$name===''||!in_array($role,['SYS','MANAGER','SUPERVISOR','STAFF'],true))throw new ApiError('Invalid user',422);
        $allowedSites=$p['siteIds']??[];if(!is_array($allowedSites)||count($allowedSites)<1||count($allowedSites)>100)throw new ApiError('Site membership required',422);
        $allSites=array_column(query('SELECT id FROM sites WHERE active=1')->fetchAll(),'id');
        $allowedSites=array_values(array_unique($allowedSites));foreach($allowedSites as $site)if(!in_array($site,$allSites,true))throw new ApiError('Unknown site',422);
        $default=in_array($p['default_site_id']??'',$allowedSites,true)?$p['default_site_id']:$allowedSites[0];
        $active=!empty($p['active'])?1:0;$locked=!empty($p['account_locked'])?1:0;$force=!empty($p['force_reset'])?1:0;
        if($id===$this->auth->principal()['id']&&(!$active||$locked||$role!=='SYS'))throw new ApiError('Cannot demote or lock current administrator',422);
        $overrides=$p['overrides']??[];if(!is_array($overrides))throw new ApiError('Invalid overrides',422);
        foreach($overrides as $module=>$items){if(!in_array($module,Auth::MODULES,true)||!is_array($items))throw new ApiError('Invalid override',422);foreach($items as $mode=>$value)if(!in_array($mode,['read','write'],true)||!in_array($value,['allow','deny','default'],true))throw new ApiError('Invalid override',422);}
        $reportsTo=$this->payload($p,'report_to',36)?:null;
        return transactional(function()use($id,$p,$username,$name,$role,$allowedSites,$default,$active,$locked,$force,$overrides,$reportsTo){
            $old=query('SELECT * FROM users WHERE id=? FOR UPDATE',[$id])->fetch();
            if(!$old){$password=$this->payload($p,'password',256);$this->checkPassword($password);$hash=password_hash($password,PASSWORD_ARGON2ID);
                query('INSERT INTO users(id,username,full_name,job_title,department,role,password_hash,active,account_locked,force_reset,default_site_id,report_to,overrides) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[
                    $id,$username,$name,$this->payload($p,'job_title',120),$this->payload($p,'department',120),$role,$hash,$active,$locked,$force,$default,$reportsTo,jsonValue($overrides)]);
            }else{
                query('UPDATE users SET username=?,full_name=?,job_title=?,department=?,role=?,active=?,account_locked=?,failed_attempts=?,force_reset=?,default_site_id=?,report_to=?,overrides=? WHERE id=?',[
                    $username,$name,$this->payload($p,'job_title',120),$this->payload($p,'department',120),$role,$active,$locked,$locked?5:0,$force,$default,$reportsTo,jsonValue($overrides),$id]);
                if(!$active||$locked)query('UPDATE access_tokens SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=?',[$id]);
            }
            query('DELETE FROM user_sites WHERE user_id=?',[$id]);foreach($allowedSites as $site)query('INSERT INTO user_sites(user_id,site_id) VALUES (?,?)',[$id,$site]);
            audit($this->auth->principal(),'USER_SAVE',null,['id'=>$id]);return ['id'=>$id];
        });
    }
    private function checkPassword(string $v): void {
        if(strlen($v)<12||strlen($v)>256||!preg_match('/[A-Za-z]/',$v)||!preg_match('/[0-9]/',$v))throw new ApiError('Password must have 12+ chars, letters and digits',422);
    }
    private function userPassword(array $p): array {
        $this->auth->admin();$id=$this->payload($p,'userId',36);$pw=$this->payload($p,'password',256);$this->checkPassword($pw);
        if (!query('SELECT id FROM users WHERE id=?',[$id])->fetch())throw new ApiError('User not found',404);
        transactional(function()use($id,$pw){query('UPDATE users SET password_hash=?,force_reset=1,failed_attempts=0,account_locked=0 WHERE id=?',[password_hash($pw,PASSWORD_ARGON2ID),$id]);query('UPDATE access_tokens SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=?',[$id]);audit($this->auth->principal(),'USER_PASSWORD_RESET',null,['userId'=>$id]);});
        return ['success'=>true];
    }
    private function permissionsGet(): array {
        $this->auth->admin();return ['role'=>$this->auth->principal()['role'],'rows'=>query('SELECT * FROM role_permissions ORDER BY role,module')->fetchAll(),'overrides'=>jsonArray($this->auth->principal()['overrides'])];
    }
    private function permissionsSave(array $p): array {
        $this->auth->admin();$rows=$p['rows']??null;if(!is_array($rows)||count($rows)>100)throw new ApiError('Invalid permissions',422);
        transactional(function()use($rows){foreach($rows as $row){$role=$row['role']??null;$mod=$row['module']??null;if(!in_array($role,['MANAGER','SUPERVISOR','STAFF'],true)||!in_array($mod,Auth::MODULES,true))continue;
            query('INSERT INTO role_permissions(role,module,can_read,can_write) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE can_read=VALUES(can_read),can_write=VALUES(can_write)',[$role,$mod,!empty($row['can_read'])?1:0,!empty($row['can_write'])?1:0]);}
            audit($this->auth->principal(),'PERMISSION_UPDATE',null,[]);});return $this->permissionsGet();
    }
    private function projectTasksList(array $p): array {
        $site=$this->site($p);$this->auth->module('projects',$site,'read');$project=$this->payload($p,'projectId',36);
        $this->record('projects',$site,$project);
        return query('SELECT * FROM project_tasks WHERE site_id=? AND project_id=? ORDER BY created_at ASC',[$site,$project])->fetchAll();
    }
    private function projectProgress(string $site,string $project): void {
        $all=query('SELECT status FROM project_tasks WHERE site_id=? AND project_id=?',[$site,$project])->fetchAll();
        $percent=count($all)?(int)round(100*count(array_filter($all,static fn($x)=>$x['status']==='Done'))/count($all)):0;
        $row=$this->record('projects',$site,$project,true);$before=jsonArray($row['data']);$data=[...$before,'progress'=>$percent];
        if((int)($before['progress']??0)===$percent)return;
        query('UPDATE records SET data=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[jsonValue($data),$project]);
        $this->history($row,'PROGRESS_UPDATE',$before,$data);
    }
    private function projectTaskSave(array $p): array {
        $site=$this->site($p);$this->auth->module('projects',$site,'write');$project=$this->payload($p,'projectId',36);
        $data=$p['task']??null;if(!is_array($data))throw new ApiError('Invalid task',422);
        $title=$this->payload($data,'title',250);$status=$this->payload($data,'status',30);$due=assertDate($data['due_date']??null);
        if($title===''||!in_array($status,['Not Started','In Progress','Blocked','Done'],true))throw new ApiError('Invalid task',422);
        $id=$this->payload($data,'id',36) ?: uuid();
        return transactional(function()use($id,$site,$project,$data,$title,$status,$due){
            $this->auth->manageRecord($this->record('projects',$site,$project,true),'projects');
            $old=query('SELECT * FROM project_tasks WHERE id=? AND site_id=? AND project_id=? FOR UPDATE',[$id,$site,$project])->fetch();
            if(!empty($data['id'])&&!$old)throw new ApiError('Task not found',404);
            if($old&&(!isset($data['version'])||(int)$data['version']!==(int)$old['version']))throw new ApiError('Task changed on another device. Refresh and retry.',409);
            $values=[$title,$this->payload($data,'owner',150),$due,$status,$this->payload($data,'notes',2000)];
            if($old)query('UPDATE project_tasks SET title=?,owner=?,due_date=?,status=?,notes=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND site_id=? AND project_id=?',[...$values,$id,$site,$project]);
            else query('INSERT INTO project_tasks(id,site_id,project_id,title,owner,due_date,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)',[$id,$site,$project,...$values,$this->auth->principal()['id']]);
            $this->projectProgress($site,$project);audit($this->auth->principal(),'PROJECT_TASK_SAVE',$site,['projectId'=>$project,'id'=>$id]);
            return ['id'=>$id];
        });
    }
    private function projectTaskDelete(array $p): array {
        $site=$this->site($p);$this->auth->module('projects',$site,'write');$project=$this->payload($p,'projectId',36);$id=$this->payload($p,'id',36);
        return transactional(function()use($site,$project,$id,$p){
            $this->auth->manageRecord($this->record('projects',$site,$project,true),'projects');
            $row=query('SELECT id,version FROM project_tasks WHERE id=? AND project_id=? AND site_id=? FOR UPDATE',[$id,$project,$site])->fetch();
            if(!$row)throw new ApiError('Task not found',404);
            if(!isset($p['version'])||(int)$p['version']!==(int)$row['version'])throw new ApiError('Task changed on another device. Refresh and retry.',409);
            query('DELETE FROM project_tasks WHERE id=?',[$id]);$this->projectProgress($site,$project);
            audit($this->auth->principal(),'PROJECT_TASK_DELETE',$site,['id'=>$id]);return ['success'=>true];
        });
    }
    private function addendaList(array $p): array {
        $site=$this->site($p);$this->auth->module('contracts',$site,'read');$contract=$this->payload($p,'contractId',36);
        $this->record('contracts',$site,$contract);
        return query('SELECT * FROM contract_addenda WHERE site_id=? AND contract_id=? ORDER BY new_end_date DESC',[$site,$contract])->fetchAll();
    }
    private function addendaSave(array $p): array {
        $site=$this->site($p);$this->auth->module('contracts',$site,'write');$contract=$this->payload($p,'contractId',36);
        $a=$p['addendum']??null;if(!is_array($a))throw new ApiError('Invalid addendum',422);
        $id=$this->payload($a,'id',36)?:uuid();$number=$this->payload($a,'addendum_no',120);
        $signed=assertDate($a['signed_date']??null);$start=assertDate($a['new_start_date']??null);$end=assertDate($a['new_end_date']??null);
        $amount=$a['amount']??0;
        if(!$number||!$end||!is_numeric($amount)||!is_finite((float)$amount)||abs((float)$amount)>1e15)throw new ApiError('Invalid addendum',422);
        return transactional(function()use($id,$site,$contract,$a,$number,$signed,$start,$end,$amount){
            $parent=$this->record('contracts',$site,$contract,true);$this->auth->manageRecord($parent,'contracts');
            $old=query('SELECT id,version FROM contract_addenda WHERE id=? AND site_id=? AND contract_id=? FOR UPDATE',[$id,$site,$contract])->fetch();
            if(!empty($a['id'])&&!$old)throw new ApiError('Addendum not found',404);
            if($old&&(!isset($a['version'])||(int)$a['version']!==(int)$old['version']))throw new ApiError('Addendum changed on another device. Refresh and retry.',409);
            $values=[$number,$signed,$start,$end,(float)$amount,$this->payload($a,'summary',5000)];
            if($old)query('UPDATE contract_addenda SET addendum_no=?,signed_date=?,new_start_date=?,new_end_date=?,amount=?,summary=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND site_id=? AND contract_id=?',[...$values,$id,$site,$contract]);
            else query('INSERT INTO contract_addenda(id,site_id,contract_id,addendum_no,signed_date,new_start_date,new_end_date,amount,summary,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',[$id,$site,$contract,...$values,$this->auth->principal()['id']]);
            audit($this->auth->principal(),'CONTRACT_ADDENDUM_SAVE',$site,['contractId'=>$contract,'id'=>$id]);
            return ['id'=>$id,'effectiveEndDate'=>$this->effectiveEnd($site,$contract,jsonArray($parent['data'])['endDate']??null)];
        });
    }
    private function addendaDelete(array $p): array {
        $site=$this->site($p);$this->auth->module('contracts',$site,'write');$contract=$this->payload($p,'contractId',36);$id=$this->payload($p,'id',36);
        return transactional(function()use($site,$contract,$id,$p){
            $this->auth->manageRecord($this->record('contracts',$site,$contract,true),'contracts');
            $old=query('SELECT id,version FROM contract_addenda WHERE id=? AND site_id=? AND contract_id=? FOR UPDATE',[$id,$site,$contract])->fetch();
            if(!$old)throw new ApiError('Addendum not found',404);
            if(!isset($p['version'])||(int)$p['version']!==(int)$old['version'])throw new ApiError('Addendum changed on another device. Refresh and retry.',409);
            query('DELETE FROM contract_addenda WHERE id=?',[$id]);audit($this->auth->principal(),'CONTRACT_ADDENDUM_DELETE',$site,['id'=>$id]);return ['success'=>true];
        });
    }
    private function dashboard(array $p): array {
        $site=$this->site($p);$counts=[];$items=[];
        foreach(Auth::MODULES as $module){
            try {$this->auth->module($module,$site,'read');$can=true;}catch(ApiError){$can=false;}
            $counts[$module]=$can?(int)query('SELECT COUNT(*) AS c FROM records WHERE site_id=? AND module=?',[$site,$module])->fetch()['c']:null;
            $items[$module]=$can?array_map(fn($r)=>jsonArray($r['data']),query('SELECT data FROM records WHERE site_id=? AND module=? LIMIT 10000',[$site,$module])->fetchAll()):[];
        }
        $tasks=$items['tasks'];$checks=$items['checklists'];$contracts=$items['contracts'];$inventory=$items['inventory'];$roster=$items['roster'];$pl=$items['pl'];$capex=$items['capex'];$projects=$items['projects'];
        $today=gmdate('Y-m-d');$year=gmdate('Y');$ym=gmdate('Y-m');
        $between=function(?string $date,int $days)use($today):bool{
            if(!$date)return false;$date=substr($date,0,10);
            return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)&&$date>=$today&&$date<=gmdate('Y-m-d',time()+$days*86400);
        };
        $expiring=0;
        if($counts['contracts']!==null){
            foreach(query("SELECT id,data FROM records WHERE site_id=? AND module='contracts'",[$site])->fetchAll() as $r){
                $details=jsonArray($r['data']);if($between($this->effectiveEnd($site,$r['id'],$details['endDate']??null),60))$expiring++;
            }
        }
        $pnl=['budget'=>0,'actual'=>0];foreach($pl as $item){if(!str_starts_with((string)($item['period']??''),$year.'-'))continue;$pnl['budget']+=(float)($item['budget']??0);$pnl['actual']+=(float)($item['actual']??0);}
        $ca=['budget'=>0,'actual'=>0];foreach($capex as $item){if((string)($item['year']??$year)!==$year||in_array($item['status']??'',['Cancelled','Deferred'],true))continue;$ca['budget']+=(float)($item['quantity']??0)*(float)($item['unitPrice']??0);$ca['actual']+=(float)($item['actualSpent']??0);}
        $pro=['completed'=>0,'inProgress'=>0,'delayed'=>0];foreach($projects as $item){if(($item['status']??'')==='Completed')$pro['completed']++;if(($item['status']??'')==='In Progress')$pro['inProgress']++;if(($item['status']??'')==='Delayed')$pro['delayed']++;}
        $rosterStats=['staff'=>count(array_unique(array_filter(array_map(fn($x)=>trim((string)($x['employee']??'')),$roster)))),'shifts'=>count(array_filter($roster,fn($r)=>str_starts_with((string)($r['date']??''),$ym)))];
        $warranty=['expired'=>count(array_filter($inventory,fn($i)=>isset($i['warrantyUntil'])&&$i['warrantyUntil']!==''&&$i['warrantyUntil']<$today)),
            'expiring90'=>count(array_filter($inventory,fn($i)=>$between((string)($i['warrantyUntil']??''),90)))];
        $readable=array_keys(array_filter($counts,static fn($v)=>$v!==null));$recent=[];
        if($readable){$stmt=query('SELECT id,module,data,updated_at FROM records WHERE site_id=? ORDER BY updated_at DESC LIMIT 50',[$site]);
            foreach($stmt->fetchAll() as $r){if(!in_array($r['module'],$readable,true))continue;$r['data']=jsonArray($r['data']);$recent[]=$r;if(count($recent)===8)break;}}
        return ['counts'=>$counts,'openTasks'=>count(array_filter($tasks,fn($x)=>($x['status']??'')!=='Done')),
            'checksDone'=>count(array_filter($checks,fn($x)=>($x['status']??'')==='Done')),'checkTotal'=>count($checks),
            'expiringContracts'=>$expiring,'warrantySoon'=>$warranty['expiring90'],'plYtd'=>$pnl,'capexYtd'=>$ca,
            'projectStatus'=>$pro,'rosterStats'=>$rosterStats,'warrantyStats'=>$warranty,'recent'=>$recent];
    }
    private function auditList(array $p): array {
        $this->auth->admin();$site=$this->payload($p,'siteId',36);
        if($site!=='')$this->auth->site($site);
        return $site!==''?query('SELECT * FROM audit WHERE site_id=? OR site_id IS NULL ORDER BY created_at DESC LIMIT 500',[$site])->fetchAll():query('SELECT * FROM audit ORDER BY created_at DESC LIMIT 500')->fetchAll();
    }
}
