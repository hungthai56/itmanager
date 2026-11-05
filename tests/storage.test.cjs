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
 assert.throws(()=>store.login({username:'admin',password:'wrong'}),/15 phút/);
 assert.throws(()=>store.login({username:'admin',password:'StrongPassword123'}),/khóa/);
 }finally{store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});