const {app,BrowserWindow,ipcMain,dialog,shell} = require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {Store}=require('./storage.cjs');
const {RemoteBridge}=require('./remote.cjs');
const ExcelJS=require('exceljs');
const QRCode=require('qrcode');
let store;
let remote;
let win;
const isDev=!!process.env.VITE_DEV_SERVER_URL;
const safeName=name=>String(name||'attachment').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
function startWindow(){
  win=new BrowserWindow({width:1440,height:900,minWidth:1000,minHeight:670,backgroundColor:'#F5F7FB',title:'Lotus IT Command',icon:path.join(__dirname,'../assets/icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false,webSecurity:true}});
  if(isDev)win.loadURL(process.env.VITE_DEV_SERVER_URL);else win.loadFile(path.join(__dirname,'../dist/index.html'));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,url)=>{if(url!==win.webContents.getURL())e.preventDefault();});
}
async function dispatch(action,p){
  p=p&&typeof p==='object'?p:{};
  if(action==='connection.status')return remote.status();
  if(action==='connection.configure'){
    if(store.session)store.logout();
    return remote.configure(p);
  }
  if(remote.enabled)return remote.invoke(action,p);
  switch(action){
    case 'app.info':return store.info();
    case 'auth.status':return store.status();
    case 'auth.setup':return store.setup(p);
    case 'auth.login':return store.login(p);
    case 'auth.logout':return store.logout();
    case 'auth.changePassword':return store.changePassword(p);
    case 'sites.list':return store.sites();
     case 'sites.switch':return store.siteSwitch(p);
    case 'sites.save':return store.siteSave(p);
    case 'users.list':return store.users();
    case 'users.save':return store.userSave(p);
    case 'users.password':return store.userPassword(p);
    case 'permissions.get':return store.permissions();
    case 'permissions.save':return store.permissionsSave(p);
    case 'records.list':return store.recordsList(p);
    case 'records.save':return store.recordsSave(p);
    case 'records.batchStatus':return store.recordsBatchStatus(p);
    case 'records.delete':return store.recordsDelete(p);
    case 'records.history':return store.recordsHistory(p);
    case 'checklist.mark':return store.checklistMark(p);
    case 'roster.batch':return store.rosterBatch(p);
    case 'contract.addenda.list':return store.contractAddendaList(p);
     case 'contract.addenda.save':return store.contractAddendumSave(p);
     case 'contract.addenda.delete':return store.contractAddendumDelete(p);
     case 'project.tasks.list':return store.projectTasksList(p);
    case 'project.tasks.save':return store.projectTaskSave(p);
    case 'project.tasks.delete':return store.projectTaskDelete(p);
    case 'dashboard.get':return store.dashboard(p.siteId);
    case 'settings.get':return store.settingsGet();
    case 'settings.save':return store.settingsSave(p);
    case 'audit.list':return store.auditList(p);
    case 'file.pick': {
      store.requireAuth();
      const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Tệp đính kèm',extensions:['jpg','jpeg','png','pdf','docx','xlsx','txt','webp']} ]});
      if(r.canceled||!r.filePaths[0])return null;
      const src=r.filePaths[0]; const stat=fs.statSync(src);
      if(stat.size>10*1024*1024)throw new Error('Tệp đính kèm vượt quá 10 MB.');
      const ext=path.extname(src).toLowerCase();
      if(!['.jpg','.jpeg','.png','.pdf','.docx','.xlsx','.txt','.webp'].includes(ext))throw new Error('Loại tệp không được cho phép.');
      const dir=path.join(app.getPath('userData'),'attachments');fs.mkdirSync(dir,{recursive:true});
      const filename=`${Date.now()}-${safeName(path.basename(src))}`;fs.copyFileSync(src,path.join(dir,filename));
      return{filename,originalName:path.basename(src),size:stat.size};
    }
    case 'file.open':{
      store.requireAuth();
      if(typeof p.filename!=='string'||!/^\d{10,}-[a-zA-Z0-9._-]{1,100}$/.test(p.filename))throw new Error('Tệp không hợp lệ.');
      const target=path.join(app.getPath('userData'),'attachments',p.filename);
      if(!fs.existsSync(target))throw new Error('Tệp đính kèm không tồn tại trên máy này.');
      return {error:await shell.openPath(target)};
    }
    case 'qr.print':{
      store.check('inventory',p.siteId,'read');
      const ids=Array.isArray(p.ids)?p.ids.slice(0,60):[];
      const data=store.recordsList({module:'inventory',siteId:p.siteId}).filter(x=>ids.includes(x.id));
      if(!data.length)throw new Error('Chưa chọn thiết bị.');
      const esc=x=>String(x??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
      const labels=[];
      for(const x of data){const d=x.data;const encoded=JSON.stringify({app:'Lotus IT Command',siteId:p.siteId,assetCode:d.assetCode||x.id});const q=await QRCode.toDataURL(encoded,{margin:1,width:180});labels.push(`<article><img src="${q}"/><strong>${esc(d.assetCode||x.id)}</strong><span>${esc(d.name||'Thiết bị IT')}</span><small>${esc(d.location||'')}</small></article>`);}
      const html=`<!doctype html><html><head><meta charset="utf-8"><title>Tem QR tài sản</title><style>body{font:13px Arial;margin:18px;color:#1c2433}header{margin-bottom:15px}section{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}article{border:1px dashed #999;border-radius:9px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px;break-inside:avoid;text-align:center}img{width:120px;height:120px}strong{font-size:15px}small{color:#777}@media print{header{display:none}body{margin:8mm}} </style></head><body><header>Tem QR offline • Nhấn Ctrl+P để in (QR chứa mã thiết bị, chưa có liên kết web công khai)</header><section>${labels.join('')}</section></body></html>`;
      const printWindow=new BrowserWindow({width:940,height:740,title:'Tem QR - Lotus IT Command',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
      printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));return{printed:data.length};
    }
    case 'reports.export':{
      store.check(p.module,p.siteId,'read');
      const ids=p.ids;
       if(ids!==undefined&&(!Array.isArray(ids)||ids.length>10000||ids.some(x=>typeof x!=='string')))throw new Error('Danh sách bản ghi xuất không hợp lệ.');
       const selected=Array.isArray(ids)?new Set(ids):null;
       const rows=store.recordsList({module:p.module,siteId:p.siteId}).filter(r=>!selected||selected.has(r.id));
      const cols=Array.isArray(p.columns)?p.columns.filter(x=>typeof x==='string'&&/^[a-zA-Z][\w]{0,39}$/.test(x)).slice(0,20):[];
      if(!cols.length)throw new Error('Không có cột báo cáo.');
      const labels=typeof p.labels==='object'&&p.labels?p.labels:{};
      const book=new ExcelJS.Workbook();book.creator='Lotus IT Command';book.created=new Date();
      const sheet=book.addWorksheet(String(p.module).slice(0,31),{pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0},views:[{state:'frozen',ySplit:1}]});
      sheet.columns=cols.map(c=>({header:String(labels[c]||c).slice(0,80),key:c,width:Math.max(16,Math.min(32,String(labels[c]||c).length+7))}));
      for(const row of rows)sheet.addRow(Object.fromEntries(cols.map(c=>[c,row.data[c]??''])));
      sheet.getRow(1).height=26;sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF234B8D'}};cell.alignment={vertical:'middle'};});
      for(let i=2;i<=sheet.rowCount;i++){const row=sheet.getRow(i);row.height=22;if(i%2===0)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6FA'}};});}
      sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:cols.length}};
      const result=await dialog.showSaveDialog(win,{defaultPath:`Lotus-${p.module}-${new Date().toISOString().slice(0,10)}.xlsx`,filters:[{name:'Excel workbook',extensions:['xlsx']}]});if(result.canceled||!result.filePath)return{cancelled:true};
      await book.xlsx.writeFile(result.filePath);store.transact(()=>store.audit('REPORT_EXPORT',p.siteId,{module:p.module,count:rows.length}));return{saved:true,path:result.filePath,count:rows.length};
    }
    case 'file.save':{
      store.requireAuth();
      if(!['xlsx','csv','pdf'].includes(p.extension))throw new Error('Định dạng không hợp lệ.');
      if(typeof p.base64!=='string'||p.base64.length>60*1024*1024)throw new Error('Kích thước báo cáo không hợp lệ.');
      const r=await dialog.showSaveDialog(win,{defaultPath:safeName(p.name||'report')+'.'+p.extension,filters:[{name:'Export',extensions:[p.extension]}]});
      if(r.canceled||!r.filePath)return{cancelled:true};
      fs.writeFileSync(r.filePath,Buffer.from(p.base64,'base64'));return{saved:true,path:r.filePath};
    }
    case 'backup.export':{
      const original=store.exportRaw();const r=await dialog.showSaveDialog(win,{defaultPath:'Lotus-IT-Backup-'+new Date().toISOString().slice(0,10)+'.db',filters:[{name:'Lotus IT database',extensions:['db']}]});
      if(r.canceled||!r.filePath)return{cancelled:true};fs.copyFileSync(original,r.filePath);return{saved:true,path:r.filePath};
    }
    case 'backup.import':{
      store.requireAdmin();const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Lotus IT database',extensions:['db']}]});if(r.canceled||!r.filePaths[0])return{cancelled:true};
      const bytes=fs.readFileSync(r.filePaths[0]);if(bytes.length>100*1024*1024)throw new Error('Backup quá lớn (trên 100MB).');return store.importRaw(bytes);
    }
    default:throw new Error('Unknown action');
  }
}
app.whenReady().then(async()=>{store=new Store(path.join(app.getPath('userData'),'storage'));await store.init();remote=new RemoteBridge(app.getPath('userData'));ipcMain.handle('lotus:invoke',(_e,action,payload)=>dispatch(action,payload));startWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)startWindow();});}).catch(e=>{dialog.showErrorBox('Không thể khởi động Lotus IT',String(e?.stack||e));app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});