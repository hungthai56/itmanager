const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Store}=require('../electron/storage.cjs');
test('locked accounts require administrator unlock; default site is preserved',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-v05-'));const s=new Store(dir);
 try{await s.init();s.setup({name:'Administrator',username:'admin',password:'StrongPassword123',siteName:'Main'});
 const site=s.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
 const second=s.siteSave({name:'Second',code:'S2',currency:'VND'}).id;
 const staff=s.userSave({username:'guest',full_name:'Technician',password:'StaffPassword123',role:'STAFF',siteIds:[site,second],default_site_id:second,active:1,force_reset:0});
 s.logout();for(let i=0;i<5;i++)assert.throws(()=>s.login({username:'guest',password:'wrong'}));
 assert.throws(()=>s.login({username:'guest',password:'StaffPassword123'}),/khóa/);
 const row=s.one('SELECT account_locked,failed_attempts FROM users WHERE id=?',[staff.id]);assert.equal(row.account_locked,1);assert.equal(row.failed_attempts,5);
 s.login({username:'admin',password:'StrongPassword123'});
 let u=s.users().find(x=>x.id===staff.id);assert.equal(u.default_site_id,second);
 s.userSave({...u,siteIds:u.siteIds,account_locked:0});s.logout();
 const v=s.login({username:'guest',password:'StaffPassword123'});assert.equal(v.user.siteId,second);
 }finally{s.db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('supervisor can edit direct reports but cannot edit peers or manager tasks',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-supervisor-'));const s=new Store(dir);
 try{await s.init();s.setup({name:'Administrator',username:'admin',password:'StrongPassword123',siteName:'Main'});
 const site=s.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
 const sup=s.userSave({username:'sup',full_name:'Supervisor',password:'Supervisor123',role:'SUPERVISOR',siteIds:[site],active:1,force_reset:0});
 s.userSave({username:'staff',full_name:'Technician',password:'StaffPassword123',role:'STAFF',siteIds:[site],report_to:sup.id,active:1,force_reset:0});
 s.userSave({username:'peer',full_name:'Peer Technician',password:'StaffPassword123',role:'STAFF',siteIds:[site],active:1,force_reset:0});
 const managerTask=s.recordsSave({module:'tasks',siteId:site,record:{data:{title:'Management work',status:'Open'}}}).id;
 s.logout();s.login({username:'staff',password:'StaffPassword123'});
 const owned=s.recordsSave({module:'tasks',siteId:site,record:{data:{title:'Staff work',status:'Open'}}}).id;
 s.logout();s.login({username:'peer',password:'StaffPassword123'});
 const peerTask=s.recordsSave({module:'tasks',siteId:site,record:{data:{title:'Peer work',status:'Open'}}}).id;
 s.logout();s.login({username:'sup',password:'Supervisor123'});
 assert.deepEqual(s.recordsBatchStatus({module:'tasks',siteId:site,ids:[owned],status:'Done'}),{updated:1});
 assert.throws(()=>s.recordsSave({module:'tasks',siteId:site,record:{id:managerTask,data:{title:'Attempt',status:'Done'}}}),/trực thuộc/);
 assert.throws(()=>s.recordsBatchStatus({module:'tasks',siteId:site,ids:[owned,peerTask],status:'Done'}),/trực thuộc/);
 assert.equal(s.recordsList({module:'tasks',siteId:site}).find(x=>x.id===peerTask).data.status,'Open');
 assert.throws(()=>s.recordsDelete({module:'tasks',siteId:site,id:managerTask}),/trực thuộc/);
 }finally{s.db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
