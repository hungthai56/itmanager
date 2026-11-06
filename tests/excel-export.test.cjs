const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const ExcelJS=require('exceljs');
const JSZip=createRequire(require.resolve('exceljs'))('jszip');

// Keep the real main-process dispatcher, SQLite store and XLSX implementation.
// Only Electron's window, lifecycle and save dialog are replaced; this is not a GUI test.
async function openMainProcess(folder,exportPath){
 const filename=path.resolve(__dirname,'../electron/main.cjs');
 const mainRequire=createRequire(filename);
 let handler,ready,fail;
 const registered=new Promise((resolve,reject)=>{ready=resolve;fail=reject});
 class Window {
  constructor(){this.webContents={setWindowOpenHandler(){},on(){},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}}
  loadFile(){}
  loadURL(){}
  static getAllWindows(){return []}
 }
 const electron={
  app:{getPath:()=>folder,whenReady:()=>Promise.resolve(),on(){},quit(){}},
  BrowserWindow:Window,
  ipcMain:{handle(channel,callback){assert.equal(channel,'lotus:invoke');handler=callback;ready()}},
  dialog:{showSaveDialog:async()=>({canceled:false,filePath:exportPath}),showErrorBox(_title,message){fail(new Error(message))}},
  shell:{}
 };
 const context=vm.createContext({
  require:id=>id==='electron'?electron:mainRequire(id),
  __dirname:path.dirname(filename),Buffer,
  process:{...process,env:{...process.env,VITE_DEV_SERVER_URL:''}}
 });
 new vm.Script(fs.readFileSync(filename,'utf8'),{filename}).runInContext(context);
 await registered;
 return {invoke:(action,payload={})=>handler({},action,payload),close:()=>vm.runInContext('store.db.close()',context)};
}

test('main-process invoke calculates expiry dashboard and exports only selected site records to XLSX',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-excel-'));
 const target=path.join(folder,'inventory.xlsx');
 let main;
 try{
  main=await openMainProcess(folder,target);
  const invoke=main.invoke;
  await invoke('auth.setup',{name:'Admin',username:'admin',password:'StrongPassword123',siteName:'Khách sạn Hoa Sen'});
  const site=(await invoke('auth.login',{username:'admin',password:'StrongPassword123'})).sites[0].id;
  const dateAfter=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  const selected=await invoke('records.save',{siteId:site,module:'inventory',record:{data:{assetCode:'SV-01',name:'Máy chủ lễ tân',purchasePrice:12500000,warrantyUntil:dateAfter(10)}}});
  await invoke('records.save',{siteId:site,module:'inventory',record:{data:{assetCode:'PC-02',name:'Không được chọn'}}});
  await invoke('records.save',{siteId:site,module:'contracts',record:{data:{name:'Hỗ trợ máy chủ',endDate:dateAfter(30)}}});
  const otherSite=(await invoke('sites.save',{code:'H2',name:'Khách sạn khác',currency:'VND'})).id;
  const foreign=await invoke('records.save',{siteId:otherSite,module:'inventory',record:{data:{assetCode:'FOREIGN',name:'Dữ liệu cơ sở khác'}}});
  const dashboard=await invoke('dashboard.get',{siteId:site});
  assert.equal(dashboard.warrantySoon,1);
  assert.equal(dashboard.warrantyStats.expiring90,1);
  assert.equal(dashboard.expiringContracts,1);
  const result=await invoke('reports.export',{siteId:site,module:'inventory',ids:[selected.id,foreign.id],columns:['assetCode','name','purchasePrice'],labels:{assetCode:'Mã tài sản',name:'Tên thiết bị',purchasePrice:'Giá mua'}});
  assert.equal(result.saved,true);
  assert.equal(result.count,1);
  const book=new ExcelJS.Workbook();
  await book.xlsx.readFile(target);
  const sheet=book.getWorksheet('inventory');
  assert.equal(book.creator,'Lotus IT Command');
  assert.equal(sheet.rowCount,2);
  assert.deepEqual(sheet.getRow(1).values.slice(1),['Mã tài sản','Tên thiết bị','Giá mua']);
  assert.deepEqual(sheet.getRow(2).values.slice(1),['SV-01','Máy chủ lễ tân',12500000]);
  assert.equal(sheet.getCell('A1').font.bold,true);
  assert.equal(sheet.views[0].state,'frozen');
  const audit=await invoke('audit.list',{siteId:site});
  assert.ok(audit.some(event=>event.action==='REPORT_EXPORT'&&JSON.parse(event.details).count===1));
 }finally{main?.close();fs.rmSync(folder,{recursive:true,force:true})}
});

test('XLSX extended conditional formatting generates distinct v4 IDs and survives a workbook round trip',async()=>{
 const book=new ExcelJS.Workbook();
 const sheet=book.addWorksheet('Báo cáo');
 sheet.addRows([['Thiết bị','Chi phí','Tiến độ'],['Máy chủ',-4,10],['Máy in',10,50],['Switch',20,90]]);
 sheet.addConditionalFormatting({ref:'B2:B4',rules:[{type:'dataBar',gradient:false,color:{argb:'FF638EC6'},cfvo:[{type:'min'},{type:'max'}]}]});
 sheet.addConditionalFormatting({ref:'C2:C4',rules:[{type:'iconSet',iconSet:'3Stars',cfvo:[{type:'percent',value:0},{type:'percent',value:33},{type:'percent',value:67}]}]});
 const bytes=await book.xlsx.writeBuffer();
 const zip=await JSZip.loadAsync(bytes);
 const xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
 const ids=Array.from(xml.matchAll(/<x14:cfRule\b[^>]*\bid="(\{[^\"]+\})"/g),match=>match[1]);
 assert.equal(ids.length,2,'data bar and extended icon set must both be serialized');
 assert.equal(new Set(ids).size,2);
 for(const id of ids)assert.match(id,/^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/);
 const restored=new ExcelJS.Workbook();
 await restored.xlsx.load(bytes);
 const reloaded=restored.getWorksheet('Báo cáo');
 assert.equal(reloaded.getCell('A2').value,'Máy chủ');
 assert.equal(reloaded.getCell('B2').value,-4);
 const rules=reloaded.conditionalFormattings.flatMap(format=>format.rules);
 assert.ok(rules.some(rule=>rule.type==='dataBar'&&rule.gradient===false));
 assert.ok(rules.some(rule=>rule.type==='iconSet'&&rule.iconSet==='3Stars'));
});
