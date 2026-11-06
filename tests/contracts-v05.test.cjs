const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Store}=require('../electron/storage.cjs');

test('contract addenda retain original term and calculate effective latest expiry',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-contracts-'));
 const s=new Store(dir);
 try {
  await s.init();s.setup({name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Grand Hotel'});
  const siteId=s.login({username:'admin',password:'StrongPassword123'}).sites[0].id;
  const contractId=s.recordsSave({module:'contracts',siteId,record:{data:{name:'Internet service',contractNo:'NET-2026',endDate:'2026-12-31',status:'Active'}}}).id;
  const a=s.contractAddendumSave({siteId,contractId,addendum:{addendum_no:'PL01',signed_date:'2026-11-06',new_end_date:'2027-12-31',amount:12000000,summary:'Year 2 renewal'}});
  const b=s.contractAddendumSave({siteId,contractId,addendum:{addendum_no:'PL02',new_end_date:'2028-03-31',amount:3000000,summary:'Extended 3 months'}});
  assert.equal(a.effectiveEndDate,'2027-12-31');
  assert.equal(b.effectiveEndDate,'2028-03-31');
  assert.equal(s.recordsList({module:'contracts',siteId})[0].data.endDate,'2026-12-31');
  assert.equal(s.recordsList({module:'contracts',siteId})[0].effectiveEndDate,'2028-03-31');
  assert.equal(s.contractAddendaList({siteId,contractId}).length,2);
  const other=s.siteSave({code:'OTHER',name:'Other Hotel',currency:'VND'}).id;
  assert.throws(()=>s.contractAddendaList({siteId:other,contractId}),/không tìm thấy/);
  assert.throws(()=>s.contractAddendumSave({siteId,contractId,addendum:{addendum_no:'Bad',new_end_date:'2026-13-54'}}),/hợp lệ/);
  s.contractAddendumDelete({siteId,contractId,id:b.id});
  assert.equal(s.recordsList({module:'contracts',siteId})[0].effectiveEndDate,'2027-12-31');
  s.recordsDelete({module:'contracts',siteId,id:contractId});
  assert.equal(s.all('SELECT COUNT(*) AS n FROM contract_addenda WHERE contract_id=?',[contractId])[0].n,0);
 } finally {s.db?.close();fs.rmSync(dir,{recursive:true,force:true})}
});
