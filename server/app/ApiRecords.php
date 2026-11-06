<?php
declare(strict_types=1);

/** Trusted central data operations. Every query is site-scoped and checks authorization in PHP. */
trait ApiRecords {
    private function recordsList(array $p): array {
        [$module,$site]=$this->mod($p,'read');
        $rows=query('SELECT * FROM records WHERE site_id=? AND module=? ORDER BY updated_at DESC LIMIT 10000',[$site,$module])->fetchAll();
        return array_map(fn($r)=>$this->decodeRow($r),$rows);
    }
    private function recordsSave(array $p): array {
        [$module,$site]=$this->mod($p,'write');$rec=$p['record']??null;
        if(!is_array($rec)||!is_array($rec['data']??null))throw new ApiError('Invalid record',422);
        $data=$this->cleanData($module,$rec['data']);
        if(!array_filter($data,static fn($v)=>$v!==null&&$v!==''))throw new ApiError('Record cannot be empty',422);
        $id=isset($rec['id'])?$this->payload($rec,'id',36):uuid();
        return transactional(function()use($module,$site,$rec,$id,$data){
            $old=isset($rec['id'])?$this->record($module,$site,$id,true):null;
            if($old){
                $this->auth->manageRecord($old,$module);
                if(!isset($rec['version'])||(int)$rec['version']!==(int)$old['version'])throw new ApiError('Record was changed by another operator. Refresh before editing.',409);
                if($module==='checklists'){
                    $previous=jsonArray($old['data']);
                    foreach(['boardKey','periodKey','checkedBy','checkedTime'] as $managed)if(array_key_exists($managed,$previous))$data[$managed]=$previous[$managed];
                }
            }
            if($module==='inventory'){
                $newCode=strtolower(trim((string)$data['assetCode']));
                $assets=query("SELECT id,JSON_UNQUOTE(JSON_EXTRACT(data,'$.assetCode')) AS code FROM records WHERE site_id=? AND module='inventory' FOR UPDATE",[$site])->fetchAll();
                foreach($assets as $a)if($a['id']!==$id&&strtolower(trim((string)$a['code']))===$newCode)throw new ApiError('Asset code already exists at this site',409);
            }
            if($old)query('UPDATE records SET data=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND site_id=?',[jsonValue($data),$id,$site]);
            else query('INSERT INTO records(id,site_id,module,data,created_by) VALUES (?,?,?,?,?)',[$id,$site,$module,jsonValue($data),$this->auth->principal()['id']]);
            $this->history(['id'=>$id,'site_id'=>$site,'module'=>$module],$old?'UPDATE':'CREATE',$old?jsonArray($old['data']):null,$data);
            audit($this->auth->principal(),'RECORD_SAVE',$site,['id'=>$id,'module'=>$module]);
            return ['id'=>$id,'version'=>(int)query('SELECT version FROM records WHERE id=?',[$id])->fetch()['version']];
        });
    }
    private function recordsDelete(array $p): array {
        [$module,$site]=$this->mod($p,'write');$id=$this->payload($p,'id',36);
        return transactional(function()use($module,$site,$id){
            $old=$this->record($module,$site,$id,true);$this->auth->manageRecord($old,$module);
            if($module==='projects')query('DELETE FROM project_tasks WHERE site_id=? AND project_id=?',[$site,$id]);
            if($module==='contracts')query('DELETE FROM contract_addenda WHERE site_id=? AND contract_id=?',[$site,$id]);
            $this->history($old,'DELETE',jsonArray($old['data']),null);
            query('DELETE FROM records WHERE id=? AND site_id=?',[$id,$site]);
            audit($this->auth->principal(),'RECORD_DELETE',$site,['id'=>$id,'module'=>$module]);return ['success'=>true];
        });
    }
    private function recordsHistory(array $p): array {
        [$module,$site]=$this->mod($p,'read');$id=$this->payload($p,'id',36);$this->record($module,$site,$id);
        return query('SELECT * FROM record_history WHERE record_id=? AND site_id=? AND module=? ORDER BY created_at DESC LIMIT 100',[$id,$site,$module])->fetchAll();
    }
    private function recordsBatchStatus(array $p): array {
        [$module,$site]=$this->mod($p,'write');$status=$this->payload($p,'status',40);
        if(!isset(self::STATUS[$module])||!in_array($status,self::STATUS[$module],true))throw new ApiError('Invalid status',422);
        $ids=$p['ids']??null;
        if(!is_array($ids)||count($ids)<1||count($ids)>500)throw new ApiError('Invalid selection',422);
        $ids=array_values(array_unique($ids));foreach($ids as $id)if(!is_string($id)||!preg_match('/^[0-9a-f-]{36}$/Di',$id))throw new ApiError('Invalid ID',422);
        sort($ids,SORT_STRING);
        return transactional(function()use($module,$site,$ids,$status){
            $rows=[];foreach($ids as $id){$r=$this->record($module,$site,$id,true);$this->auth->manageRecord($r,$module);$rows[]=$r;}
            $n=0;foreach($rows as $r){$before=jsonArray($r['data']);if(($before['status']??'')===$status)continue;
                $after=[...$before,'status'=>$status];query('UPDATE records SET data=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[jsonValue($after),$r['id']]);
                $this->history($r,'BATCH_STATUS',$before,$after);$n++;
            }audit($this->auth->principal(),'RECORD_BATCH_STATUS',$site,['module'=>$module,'updated'=>$n]);return ['updated'=>$n];
        });
    }
    private function setting(string $key,string $site=''): mixed {
        $r=query('SELECT value FROM settings WHERE site_id=? AND `key`=?',[$site,$key])->fetch();
        if(!$r&&$site!=='')$r=query("SELECT value FROM settings WHERE site_id='' AND `key`=?",[$key])->fetch();
        return $r?json_decode($r['value'],true,512,JSON_THROW_ON_ERROR):null;
    }
    private function settingsGet(array $p): array {
        $site=$this->payload($p,'siteId',36)?:$this->auth->status()['user']['siteId'];
        $this->auth->site($site);
        $rows=query('SELECT site_id,`key`,value FROM settings WHERE site_id=? OR site_id=? ORDER BY site_id',[$site,''])->fetchAll();
        $out=[];foreach($rows as $r)$out[$r['key']]=json_decode($r['value'],true,512,JSON_THROW_ON_ERROR);
        return $out;
    }
    private function settingsSave(array $p): array {
        $this->auth->admin();$key=$this->payload($p,'key',80);
        if(!in_array($key,self::SETTINGS,true)||!array_key_exists('value',$p))throw new ApiError('Invalid setting',422);
        $json=jsonValue($p['value']);if(strlen($json)>200000)throw new ApiError('Setting too large',413);
        transactional(function()use($key,$json){query("INSERT INTO settings(site_id,`key`,value) VALUES ('',?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[$key,$json]);audit($this->auth->principal(),'SETTINGS_SAVE',null,['key'=>$key]);});
        return ['success'=>true];
    }
    private function checklistPeriod(string $date,string $frequency): string {
        $day=assertDate($date);if(!$day)throw new ApiError('Date required',422);$d=new DateTimeImmutable($day,new DateTimeZone('UTC'));
        return match($frequency){
            'Weekly'=>$d->modify('monday this week')->format('Y-m-d'),
            'Monthly'=>$d->format('Y-m'),
            'Quarterly'=>$d->format('Y').'-Q'.(int)ceil((int)$d->format('n')/3),
            'Semiannual'=>$d->format('Y').'-H'.((int)$d->format('n')>6?2:1),
            'Yearly'=>$d->format('Y'),default=>$day,
        };
    }
    private function checklistMark(array $p): array {
        $site=$this->site($p);$this->auth->module('checklists',$site,'write');
        $name=$this->payload($p,'name',180);$freq=$this->payload($p,'frequency',20);$date=$this->payload($p,'date',10);
        $status=$this->payload($p,'status',20);$reason=$this->payload($p,'reason',2000);$note=$this->payload($p,'note',2000);
        if(!$name||!in_array($freq,['Daily','Weekly','Monthly','Quarterly','Semiannual','Yearly','Custom'],true)||!in_array($status,['Done','Not Done'],true))throw new ApiError('Invalid checklist',422);
        if($status==='Not Done'&&$reason==='')throw new ApiError('Reason required',422);
        $templates=$this->setting('checklistTemplates',$site)??[['name'=>'Kiểm tra Backup','frequency'=>'Daily'],['name'=>'Kiểm tra NAS / Server','frequency'=>'Daily']];
        if(!array_filter($templates,static fn($t)=>($t['name']??'')===$name&&($t['frequency']??'')===$freq))throw new ApiError('Checklist template not found',422);
        $period=$this->checklistPeriod($date,$freq);$key=$freq.'::'.strtolower($name);
        return transactional(function()use($site,$name,$freq,$date,$status,$reason,$note,$period,$key){
            $all=query("SELECT * FROM records WHERE site_id=? AND module='checklists' FOR UPDATE",[$site])->fetchAll();$old=null;
            foreach($all as $r){$v=jsonArray($r['data']);if(($v['boardKey']??'')===$key&&($v['periodKey']??'')===$period){$old=$r;break;}}
            if($old)$this->auth->manageRecord($old,'checklists');
            $id=$old['id']??uuid();$before=$old?jsonArray($old['data']):null;
            $data=[...($before??[]),'title'=>$name,'frequency'=>$freq,'checkedAt'=>$date,'boardKey'=>$key,'periodKey'=>$period,
                'status'=>$status,'reason'=>$status==='Not Done'?$reason:'','note'=>$note,
                'checkedBy'=>$this->auth->principal()['full_name'],'checkedTime'=>gmdate('c')];
            if($old)query('UPDATE records SET data=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[jsonValue($data),$id]);
            else query("INSERT INTO records(id,site_id,module,data,created_by) VALUES (?,?,'checklists',?,?)",[$id,$site,jsonValue($data),$this->auth->principal()['id']]);
            $this->history(['id'=>$id,'site_id'=>$site,'module'=>'checklists'],$old?'CHECK_AGAIN':'CHECK',$before,$data);
            audit($this->auth->principal(),'CHECKLIST_MARK',$site,['name'=>$name,'period'=>$period,'status'=>$status]);return ['id'=>$id];
        });
    }
    private function rosterBatch(array $p): array {
        $site=$this->site($p);$this->auth->module('roster',$site,'write');
        $employee=$this->payload($p,'employee',150);$dates=$p['dates']??null;$shift=$this->payload($p,'shift',20);$note=$this->payload($p,'note',1000);
        if(!$employee||!is_array($dates)||count($dates)<1||count($dates)>62||count(array_unique($dates))!==count($dates))throw new ApiError('Invalid roster batch',422);
        foreach($dates as $date)if(!assertDate($date))throw new ApiError('Invalid roster date',422);
        $shifts=$this->setting('shiftTypes',$site)??[['code'=>'D','factor'=>1],['code'=>'N','factor'=>1],['code'=>'HD','factor'=>0.5],['code'=>'AL','factor'=>0],['code'=>'DO','factor'=>0]];
        $entry=null;foreach($shifts as $type)if(($type['code']??'')===$shift){$entry=$type;break;}
        if(!$entry||!is_numeric($entry['factor']??null))throw new ApiError('Invalid shift',422);
        return transactional(function()use($site,$employee,$dates,$shift,$note,$entry){
            $all=query("SELECT * FROM records WHERE site_id=? AND module='roster' FOR UPDATE",[$site])->fetchAll();
            foreach($dates as $date){$old=null;foreach($all as $row){$d=jsonArray($row['data']);if(($d['employee']??'')===$employee&&($d['date']??'')===$date){$old=$row;break;}}
                if($old)$this->auth->manageRecord($old,'roster');$id=$old['id']??uuid();$before=$old?jsonArray($old['data']):null;
                $data=[...($before??[]),'employee'=>$employee,'date'=>$date,'shift'=>$shift,'factor'=>(float)$entry['factor'],'note'=>$note];
                if($old)query('UPDATE records SET data=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[jsonValue($data),$id]);
                else query("INSERT INTO records(id,site_id,module,data,created_by) VALUES (?,?,'roster',?,?)",[$id,$site,jsonValue($data),$this->auth->principal()['id']]);
                $this->history(['id'=>$id,'site_id'=>$site,'module'=>'roster'],$old?'SHIFT_UPDATE':'SHIFT_ASSIGN',$before,$data);
            }audit($this->auth->principal(),'ROSTER_BATCH',$site,['employee'=>$employee,'dates'=>count($dates)]);return ['count'=>count($dates)];
        });
    }
}