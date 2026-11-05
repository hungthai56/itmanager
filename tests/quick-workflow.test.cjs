const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store}=require('../electron/storage.cjs');

test('quick bulk status updates are atomic, scoped, audited and role-protected',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-quick-'));
 const store=new Store(dir);
 try{
  await store.init();
  store.setup({name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Main Hotel'});
  const site=store.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
  const other=store.siteSave({name:'Second Hotel',code:'S2',currency:'VND'}).id;
  const first=store.recordsSave({siteId:site,module:'tasks',record:{data:{title:'NAS backup',status:'Open',assignedTo:'Admin'}}}).id;
  const second=store.recordsSave({siteId:site,module:'tasks',record:{data:{title:'Wi-Fi inspection',status:'Open'}}}).id;
  const foreign=store.recordsSave({siteId:other,module:'tasks',record:{data:{title:'Other hotel',status:'Open'}}}).id;
  assert.throws(()=>store.recordsBatchStatus({siteId:site,module:'tasks',ids:[first,foreign],status:'Done'}),/cơ sở/);
  assert.equal(store.recordsList({siteId:site,module:'tasks'}).find(x=>x.id===first).data.status,'Open');
  assert.throws(()=>store.recordsBatchStatus({siteId:site,module:'tasks',ids:[first],status:'Critical'}),/không hợp lệ/);
  assert.throws(()=>store.recordsBatchStatus({siteId:site,module:'projects',ids:[first],status:'Done'}),/không hợp lệ/);
  const result=store.recordsBatchStatus({siteId:site,module:'tasks',ids:[first,second,first],status:'Done'});
  assert.deepEqual(result,{updated:2});
  assert.equal(store.dashboard(site).openTasks,0);
  assert.equal(store.recordsHistory({siteId:site,module:'tasks',id:first})[0].action,'BATCH_STATUS');
  assert.deepEqual(store.recordsBatchStatus({siteId:site,module:'tasks',ids:[first,second],status:'Done'}),{updated:0});
  const asset=store.recordsSave({siteId:site,module:'inventory',record:{data:{assetCode:'IT-001',name:'Switch',status:'Active'}}}).id;
  assert.deepEqual(store.recordsBatchStatus({siteId:site,module:'inventory',ids:[asset],status:'Maintenance'}),{updated:1});
  store.userSave({username:'staff',full_name:'Technician',role:'STAFF',password:'StaffPassword123',siteIds:[site],active:true,force_reset:false});
  store.logout();
  store.login({username:'staff',password:'StaffPassword123'});
  const own=store.recordsSave({siteId:site,module:'tasks',record:{data:{title:'Own job',status:'Open'}}}).id;
  assert.throws(()=>store.recordsBatchStatus({siteId:site,module:'tasks',ids:[own,first],status:'In Progress'}),/của mình/);
  assert.equal(store.recordsList({siteId:site,module:'tasks'}).find(x=>x.id===own).data.status,'Open');
  assert.deepEqual(store.recordsBatchStatus({siteId:site,module:'tasks',ids:[own],status:'In Progress'}),{updated:1});
  assert.throws(()=>store.recordsBatchStatus({siteId:site,module:'inventory',ids:[asset],status:'Spare'}));
 } finally{store.db?.close();fs.rmSync(dir,{recursive:true,force:true})}
});