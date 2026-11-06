const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store}=require('../electron/storage.cjs');

test('bootstrap, admin login, site isolation, task CRUD and permission enforcement',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-it-test-'));
 const store=new Store(root);
 try{
  await store.init();
  assert.equal(store.info().ready,false);
  assert.equal(store.sites,store.sites);
  store.setup({name:'IT Admin',username:'admin',password:'StrongPassword123',siteName:'Demo Hotel'});
  assert.equal(store.info().ready,true);
  assert.throws(()=>store.setup({name:'Again',username:'admin2',password:'Password1234',siteName:'Hotel'}));
  const auth=store.login({username:'admin',password:'StrongPassword123'});
  assert.equal(auth.user.role,'SYS');
  const firstSite=auth.sites[0].id;
  const created=store.recordsSave({siteId:firstSite,module:'tasks',record:{data:{title:'Check backup',status:'Open'}}});
  assert.equal(store.recordsList({siteId:firstSite,module:'tasks'}).length,1);
  assert.equal(store.dashboard(firstSite).openTasks,1);
  store.recordsSave({siteId:firstSite,module:'tasks',record:{id:created.id,data:{title:'Check backup',status:'Done'}}});
  assert.equal(store.dashboard(firstSite).openTasks,0);
  assert.throws(()=>store.recordsSave({siteId:firstSite,module:'checklists',record:{data:{title:'NAS',status:'Not Done',reason:''}}}));
  const branch=store.siteSave({code:'H2',name:'Second Hotel',currency:'VND'});
  assert.equal(store.recordsList({siteId:branch.id,module:'tasks'}).length,0);
  store.userSave({username:'staff',full_name:'IT Staff',role:'STAFF',password:'StaffPassword123',siteIds:[firstSite],active:true,force_reset:false});
  store.logout();
  const staff=store.login({username:'staff',password:'StaffPassword123'});
  assert.equal(staff.sites.length,1);
  assert.throws(()=>store.recordsList({siteId:branch.id,module:'tasks'}));
  assert.throws(()=>store.recordsSave({siteId:firstSite,module:'capex',record:{data:{name:'New PC'}}}));
  assert.throws(()=>store.recordsDelete({siteId:firstSite,module:'tasks',id:created.id}));
  assert.ok(fs.existsSync(path.join(root,'lotus-it.db')));
 } finally {store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('failed login attempts lock account, and good password needs at least 10 characters',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-it-auth-'));const store=new Store(root);
 try{await store.init();assert.throws(()=>store.setup({name:'Admin',username:'admin',password:'weak',siteName:'Hotel'}));store.setup({name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Hotel'});
 for(let i=0;i<4;i++)assert.throws(()=>store.login({username:'admin',password:'wrong'}));
 assert.throws(()=>store.login({username:'admin',password:'wrong'}),/khóa/);
 assert.throws(()=>store.login({username:'admin',password:'StrongPassword123'}),/khóa/);
 }finally{store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('demo v0.2: checklist schedule, reason, actor audit and unique period entry',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-it-check-'));const store=new Store(root);
 try{
  await store.init();store.setup({name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Hotel'});
  const siteId=store.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
  assert.throws(()=>store.checklistMark({siteId,name:'Kiểm tra Backup',frequency:'Daily',date:'2026-11-05',status:'Not Done'}),/lý do/);
  store.checklistMark({siteId,name:'Kiểm tra Backup',frequency:'Daily',date:'2026-11-05',status:'Not Done',reason:'Backup failed'});
  store.checklistMark({siteId,name:'Kiểm tra Backup',frequency:'Daily',date:'2026-11-05',status:'Done'});
  assert.equal(store.recordsList({module:'checklists',siteId}).length,1);
  const check=store.recordsList({module:'checklists',siteId})[0];
  assert.equal(check.data.status,'Done');assert.equal(check.data.checkedBy,'Admin');
  assert.equal(store.recordsHistory({module:'checklists',siteId,id:check.id}).length,2);
  store.settingsSave({key:'checklistTemplates',value:[{name:'Weekly printer',frequency:'Weekly'}]});
  store.checklistMark({siteId,name:'Weekly printer',frequency:'Weekly',date:'2026-11-05',status:'Done'});
  store.checklistMark({siteId,name:'Weekly printer',frequency:'Weekly',date:'2026-11-06',status:'Not Done',reason:'pending service'});
  assert.equal(store.recordsList({module:'checklists',siteId}).length,2);
  assert.throws(()=>store.checklistMark({siteId,name:'Invalid',frequency:'Weekly',date:'2026-11-06',status:'Done'}),/không tồn tại/);
 }finally{store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('demo v0.2: batch roster upsert and project task registry updates progress',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-it-roster-'));const store=new Store(root);
 try{
  await store.init();store.setup({name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Hotel'});
  const siteId=store.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
  store.rosterBatch({siteId,employee:'David',dates:['2026-11-05','2026-11-06'],shift:'HD'});
  assert.equal(store.recordsList({siteId,module:'roster'}).length,2);
  store.rosterBatch({siteId,employee:'David',dates:['2026-11-05'],shift:'D'});
  assert.equal(store.recordsList({siteId,module:'roster'}).length,2);
  assert.equal(store.recordsList({siteId,module:'roster'}).find(r=>r.data.date==='2026-11-05').data.factor,1);
  assert.throws(()=>store.rosterBatch({siteId,employee:'David',dates:['2026-11-05','2026-11-05'],shift:'N'}),/không trùng/);
  const project=store.recordsSave({siteId,module:'projects',record:{data:{name:'WiFi Upgrade',progress:0}}});
  const a=store.projectTaskSave({siteId,projectId:project.id,task:{title:'Survey',status:'Done'}});
  const b=store.projectTaskSave({siteId,projectId:project.id,task:{title:'Configure',status:'Not Started'}});
  assert.equal(store.recordsList({siteId,module:'projects'})[0].data.progress,50);
  store.projectTaskSave({siteId,projectId:project.id,task:{id:b.id,title:'Configure',status:'Done'}});
  assert.equal(store.recordsList({siteId,module:'projects'})[0].data.progress,100);
  assert.equal(store.projectTasksList({siteId,projectId:project.id}).length,2);
  store.projectTaskDelete({siteId,projectId:project.id,id:a.id});
  assert.equal(store.projectTasksList({siteId,projectId:project.id}).length,1);
  const branch=store.siteSave({code:'B2',name:'Another site',currency:'VND'});
  assert.throws(()=>store.projectTasksList({siteId:branch.id,projectId:project.id}),/Không tìm thấy/);
  store.userSave({username:'employee',full_name:'Employee',role:'STAFF',password:'StaffPassword123',siteIds:[siteId],active:1,force_reset:0});
  store.logout();store.login({username:'employee',password:'StaffPassword123'});
  assert.throws(()=>store.projectTaskSave({siteId,projectId:project.id,task:{title:'Hacked',status:'Done'}}),/quyền/);
 }finally{store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('demo v0.2: change history and unique inventory asset code',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-it-history-'));const store=new Store(root);
 try{
  await store.init();store.setup({name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Hotel'});
  const siteId=store.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
  const asset=store.recordsSave({siteId,module:'inventory',record:{data:{assetCode:'GLG-PC001',name:'Front Office PC',location:'Front desk'}}});
  assert.throws(()=>store.recordsSave({siteId,module:'inventory',record:{data:{assetCode:'glg-pc001',name:'Duplicated'}}}),/tồn tại/);
  store.recordsSave({siteId,module:'inventory',record:{id:asset.id,data:{assetCode:'GLG-PC001',name:'Front Office PC',location:'Back office'}}});
  const history=store.recordsHistory({siteId,module:'inventory',id:asset.id});
  assert.equal(history.length,2);assert.equal(history[0].action,'UPDATE');assert.equal(JSON.parse(history[0].before_data).location,'Front desk');
  assert.equal(JSON.parse(history[0].after_data).location,'Back office');
 }finally{store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});