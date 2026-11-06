
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Store}=require('../electron/storage.cjs');

test('dashboard with expiring warranty calculates successfully without inDays initialization error',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-warranty-'));
 const store=new Store(folder);
 try {
   await store.init();
   store.setup({name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Hotel'});
   const site=store.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
   const warranty=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
   store.recordsSave({siteId:site,module:'inventory',record:{data:{assetCode:'SV-01',name:'Server',warrantyUntil:warranty}}});
   const stats=store.dashboard(site);
   assert.equal(stats.warrantyStats.expiring90,1);
   assert.equal(stats.warrantySoon,1);
 } finally { store.db?.close();fs.rmSync(folder,{recursive:true,force:true});}
});

test('dashboard remains callable repeatedly with mixed expired and future contracts/assets',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-expiry-regression-'));
 const store=new Store(folder);
 const dayOffset=days=>{const now=new Date();const dt=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()+days));return dt.toISOString().slice(0,10)};
 try{
   await store.init();
   store.setup({name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Hotel'});
   const siteId=store.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
   store.recordsSave({module:'inventory',siteId,record:{data:{assetCode:'EXPIRED',name:'Old server',warrantyUntil:dayOffset(-2)}}});
   store.recordsSave({module:'inventory',siteId,record:{data:{assetCode:'SOON',name:'New switch',warrantyUntil:dayOffset(12)}}});
   store.recordsSave({module:'contracts',siteId,record:{data:{name:'Support',contractNo:'SP-01',endDate:dayOffset(40),status:'Active'}}});
   for(let i=0;i<3;i++){
     const summary=store.dashboard(siteId);
     assert.equal(summary.warrantyStats.expired,1);
     assert.equal(summary.warrantyStats.expiring90,1);
     assert.equal(summary.warrantySoon,1);
     assert.equal(summary.expiringContracts,1);
   }
 } finally {
   store.db?.close();
   fs.rmSync(folder,{recursive:true,force:true});
 }
});
