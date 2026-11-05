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
    this.persist();
  }
  all(sql,p=[]) { const s=this.db.prepare(sql); try { s.bind(p); const a=[]; while(s.step()) a.push(s.getAsObject()); return a; } finally{s.free();} }
  one(sql,p=[]) { return this.all(sql,p)[0] || null; }
  run(sql,p=[]) { this.db.run(sql,p); }
  persist() { const temp=this.file+'.tmp'; fs.writeFileSync(temp,Buffer.from(this.db.export())); fs.renameSync(temp,this.file); }
  transact(fn) { this.db.run('BEGIN'); try { const res=fn(); this.db.run('COMMIT'); this.persist(); return res; } catch(e) {this.db.run('ROLLBACK');throw e;} }
  audit(action,site,details) {this.run('INSERT INTO audit VALUES(?,?,?,?,?,?,?)',[uuid(),this.session?.id??null,this.session?.username??null,action,site||null,JSON.stringify(details??{}),now()]);}
  get userCount() {return this.one('SELECT COUNT(*) n FROM users').n;}
  info(){ return {ready:this.userCount>0, version:'0.1.0', dataPath:this.folder, modules:MODULES}; }
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
    if(u.locked_until && u.locked_until>now()) throw new Error('Tài khoản đang bị khóa tạm thời. Vui lòng thử lại sau.');
    const ok=secureCompare(crypto.scryptSync(password,u.salt,64).toString('hex'),u.password_hash);
    if (!ok) {
      const attempts=(u.locked_until&&u.locked_until<=now()?0:u.failed_attempts)+1;
      const locked=attempts>=5?new Date(Date.now()+15*60000).toISOString():null;
      this.transact(()=> {this.run('UPDATE users SET failed_attempts=?,locked_until=? WHERE id=?',[locked?0:attempts,locked,u.id]);this.run('INSERT INTO audit VALUES(?,?,?,?,?,?,?)',[uuid(),u.id,u.username,'LOGIN_FAILED',null,JSON.stringify({locked:!!locked}),now()]);});
      throw new Error(locked?'Nhập sai 5 lần. Tài khoản bị khóa 15 phút.':`Sai mật khẩu. Còn ${5-attempts} lần thử.`);
    }
    this.transact(()=>this.run('UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=?',[u.id]));
    this.session={id:u.id,username:u.username,name:u.full_name,role:u.role,forceReset:!!u.force_reset,siteId:u.default_site_id,overrides:JSON.parse(u.overrides||'{}')};
    this.transact(()=>this.audit('LOGIN',this.session.siteId,{}));
    return this.status();
  }
  status() {return this.session?{authenticated:true,user:this.session,sites:this.sites()}: {authenticated:false,ready:this.userCount>0};}
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
  users(){this.requireAdmin();return this.all('SELECT id,username,full_name,role,active,force_reset,default_site_id,report_to,overrides,created_at FROM users ORDER BY full_name').map(u=>({...u,siteIds:this.all('SELECT site_id FROM user_sites WHERE user_id=?',[u.id]).map(r=>r.site_id)}));}
  userSave(u){this.requireAdmin();if(!u.username?.trim()||!u.full_name?.trim()||!ROLES.includes(u.role))throw new Error('Thông tin nhân sự chưa hợp lệ.');if(!u.id&&!passwordOkay(u.password))throw new Error('Mật khẩu phải từ 10 ký tự, có chữ và số.');const allSites=this.all('SELECT id FROM sites').map(x=>x.id);const assigned=[...new Set((u.siteIds||[]).filter(x=>allSites.includes(x)))];if(!assigned.length)throw new Error('Cần cấp ít nhất một cơ sở.');return this.transact(()=>{const id=u.id||uuid();if(u.id){if(!this.one('SELECT id FROM users WHERE id=?',[id]))throw new Error('Không tìm thấy người dùng.');if(this.session.id===id&&(!u.active||u.role!=='SYS'))throw new Error('Không thể tự khóa hoặc hạ quyền quản trị của mình.');this.run('UPDATE users SET username=?,full_name=?,role=?,active=?,force_reset=?,default_site_id=?,report_to=?,overrides=? WHERE id=?',[u.username.trim().toLowerCase(),u.full_name.trim(),u.role,u.active?1:0,u.force_reset?1:0,assigned.includes(u.default_site_id)?u.default_site_id:assigned[0],u.report_to||null,JSON.stringify(u.overrides||{}),id]);}else{const h=hashPassword(u.password);this.run('INSERT INTO users(id,username,full_name,role,password_hash,salt,active,force_reset,default_site_id,report_to,overrides,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[id,u.username.trim().toLowerCase(),u.full_name.trim(),u.role,h.hash,h.salt,1,u.force_reset?1:0,assigned[0],u.report_to||null,JSON.stringify(u.overrides||{}),now()]);}this.run('DELETE FROM user_sites WHERE user_id=?',[id]);for(const sid of assigned)this.run('INSERT INTO user_sites VALUES(?,?)',[id,sid]);this.audit('USER_SAVE',null,{username:u.username,id});return{id};});}
  userPassword({userId,password}){this.requireAdmin();if(!passwordOkay(password))throw new Error('Mật khẩu tối thiểu 10 ký tự, chứa chữ và số.');const h=hashPassword(password);return this.transact(()=>{this.run('UPDATE users SET password_hash=?,salt=?,force_reset=1,failed_attempts=0,locked_until=NULL WHERE id=?',[h.hash,h.salt,userId]);this.audit('USER_PASSWORD_RESET',null,{userId});return{success:true};});}
  changePassword({oldPassword,newPassword}){this.requireAuth();if(!passwordOkay(newPassword))throw new Error('Mật khẩu mới tối thiểu 10 ký tự, gồm chữ và số.');const u=this.one('SELECT * FROM users WHERE id=?',[this.session.id]);const old=crypto.scryptSync(oldPassword||'',u.salt,64).toString('hex');if(!secureCompare(old,u.password_hash))throw new Error('Mật khẩu cũ không đúng.');const h=hashPassword(newPassword);return this.transact(()=>{this.run('UPDATE users SET password_hash=?,salt=?,force_reset=0 WHERE id=?',[h.hash,h.salt,u.id]);this.session.forceReset=false;this.audit('PASSWORD_CHANGED',null,{});return{success:true};});}
  recordsList({module,siteId}){this.check(module,siteId,'read');return this.all('SELECT * FROM records WHERE module=? AND site_id=? ORDER BY updated_at DESC',[module,siteId]).map(x=>({...x,data:JSON.parse(x.data)}));}
  recordsSave({module,siteId,record}){this.check(module,siteId,'write');if(!record||typeof record.data!=='object'||Array.isArray(record.data))throw new Error('Dữ liệu không hợp lệ.');const raw=JSON.stringify(record.data);if(raw.length>200000)throw new Error('Nội dung vượt giới hạn lưu trữ.');if(!Object.values(record.data).some(x=>String(x??'').trim()))throw new Error('Hãy nhập ít nhất một thông tin.');if(module==='checklists'&&record.data.status==='Not Done'&&!String(record.data.reason||'').trim())throw new Error('Cần nhập lý do khi đánh dấu Not Done.');return this.transact(()=>{const id=record.id||uuid();const old=record.id?this.one('SELECT * FROM records WHERE id=? AND site_id=? AND module=?',[id,siteId,module]):null;if(record.id&&!old)throw new Error('Không tìm thấy bản ghi ở cơ sở này.');if(old&&this.session.role==='STAFF'&&old.created_by!==this.session.id)throw new Error('Nhân viên chỉ được sửa bản ghi của mình.');if(old)this.run('UPDATE records SET data=?,updated_at=? WHERE id=?',[raw,now(),id]);else this.run('INSERT INTO records VALUES(?,?,?,?,?,?,?)',[id,siteId,module,raw,this.session.id,now(),now()]);this.audit('RECORD_SAVE',siteId,{module,id});return {id};});}
  recordsDelete({module,siteId,id}){this.check(module,siteId,'write');const old=this.one('SELECT * FROM records WHERE id=? AND module=? AND site_id=?',[id,module,siteId]);if(!old)throw new Error('Không tìm thấy bản ghi.');if(this.session.role==='STAFF'&&old.created_by!==this.session.id)throw new Error('Không được xóa bản ghi người khác.');return this.transact(()=>{this.run('DELETE FROM records WHERE id=? AND module=? AND site_id=?',[id,module,siteId]);this.audit('RECORD_DELETE',siteId,{module,id});return{success:true};});}
  dashboard(siteId){
    this.siteAllowed(siteId);
    const counts={};
    const readable=MODULES.filter(m=>{try{this.check(m,siteId,'read');return true;}catch{return false;}});
    for(const m of MODULES) counts[m]=readable.includes(m)?this.one('SELECT COUNT(*) n FROM records WHERE site_id=? AND module=?',[siteId,m]).n:null;
    const byModule=m=>readable.includes(m)?this.all('SELECT data FROM records WHERE site_id=? AND module=?',[siteId,m]).map(x=>JSON.parse(x.data)):[];
    const ts=byModule('tasks'),cs=byModule('checklists'),cts=byModule('contracts'),inv=byModule('inventory');
    const inDays=(s,n)=>{if(!s)return false;const d=new Date(s);return !isNaN(d)&&d>=new Date(new Date().toDateString())&&d<=new Date(Date.now()+n*86400000);};
    const recent=readable.length?this.all('SELECT id,module,data,updated_at FROM records WHERE site_id=? AND module IN ('+readable.map(()=>'?').join(',')+') ORDER BY updated_at DESC LIMIT 8',[siteId,...readable]).map(x=>({...x,data:JSON.parse(x.data)})):[];
    return {counts,openTasks:ts.filter(x=>x.status!=='Done').length,checksDone:cs.filter(x=>x.status==='Done').length,checkTotal:cs.length,expiringContracts:cts.filter(x=>inDays(x.endDate,30)).length,warrantySoon:inv.filter(x=>inDays(x.warrantyUntil,30)).length,recent};
  }
  auditList({siteId}){this.requireAdmin();return this.all('SELECT * FROM audit '+(siteId?'WHERE site_id=? OR site_id IS NULL ':'')+'ORDER BY created_at DESC LIMIT 500',siteId?[siteId]:[]);}
  settingsGet(){this.requireAuth();return this.all('SELECT * FROM settings').reduce((a,x)=>({...a,[x.key]:JSON.parse(x.value)}),{});}
  settingsSave({key,value}){this.requireAdmin();if(!/^[\w.-]{1,60}$/.test(key))throw new Error('Tên cài đặt không hợp lệ.');return this.transact(()=>{this.run('INSERT OR REPLACE INTO settings VALUES(?,?)',[key,JSON.stringify(value)]);this.audit('SETTINGS_SAVE',null,{key});return{success:true};});}
  exportRaw(){this.requireAdmin();this.audit('BACKUP_EXPORT',null,{});this.persist();return this.file;}
  importRaw(bytes){this.requireAdmin();const SQL=this.db.constructor;const candidate=new SQL.Database(bytes);try{const rows=candidate.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sites','records')");if(!rows.length||rows[0].values.length!==3)throw new Error('Không phải tệp backup Lotus IT hợp lệ.');const check=candidate.exec('PRAGMA integrity_check');if(check[0]?.values?.[0]?.[0]!=='ok')throw new Error('Tệp backup bị hỏng.');}catch(e){candidate.close();throw e;}candidate.close();const backup=this.file+'.bak-'+Date.now();fs.copyFileSync(this.file,backup);fs.writeFileSync(this.file,bytes);this.db.close();this.db=new SQL.Database(bytes);this.session=null;return{success:true,backup};}
}
module.exports={Store,MODULES};