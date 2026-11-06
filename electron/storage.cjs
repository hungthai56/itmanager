const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js/dist/sql-asm.js');

const MODULES = ['tasks','checklists','roster','inventory','contracts','pl','capex','projects','knowledge'];
const ROLES = ['SYS','MANAGER','SUPERVISOR','STAFF'];
const WRITE_DEFAULT = {
  SYS: MODULES,
  MANAGER: MODULES,
  SUPERVISOR: ['tasks','checklists','roster','inventory','contracts','projects','knowledge'],
  STAFF: ['tasks','checklists','roster','knowledge']
};
const READ_DEFAULT = {
  SYS: MODULES, MANAGER: MODULES, SUPERVISOR: MODULES,
  STAFF: ['tasks','checklists','roster','inventory','contracts','projects','knowledge']
};
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const isoDay = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function periodKey(date, frequency) {
  if(!isoDay(date))throw new Error('Ngày không hợp lệ (YYYY-MM-DD).');
  if(frequency==='Weekly') {
    const monday=new Date(date+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
    return monday.toISOString().slice(0,10);
  }
  if(frequency==='Monthly')return date.slice(0,7);
  if(frequency==='Quarterly')return date.slice(0,4)+'-Q'+(Math.floor((Number(date.slice(5,7))-1)/3)+1);
  if(frequency==='Semiannual')return date.slice(0,4)+'-H'+(Number(date.slice(5,7))<=6?'1':'2');
  if(frequency==='Yearly')return date.slice(0,4);
  return date;
}
const DEFAULT_SHIFTS=[{code:'D',factor:1},{code:'N',factor:1},{code:'HD',factor:.5},{code:'AL',factor:0},{code:'DO',factor:0}];
const DEFAULT_CHECKLISTS=[{name:'Kiểm tra Backup',frequency:'Daily'},{name:'Kiểm tra NAS / Server',frequency:'Daily'}];
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({salt, hash: crypto.scryptSync(password, salt, 64).toString('hex')});
const secureCompare = (a,b) => {
  const aa = Buffer.from(a || '', 'hex'), bb = Buffer.from(b || '', 'hex');
  return aa.length === bb.length && aa.length !== 0 && crypto.timingSafeEqual(aa,bb);
};
const passwordOkay = x => typeof x === 'string' && x.length >= 10 && /[A-Za-z]/.test(x) && /\d/.test(x);

class Store {
  constructor(folder) { this.folder=folder; this.file=path.join(folder,'lotus-it.db'); this.db=null; this.session=null; }
  async init() {
    fs.mkdirSync(this.folder,{recursive:true});
    const SQL=await initSqlJs();
    this.db=fs.existsSync(this.file) ? new SQL.Database(fs.readFileSync(this.file)) : new SQL.Database();
    this.db.run(`CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,currency TEXT NOT NULL DEFAULT 'VND',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,full_name TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,force_reset INTEGER NOT NULL DEFAULT 0,default_site_id TEXT,report_to TEXT,overrides TEXT NOT NULL DEFAULT '{}',failed_attempts INTEGER NOT NULL DEFAULT 0,locked_until TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_sites(user_id TEXT NOT NULL,site_id TEXT NOT NULL,PRIMARY KEY(user_id,site_id));
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,module TEXT NOT NULL,data TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_scope ON records(site_id,module,updated_at);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT,username TEXT,action TEXT NOT NULL,site_id TEXT,details TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS role_permissions(role TEXT NOT NULL,module TEXT NOT NULL,can_read INTEGER NOT NULL,can_write INTEGER NOT NULL,PRIMARY KEY(role,module));`);
    for (const role of ROLES) for (const mod of MODULES) this.db.run('INSERT OR IGNORE INTO role_permissions VALUES(?,?,?,?)',[role,mod,READ_DEFAULT[role].includes(mod)?1:0,WRITE_DEFAULT[role].includes(mod)?1:0]);
    if (!this.one('SELECT id FROM sites LIMIT 1')) this.db.run('INSERT INTO sites VALUES(?,?,?,?,?)',[uuid(),'GLG','Golden Lotus Grand Hotel','VND',now()]);
    this.ensureUpgradeTables();
    this.persist();
  }
  ensureUpgradeTables(){
    this.db.run(`CREATE TABLE IF NOT EXISTS record_history(id TEXT PRIMARY KEY,record_id TEXT NOT NULL,site_id TEXT NOT NULL,module TEXT NOT NULL,action TEXT NOT NULL,before_data TEXT,after_data TEXT,username TEXT,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS history_record_scope ON record_history(record_id,site_id,module,created_at);
    CREATE TABLE IF NOT EXISTS project_tasks(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,project_id TEXT NOT NULL,title TEXT NOT NULL,owner TEXT,due_date TEXT,status TEXT NOT NULL,notes TEXT,created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS project_tasks_scope ON project_tasks(site_id,project_id);
    CREATE TABLE IF NOT EXISTS contract_addenda(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,contract_id TEXT NOT NULL,addendum_no TEXT NOT NULL,signed_date TEXT,new_start_date TEXT,new_end_date TEXT NOT NULL,amount REAL NOT NULL DEFAULT 0,summary TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS contract_addenda_scope ON contract_addenda(site_id,contract_id,new_end_date);`);
    const userColumns=this.all('PRAGMA table_info(users)').map(c=>c.name);
    if(!userColumns.includes('account_locked'))this.run('ALTER TABLE users ADD COLUMN account_locked INTEGER NOT NULL DEFAULT 0');
    if(!userColumns.includes('job_title'))this.run("ALTER TABLE users ADD COLUMN job_title TEXT NOT NULL DEFAULT ''");
    if(!userColumns.includes('department'))this.run("ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''");
  }
  all(sql,p=[]) { const s=this.db.prepare(sql); try { s.bind(p); const a=[]; while(s.step()) a.push(s.getAsObject()); return a; } finally{s.free();} }
  one(sql,p=[]) { return this.all(sql,p)[0] || null; }
  run(sql,p=[]) { this.db.run(sql,p); }
  persist() { const temp=this.file+'.tmp'; fs.writeFileSync(temp,Buffer.from(this.db.export())); fs.renameSync(temp,this.file); }
  transact(fn) { this.db.run('BEGIN'); try { const res=fn(); this.db.run('COMMIT'); this.persist(); return res; } catch(e) {this.db.run('ROLLBACK');throw e;} }
  audit(action,site,details) {this.run('INSERT INTO audit VALUES(?,?,?,?,?,?,?)',[uuid(),this.session?.id??null,this.session?.username??null,action,site||null,JSON.stringify(details??{}),now()]);}
  get userCount() {return this.one('SELECT COUNT(*) n FROM users').n;}
  info(){ return {ready:this.userCount>0, version:'0.5.0', dataPath:this.folder, modules:MODULES}; }
  setup({name,username,password,siteName}) {
    if(this.userCount) throw new Error('Hệ thống đã được khởi tạo.');
    if(!name?.trim()||!username?.trim()||!siteName?.trim()||!passwordOkay(password)) throw new Error('Điền đủ thông tin. Mật khẩu phải từ 10 ký tự, có chữ và số.');
    return this.transact(()=> {
      const site=this.one('SELECT id FROM sites LIMIT 1'); const usr=uuid(); const h=hashPassword(password);
      this.run('UPDATE sites SET name=? WHERE id=?',[siteName.trim(),site.id]);
      this.run('INSERT INTO users(id,username,full_name,role,password_hash,salt,active,default_site_id,created_at) VALUES(?,?,?,?,?,?,1,?,?)',[usr,username.trim().toLowerCase(),name.trim(),'SYS',h.hash,h.salt,site.id,now()]);
      this.run('INSERT INTO user_sites VALUES(?,?)',[usr,site.id]);
      this.audit('SETUP',site.id,{username});
      return {success:true};
    });
  }
  login({username,password}) {
    if (typeof username!=='string'||typeof password!=='string') throw new Error('Thông tin đăng nhập không hợp lệ.');
    const u=this.one('SELECT * FROM users WHERE username=?',[username.toLowerCase().trim()]);
    if (!u) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng.');
    if(!u.active) throw new Error('Tài khoản đã bị vô hiệu hóa.');
    if(u.account_locked)throw new Error('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên để mở khóa.');
    if(u.locked_until && u.locked_until>now()) throw new Error('Tài khoản đang bị khóa tạm thời. Vui lòng thử lại sau.');
    const ok=secureCompare(crypto.scryptSync(password,u.salt,64).toString('hex'),u.password_hash);
    if (!ok) {
      const attempts=(u.locked_until&&u.locked_until<=now()?0:u.failed_attempts)+1;
      const locked=attempts>=5;
      this.transact(()=> {this.run('UPDATE users SET failed_attempts=?,locked_until=NULL,account_locked=? WHERE id=?',[attempts,locked?1:0,u.id]);this.run('INSERT INTO audit VALUES(?,?,?,?,?,?,?)',[uuid(),u.id,u.username,'LOGIN_FAILED',null,JSON.stringify({locked,attempts}),now()]);});
      throw new Error(locked?'Nhập sai 5 lần. Tài khoản bị khóa cho đến khi quản trị viên mở khóa.':`Sai mật khẩu. Còn ${5-attempts} lần thử.`);
    }
    this.transact(()=>this.run('UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=?',[u.id]));
    this.session={id:u.id,username:u.username,name:u.full_name,role:u.role,forceReset:!!u.force_reset,siteId:u.default_site_id,overrides:JSON.parse(u.overrides||'{}')};
    this.transact(()=>this.audit('LOGIN',this.session.siteId,{}));
    return this.status();
  }
  status() {return this.session?{authenticated:true,user:this.session,sites:this.sites()}: {authenticated:false,ready:this.userCount>0,sites:this.all('SELECT id,code,name,currency,created_at FROM sites ORDER BY name')};}
  siteSwitch({siteId}){this.siteAllowed(siteId);this.session.siteId=siteId;return {siteId};}
  logout() {if(this.session)this.transact(()=>this.audit('LOGOUT',this.session.siteId,{}));this.session=null;return {authenticated:false};}
  requireAuth() {if(!this.session)throw new Error('Vui lòng đăng nhập lại.');}
  requireAdmin() {this.requireAuth();if(this.session.role!=='SYS')throw new Error('Chỉ quản trị hệ thống được thực hiện.');}
  siteAllowed(siteId){ this.requireAuth(); if(typeof siteId!=='string'||!this.sites().some(s=>s.id===siteId))throw new Error('Không có quyền truy cập cơ sở này.'); }
  sites(){this.requireAuth();return this.session.role==='SYS'?this.all('SELECT * FROM sites ORDER BY name'):this.all('SELECT s.* FROM sites s JOIN user_sites us ON us.site_id=s.id WHERE us.user_id=? ORDER BY s.name',[this.session.id]);}
  check(module,siteId,mode){
    this.siteAllowed(siteId);
    if(!MODULES.includes(module))throw new Error('Phân hệ không hợp lệ.');
    if(this.session.forceReset)throw new Error('Vui lòng thay đổi mật khẩu trước khi tiếp tục.');
    if(this.session.role==='SYS')return;
    const override=this.session.overrides?.[module]?.[mode];
    if(override==='deny')throw new Error('Tài khoản không có quyền sử dụng chức năng này.');
    if(override==='allow')return;
    const p=this.one('SELECT * FROM role_permissions WHERE role=? AND module=?',[this.session.role,module]);
    if(!(mode==='write'?p?.can_write:p?.can_read))throw new Error('Bạn chỉ có quyền xem hoặc không có quyền truy cập phân hệ này.');
  }
  permissions(){this.requireAuth();return {role:this.session.role,rows:this.all('SELECT * FROM role_permissions ORDER BY role,module'),overrides:this.session.overrides};}
  permissionsSave({rows}){this.requireAdmin();if(!Array.isArray(rows))throw new Error('Dữ liệu không hợp lệ.');return this.transact(()=>{for(const r of rows){if(!ROLES.includes(r.role)||!MODULES.includes(r.module)||r.role==='SYS')continue;this.run('UPDATE role_permissions SET can_read=?,can_write=? WHERE role=? AND module=?',[r.can_read?1:0,r.can_write?1:0,r.role,r.module]);}this.audit('PERMISSIONS_UPDATE',null,{});return this.permissions();});}
  siteSave(s){this.requireAdmin();if(!s.name?.trim()||!s.code?.trim()||!s.currency?.trim())throw new Error('Thiếu tên, mã cơ sở hoặc tiền tệ.');return this.transact(()=>{const id=s.id||uuid();if(s.id){if(!this.one('SELECT id FROM sites WHERE id=?',[id]))throw new Error('Cơ sở không tồn tại.');this.run('UPDATE sites SET code=?,name=?,currency=? WHERE id=?',[s.code.trim().toUpperCase(),s.name.trim(),s.currency.trim().toUpperCase(),id]);}else this.run('INSERT INTO sites VALUES(?,?,?,?,?)',[id,s.code.trim().toUpperCase(),s.name.trim(),s.currency.trim().toUpperCase(),now()]);this.audit('SITE_SAVE',id,{code:s.code});return {id};});}
  users(){this.requireAdmin();return this.all('SELECT id,username,full_name,role,job_title,department,active,account_locked,force_reset,default_site_id,report_to,overrides,created_at FROM users ORDER BY full_name').map(u=>({...u,siteIds:this.all('SELECT site_id FROM user_sites WHERE user_id=?',[u.id]).map(r=>r.site_id)}));}
  userSave(u){this.requireAdmin();if(!u.username?.trim()||!u.full_name?.trim()||!ROLES.includes(u.role))throw new Error('Thông tin nhân sự chưa hợp lệ.');if(!u.id&&!passwordOkay(u.password))throw new Error('Mật khẩu phải từ 10 ký tự, có chữ và số.');const allSites=this.all('SELECT id FROM sites').map(x=>x.id);const assigned=[...new Set((u.siteIds||[]).filter(x=>allSites.includes(x)))];if(!assigned.length)throw new Error('Cần cấp ít nhất một cơ sở.');return this.transact(()=>{const id=u.id||uuid();if(u.id){if(!this.one('SELECT id FROM users WHERE id=?',[id]))throw new Error('Không tìm thấy người dùng.');if(this.session.id===id&&(!u.active||u.role!=='SYS'))throw new Error('Không thể tự khóa hoặc hạ quyền quản trị của mình.');this.run('UPDATE users SET username=?,full_name=?,job_title=?,department=?,role=?,active=?,account_locked=?,failed_attempts=?,locked_until=NULL,force_reset=?,default_site_id=?,report_to=?,overrides=? WHERE id=?',[u.username.trim().toLowerCase(),u.full_name.trim(),String(u.job_title||'').slice(0,100),String(u.department||'').slice(0,100),u.role,u.active?1:0,u.account_locked?1:0,u.account_locked?5:0,u.force_reset?1:0,assigned.includes(u.default_site_id)?u.default_site_id:assigned[0],u.report_to||null,JSON.stringify(u.overrides||{}),id]);}else{const h=hashPassword(u.password);this.run('INSERT INTO users(id,username,full_name,job_title,department,role,password_hash,salt,active,force_reset,default_site_id,report_to,overrides,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,u.username.trim().toLowerCase(),u.full_name.trim(),String(u.job_title||'').slice(0,100),String(u.department||'').slice(0,100),u.role,h.hash,h.salt,1,u.force_reset?1:0,assigned.includes(u.default_site_id)?u.default_site_id:assigned[0],u.report_to||null,JSON.stringify(u.overrides||{}),now()]);}this.run('DELETE FROM user_sites WHERE user_id=?',[id]);for(const sid of assigned)this.run('INSERT INTO user_sites VALUES(?,?)',[id,sid]);this.audit('USER_SAVE',null,{username:u.username,id});return{id};});}
  userPassword({userId,password}){this.requireAdmin();if(!passwordOkay(password))throw new Error('Mật khẩu tối thiểu 10 ký tự, chứa chữ và số.');const h=hashPassword(password);return this.transact(()=>{this.run('UPDATE users SET password_hash=?,salt=?,force_reset=1,failed_attempts=0,locked_until=NULL,account_locked=0 WHERE id=?',[h.hash,h.salt,userId]);this.audit('USER_PASSWORD_RESET',null,{userId});return{success:true};});}
  changePassword({oldPassword,newPassword}){this.requireAuth();if(!passwordOkay(newPassword))throw new Error('Mật khẩu mới tối thiểu 10 ký tự, gồm chữ và số.');const u=this.one('SELECT * FROM users WHERE id=?',[this.session.id]);const old=crypto.scryptSync(oldPassword||'',u.salt,64).toString('hex');if(!secureCompare(old,u.password_hash))throw new Error('Mật khẩu cũ không đúng.');const h=hashPassword(newPassword);return this.transact(()=>{this.run('UPDATE users SET password_hash=?,salt=?,force_reset=0 WHERE id=?',[h.hash,h.salt,u.id]);this.session.forceReset=false;this.audit('PASSWORD_CHANGED',null,{});return{success:true};});}
  canManageRecord(record,module){
    if(this.session.role==='SYS'||this.session.role==='MANAGER')return true;
    if(record.created_by===this.session.id)return true;
    if(this.session.role==='STAFF')return false;
    if(module!=='tasks'||this.session.role!=='SUPERVISOR')return true;
    const owner=this.one('SELECT role,report_to FROM users WHERE id=?',[record.created_by]);
    if(owner?.role==='STAFF'&&owner.report_to===this.session.id)return true;
    const assigned=String(JSON.parse(record.data).assignedTo||'').trim().toLowerCase();
    if(!assigned)return false;
    return this.all('SELECT id,username,full_name FROM users WHERE role=? AND report_to=?',['STAFF',this.session.id])
      .some(u=>[u.id,u.username,u.full_name.toLowerCase()].includes(assigned));
  }
  ensureManageRecord(record,module){
    if(!this.canManageRecord(record,module))throw new Error('Bạn chỉ được sửa công việc của mình hoặc nhân viên trực thuộc (quyền của mình).');
  }
  recordsList({module,siteId}){this.check(module,siteId,'read');return this.all('SELECT * FROM records WHERE module=? AND site_id=? ORDER BY updated_at DESC',[module,siteId]).map(x=>({...x,data:JSON.parse(x.data),can_edit:this.canManageRecord(x,module),...(module==='contracts'?{effectiveEndDate:this.contractEffectiveEnd(x.id,siteId,JSON.parse(x.data).endDate)}:{})}));}
  historyWrite({id,siteId,module,action,before,after}){
    this.run('INSERT INTO record_history VALUES(?,?,?,?,?,?,?,?,?)',[uuid(),id,siteId,module,action,before||null,after||null,this.session.username,now()]);
  }
  recordsHistory({module,siteId,id}){
    this.check(module,siteId,'read');
    if(!id||typeof id!=='string')throw new Error('Thiếu mã bản ghi.');
    const exists=this.one('SELECT id FROM records WHERE id=? AND module=? AND site_id=?',[id,module,siteId]);
    if(!exists)throw new Error('Không tìm thấy bản ghi tại cơ sở này.');
    return this.all('SELECT * FROM record_history WHERE record_id=? AND site_id=? AND module=? ORDER BY created_at DESC LIMIT 100',[id,siteId,module]);
  }
  recordsSave({module,siteId,record}){
    this.check(module,siteId,'write');
    if(!record||!record.data||typeof record.data!=='object'||Array.isArray(record.data))throw new Error('Dữ liệu không hợp lệ.');
    const raw=JSON.stringify(record.data);
    if(raw.length>200000)throw new Error('Nội dung vượt giới hạn lưu trữ.');
    if(!Object.values(record.data).some(x=>String(x??'').trim()))throw new Error('Hãy nhập ít nhất một thông tin.');
    if(module==='checklists'&&record.data.status==='Not Done'&&!String(record.data.reason||'').trim())throw new Error('Cần nhập lý do khi đánh dấu Not Done.');
    if(module==='inventory'){
      const code=String(record.data.assetCode||'').trim();if(!code)throw new Error('Cần nhập mã thiết bị.');
      const duplicates=this.all('SELECT id,data FROM records WHERE site_id=? AND module=?',[siteId,'inventory']).some(r=>r.id!==record.id&&String(JSON.parse(r.data).assetCode||'').toLowerCase()===code.toLowerCase());
      if(duplicates)throw new Error('Mã thiết bị đã tồn tại trong cơ sở này.');
    }
    return this.transact(()=>{
      const id=record.id||uuid();
      const old=record.id?this.one('SELECT * FROM records WHERE id=? AND site_id=? AND module=?',[id,siteId,module]):null;
      if(record.id&&!old)throw new Error('Không tìm thấy bản ghi ở cơ sở này.');
      if(old)this.ensureManageRecord(old,module);
      if(old)this.run('UPDATE records SET data=?,updated_at=? WHERE id=?',[raw,now(),id]);
      else this.run('INSERT INTO records VALUES(?,?,?,?,?,?,?)',[id,siteId,module,raw,this.session.id,now(),now()]);
      this.historyWrite({id,siteId,module,action:old?'UPDATE':'CREATE',before:old?.data,after:raw});
      this.audit('RECORD_SAVE',siteId,{module,id});return {id};
    });
  }
  recordsBatchStatus({module,siteId,ids,status}){
    this.check(module,siteId,'write');
    const values={tasks:['Open','In Progress','Done'],inventory:['Active','Spare','Maintenance','Retired']};
    if(!values[module]||!values[module].includes(status))throw new Error('Trạng thái không hợp lệ.');
    if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!id))throw new Error('Danh sách lựa chọn không hợp lệ (tối đa 500).');
    const unique=[...new Set(ids)];
    // Pre-validate all records, site isolation, and STAFF ownership before any write.
    const originals=unique.map(id=>this.one('SELECT * FROM records WHERE id=? AND site_id=? AND module=?',[id,siteId,module]));
    if(originals.some(row=>!row))throw new Error('Có bản ghi không tồn tại trong cơ sở này.');
    for(const row of originals)this.ensureManageRecord(row,module);
    return this.transact(()=>{
      let updated=0;
      for(const old of originals){
        const before=JSON.parse(old.data);
        if(before.status===status)continue;
        const after=JSON.stringify({...before,status});
        this.run('UPDATE records SET data=?,updated_at=? WHERE id=? AND site_id=? AND module=?',[after,now(),old.id,siteId,module]);
        this.historyWrite({id:old.id,siteId,module,action:'BATCH_STATUS',before:old.data,after});
        updated++;
      }
      this.audit('RECORD_BATCH_STATUS',siteId,{module,status,requested:unique.length,updated});
      return {updated};
    });
  }
  recordsDelete({module,siteId,id}){
    this.check(module,siteId,'write');
    const old=this.one('SELECT * FROM records WHERE id=? AND module=? AND site_id=?',[id,module,siteId]);
    if(!old)throw new Error('Không tìm thấy bản ghi.');
    this.ensureManageRecord(old,module);
    return this.transact(()=>{
      if(module==='projects')this.run('DELETE FROM project_tasks WHERE project_id=? AND site_id=?',[id,siteId]);if(module==='contracts')this.run('DELETE FROM contract_addenda WHERE contract_id=? AND site_id=?',[id,siteId]);
      this.historyWrite({id,siteId,module,action:'DELETE',before:old.data});
      this.run('DELETE FROM records WHERE id=? AND module=? AND site_id=?',[id,module,siteId]);
      this.audit('RECORD_DELETE',siteId,{module,id});return{success:true};
    });
  }
  checklistMark({siteId,name,frequency,date,status,reason='',note=''}){
    this.check('checklists',siteId,'write');
    if(typeof name!=='string'||!name.trim()||name.length>180||!['Daily','Weekly','Monthly','Quarterly','Semiannual','Yearly','Custom'].includes(frequency))throw new Error('Mẫu checklist không hợp lệ.');
    if(!['Done','Not Done'].includes(status))throw new Error('Kết quả kiểm tra không hợp lệ.');
    if(status==='Not Done'&&!String(reason||'').trim())throw new Error('Cần nhập lý do khi chưa hoàn thành.');
    const rawTemplate=this.one('SELECT value FROM settings WHERE key=?',['checklistTemplates']);
    const templates=rawTemplate?JSON.parse(rawTemplate.value):DEFAULT_CHECKLISTS;
    if(!Array.isArray(templates)||!templates.some(t=>t.name===name&&t.frequency===frequency))throw new Error('Mẫu checklist không tồn tại trong cài đặt.');
    const pkey=periodKey(date,frequency),key=frequency+'::'+name.trim().toLocaleLowerCase('en-US');
    const list=this.all('SELECT * FROM records WHERE site_id=? AND module=?',[siteId,'checklists']);
    const old=list.find(r=>{const d=JSON.parse(r.data);return d.boardKey===key&&d.periodKey===pkey;});
    if(old&&this.session.role==='STAFF'&&old.created_by!==this.session.id)throw new Error('Bạn không được sửa lượt kiểm tra của người khác.');
    const data={...(old?JSON.parse(old.data):{}),title:name.trim(),frequency,boardKey:key,periodKey:pkey,checkedAt:date,status,reason:status==='Not Done'?String(reason).trim():'',note:String(note||'').slice(0,2000),checkedBy:this.session.name,checkedTime:now()};
    const raw=JSON.stringify(data);const id=old?.id||uuid();
    return this.transact(()=>{
      if(old)this.run('UPDATE records SET data=?,updated_at=? WHERE id=?',[raw,now(),id]);
      else this.run('INSERT INTO records VALUES(?,?,?,?,?,?,?)',[id,siteId,'checklists',raw,this.session.id,now(),now()]);
      this.historyWrite({id,siteId,module:'checklists',action:old?'CHECK_AGAIN':'CHECK',before:old?.data,after:raw});
      this.audit('CHECKLIST_MARK',siteId,{id,name,status,periodKey:pkey});return {id};
    });
  }
  rosterBatch({siteId,employee,dates,shift,note=''}){
    this.check('roster',siteId,'write');
    if(typeof employee!=='string'||!employee.trim()||employee.length>150)throw new Error('Nhập tên nhân sự.');
    if(!Array.isArray(dates)||dates.length<1||dates.length>62||new Set(dates).size!==dates.length||!dates.every(isoDay))throw new Error('Chọn 1–62 ngày hợp lệ, không trùng nhau.');
    const shiftSetting=this.one('SELECT value FROM settings WHERE key=?',['shiftTypes']);
    const types=shiftSetting?JSON.parse(shiftSetting.value):DEFAULT_SHIFTS;
    const shiftType=Array.isArray(types)&&types.find(s=>s.code===shift);
    if(!shiftType||!Number.isFinite(Number(shiftType.factor)))throw new Error('Mã ca không được cấu hình.');
    const existing=this.all('SELECT * FROM records WHERE site_id=? AND module=?',[siteId,'roster']);
    const name=employee.trim(),factor=Number(shiftType.factor);
    return this.transact(()=>{
      for(const date of dates){
        const old=existing.find(r=>{const d=JSON.parse(r.data);return d.employee===name&&d.date===date;});
        if(old&&this.session.role==='STAFF'&&old.created_by!==this.session.id)throw new Error('Bạn không được sửa ca của nhân viên khác.');
        const raw=JSON.stringify({...old?JSON.parse(old.data):{},employee:name,date,shift,factor,note:String(note||'').slice(0,1000)});
        const id=old?.id||uuid();
        if(old)this.run('UPDATE records SET data=?,updated_at=? WHERE id=?',[raw,now(),id]);
        else this.run('INSERT INTO records VALUES(?,?,?,?,?,?,?)',[id,siteId,'roster',raw,this.session.id,now(),now()]);
        this.historyWrite({id,siteId,module:'roster',action:old?'SHIFT_UPDATE':'SHIFT_ASSIGN',before:old?.data,after:raw});
      }
      this.audit('ROSTER_BATCH',siteId,{employee:name,dates:dates.length,shift});return {count:dates.length};
    });
  }
  contractMaster(siteId,contractId){
    const c=this.one('SELECT * FROM records WHERE id=? AND site_id=? AND module=?',[contractId,siteId,'contracts']);
    if(!c)throw new Error('Không tìm thấy hợp đồng gốc trong cơ sở này.');
    return c;
  }
  contractEffectiveEnd(contractId,siteId,originalDate){
    const dates=[originalDate,...this.all('SELECT new_end_date FROM contract_addenda WHERE contract_id=? AND site_id=?',[contractId,siteId]).map(a=>a.new_end_date)].filter(isoDay);
    return dates.length?dates.sort().at(-1):'';
  }
  contractAddendaList({siteId,contractId}){
    this.check('contracts',siteId,'read');this.contractMaster(siteId,contractId);
    return this.all('SELECT * FROM contract_addenda WHERE site_id=? AND contract_id=? ORDER BY new_end_date DESC,created_at DESC',[siteId,contractId]);
  }
  contractAddendumSave({siteId,contractId,addendum}){
    this.check('contracts',siteId,'write');
    const original=this.contractMaster(siteId,contractId);
    this.ensureManageRecord(original,'contracts');
    if(!addendum||typeof addendum.addendum_no!=='string'||!addendum.addendum_no.trim()||!isoDay(addendum.new_end_date))
      throw new Error('Cần số phụ lục và ngày kết thúc mới hợp lệ.');
    if(addendum.signed_date&&!isoDay(addendum.signed_date))throw new Error('Ngày ký không hợp lệ.');
    if(addendum.new_start_date&&!isoDay(addendum.new_start_date))throw new Error('Ngày bắt đầu không hợp lệ.');
    if(!Number.isFinite(Number(addendum.amount||0)))throw new Error('Giá trị phụ lục không hợp lệ.');
    const old=addendum.id?this.one('SELECT * FROM contract_addenda WHERE id=? AND site_id=? AND contract_id=?',[addendum.id,siteId,contractId]):null;
    if(addendum.id&&!old)throw new Error('Phụ lục không thuộc hợp đồng này.');
    const id=old?.id||uuid(),ts=now();
    const values=[addendum.addendum_no.trim(),addendum.signed_date||'',addendum.new_start_date||'',addendum.new_end_date,Number(addendum.amount||0),String(addendum.summary||'').slice(0,5000)];
    return this.transact(()=>{
      if(old)this.run('UPDATE contract_addenda SET addendum_no=?,signed_date=?,new_start_date=?,new_end_date=?,amount=?,summary=?,updated_at=? WHERE id=? AND site_id=? AND contract_id=?',[...values,ts,id,siteId,contractId]);
      else this.run('INSERT INTO contract_addenda VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[id,siteId,contractId,...values,this.session.id,ts,ts]);
      this.audit('CONTRACT_ADDENDUM_SAVE',siteId,{contractId,id,number:values[0]});
      return {id,effectiveEndDate:this.contractEffectiveEnd(contractId,siteId,JSON.parse(original.data).endDate)};
    });
  }
  contractAddendumDelete({siteId,contractId,id}){
    this.check('contracts',siteId,'write');this.ensureManageRecord(this.contractMaster(siteId,contractId),'contracts');
    const old=this.one('SELECT id FROM contract_addenda WHERE id=? AND site_id=? AND contract_id=?',[id,siteId,contractId]);
    if(!old)throw new Error('Không tìm thấy phụ lục.');
    return this.transact(()=>{this.run('DELETE FROM contract_addenda WHERE id=? AND site_id=? AND contract_id=?',[id,siteId,contractId]);this.audit('CONTRACT_ADDENDUM_DELETE',siteId,{contractId,id});return {success:true};});
  }
  projectTasksList({siteId,projectId}){
    this.check('projects',siteId,'read');
    const project=this.one('SELECT id FROM records WHERE id=? AND site_id=? AND module=?',[projectId,siteId,'projects']);
    if(!project)throw new Error('Không tìm thấy dự án trong cơ sở này.');
    return this.all('SELECT * FROM project_tasks WHERE site_id=? AND project_id=? ORDER BY created_at ASC',[siteId,projectId]);
  }
  updateProjectProgress(projectId,siteId){
    const project=this.one('SELECT * FROM records WHERE id=? AND site_id=? AND module=?',[projectId,siteId,'projects']);
    if(!project)return;
    const tasks=this.all('SELECT status FROM project_tasks WHERE site_id=? AND project_id=?',[siteId,projectId]);
    const data=JSON.parse(project.data);
    const progress=tasks.length?Math.round(100*tasks.filter(t=>t.status==='Done').length/tasks.length):0;
    if(Number(data.progress||0)===progress)return;
    data.progress=progress;
    const after=JSON.stringify(data);
    this.run('UPDATE records SET data=?,updated_at=? WHERE id=?',[after,now(),projectId]);
    this.historyWrite({id:projectId,siteId,module:'projects',action:'PROGRESS_UPDATE',before:project.data,after});
  }
  projectTaskSave({siteId,projectId,task}){
    this.check('projects',siteId,'write');
    if(!task||typeof task.title!=='string'||!task.title.trim()||task.title.length>250||!['Not Started','In Progress','Blocked','Done'].includes(task.status))throw new Error('Thông tin đầu việc không hợp lệ.');
    if(task.due_date&&!isoDay(task.due_date))throw new Error('Hạn hoàn thành không hợp lệ.');
    const project=this.one('SELECT id FROM records WHERE id=? AND site_id=? AND module=?',[projectId,siteId,'projects']);
    if(!project)throw new Error('Dự án không tồn tại.');
    const old=task.id?this.one('SELECT * FROM project_tasks WHERE id=? AND project_id=? AND site_id=?',[task.id,projectId,siteId]):null;
    if(task.id&&!old)throw new Error('Đầu việc không thuộc dự án này.');
    return this.transact(()=>{
      const id=old?.id||uuid();const fields=[task.title.trim(),String(task.owner||'').slice(0,150),task.due_date||'',task.status,String(task.notes||'').slice(0,2000)];
      if(old)this.run('UPDATE project_tasks SET title=?,owner=?,due_date=?,status=?,notes=?,updated_at=? WHERE id=?',[...fields,now(),id]);
      else this.run('INSERT INTO project_tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,siteId,projectId,...fields,this.session.id,now(),now()]);
      this.updateProjectProgress(projectId,siteId);this.audit('PROJECT_TASK_SAVE',siteId,{projectId,id,status:task.status});return {id};
    });
  }
  projectTaskDelete({siteId,projectId,id}){
    this.check('projects',siteId,'write');
    const old=this.one('SELECT id FROM project_tasks WHERE site_id=? AND project_id=? AND id=?',[siteId,projectId,id]);
    if(!old)throw new Error('Không tìm thấy đầu việc.');
    return this.transact(()=>{this.run('DELETE FROM project_tasks WHERE id=?',[id]);this.updateProjectProgress(projectId,siteId);this.audit('PROJECT_TASK_DELETE',siteId,{projectId,id});return {success:true};});
  }
  dashboard(siteId){
    this.siteAllowed(siteId);
    const counts={};
    const readable=MODULES.filter(m=>{try{this.check(m,siteId,'read');return true;}catch{return false;}});
    for(const m of MODULES) counts[m]=readable.includes(m)?this.one('SELECT COUNT(*) n FROM records WHERE site_id=? AND module=?',[siteId,m]).n:null;
    const byModule=m=>readable.includes(m)?this.all('SELECT data FROM records WHERE site_id=? AND module=?',[siteId,m]).map(x=>JSON.parse(x.data)):[];
    const ts=byModule('tasks'),cs=byModule('checklists'),cts=readable.includes('contracts')?this.all('SELECT id,data FROM records WHERE site_id=? AND module=?',[siteId,'contracts']).map(r=>({id:r.id,...JSON.parse(r.data)})):[],inv=byModule('inventory');
    const inDays=(s,n)=>{if(!s)return false;const d=new Date(s);return !isNaN(d)&&d>=new Date(new Date().toDateString())&&d<=new Date(Date.now()+n*86400000);};
    const recent=readable.length?this.all('SELECT id,module,data,updated_at FROM records WHERE site_id=? AND module IN ('+readable.map(()=>'?').join(',')+') ORDER BY updated_at DESC LIMIT 8',[siteId,...readable]).map(x=>({...x,data:JSON.parse(x.data)})):[];
    return {counts,openTasks:ts.filter(x=>x.status!=='Done').length,checksDone:cs.filter(x=>x.status==='Done').length,checkTotal:cs.length,expiringContracts:cts.filter(x=>inDays(this.contractEffectiveEnd(x.id,siteId,x.endDate),60)).length,warrantySoon:inv.filter(x=>inDays(x.warrantyUntil,30)).length,recent};
  }
  auditList({siteId}){this.requireAdmin();return this.all('SELECT * FROM audit '+(siteId?'WHERE site_id=? OR site_id IS NULL ':'')+'ORDER BY created_at DESC LIMIT 500',siteId?[siteId]:[]);}
  settingsGet(){this.requireAuth();return this.all('SELECT * FROM settings').reduce((a,x)=>({...a,[x.key]:JSON.parse(x.value)}),{});}
  settingsSave({key,value}){this.requireAdmin();if(!/^[\w.-]{1,60}$/.test(key))throw new Error('Tên cài đặt không hợp lệ.');return this.transact(()=>{this.run('INSERT OR REPLACE INTO settings VALUES(?,?)',[key,JSON.stringify(value)]);this.audit('SETTINGS_SAVE',null,{key});return{success:true};});}
  exportRaw(){this.requireAdmin();this.audit('BACKUP_EXPORT',null,{});this.persist();return this.file;}
  importRaw(bytes){this.requireAdmin();const SQL=this.db.constructor;const candidate=new SQL.Database(bytes);try{const rows=candidate.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sites','records')");if(!rows.length||rows[0].values.length!==3)throw new Error('Không phải tệp backup Lotus IT hợp lệ.');const check=candidate.exec('PRAGMA integrity_check');if(check[0]?.values?.[0]?.[0]!=='ok')throw new Error('Tệp backup bị hỏng.');}catch(e){candidate.close();throw e;}candidate.close();const backup=this.file+'.bak-'+Date.now();fs.copyFileSync(this.file,backup);fs.writeFileSync(this.file,bytes);this.db.close();this.db=new SQL.Database(bytes);this.ensureUpgradeTables();this.persist();this.session=null;return{success:true,backup};}
}
module.exports={Store,MODULES};