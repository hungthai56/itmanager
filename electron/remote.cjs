'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {isIP}=require('node:net');

/** Auth tokens are deliberately kept in main-process memory, never in renderer/localStorage. */
class RemoteBridge {
  constructor(userDir) {
    this.configPath=path.join(userDir,'remote-server.json');
    this.enabled=false;this.url='';this.token=null;this.siteId=null;
    try {const c=JSON.parse(fs.readFileSync(this.configPath,'utf8'));if(c.enabled&&typeof c.url==='string'){
      this.url=this.validateUrl(c.url);this.enabled=true;
    }} catch { /* local mode by default */ }
  }
  validateUrl(text) {
    if(typeof text!=='string'||text.length>2048)throw Error('Địa chỉ máy chủ không hợp lệ.');
    const url=new URL(text.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.port&&!/^(443)$/.test(url.port))
      throw Error('API bắt buộc dùng HTTPS, chỉ nhập tên miền gốc (không có đường dẫn).');
    if(!/^[a-z0-9.-]+$/i.test(url.hostname)||url.hostname==='localhost'||url.hostname.endsWith('.local')||isIP(url.hostname)!==0)
      throw Error('Hãy dùng tên miền HTTPS hợp lệ cho máy chủ.');
    return url.origin;
  }
  status() {return {enabled:this.enabled,url:this.url,authenticated:!!this.token};}
  async configure({enabled,url}) {
    if(typeof enabled!=='boolean')throw Error('Chế độ kết nối không hợp lệ.');
    const candidate=enabled?this.validateUrl(url):this.url;
    if(enabled){
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
      try {
        const resp=await fetch(candidate+'/api/v1/health',{signal:controller.signal,redirect:'error',cache:'no-store'});
        if(!resp.ok)throw Error('Máy chủ không phản hồi đúng.');
        const data=await resp.json();if(data.service!=='Lotus IT API'||data.ok!==true)throw Error('Đây không phải máy chủ Lotus IT hợp lệ.');
      } finally{clearTimeout(timeout)}
    }
    this.enabled=enabled;this.url=candidate;this.token=null;this.siteId=null;
    fs.writeFileSync(this.configPath+'.tmp',JSON.stringify({enabled:this.enabled,url:this.url}),{mode:0o600});
    fs.renameSync(this.configPath+'.tmp',this.configPath);
    return this.status();
  }
  async request(action,payload={}) {
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const headers={'Content-Type':'application/json','Accept':'application/json','X-Lotus-Client':'desktop'};
      if(this.token)headers.Authorization='Bearer '+this.token;
      const result=await fetch(this.url+'/api/v1/dispatch',{
        method:'POST',headers,body:JSON.stringify({action,payload}),signal:controller.signal,cache:'no-store',redirect:'error',
      });
      const json=await result.json().catch(()=>({ok:false,error:'Máy chủ trả về dữ liệu không hợp lệ.'}));
      if(!result.ok||!json.ok){if(result.status===401)this.token=null;throw Error(json.error||'Không thể kết nối đến máy chủ.');}
      return json.result;
    } finally {clearTimeout(timeout)}
  }
  async invoke(action,payload={}) {
    if(!this.enabled)throw Error('Chế độ máy chủ chưa được bật.');
    if(action==='app.info')return {version:'0.6.0',mode:'server',url:this.url};
    if(action==='auth.setup')throw Error('Máy chủ chỉ được khởi tạo bằng công cụ quản trị CLI.');
    if(action==='auth.status'){
      if(!this.token)return {authenticated:false,ready:true};
      try{return await this.request(action,payload)}
      catch(e){if(!this.token)return {authenticated:false,ready:true};throw e}
    }
    if(action==='auth.login') {
      const result=await this.request(action,payload);
      if(typeof result.bearerToken!=='string'||!/^[0-9a-f]{64}$/i.test(result.bearerToken))throw Error('Phiên đăng nhập không hợp lệ.');
      this.token=result.bearerToken;this.siteId=result.status?.user?.siteId||null;
      return result.status;
    }
    if(action==='auth.logout'){
      try {if(this.token)await this.request(action,payload)} finally {this.token=null;this.siteId=null}
      return {authenticated:false};
    }
    if(!this.token)throw Error('Vui lòng đăng nhập vào máy chủ.');
    if(['file.pick','file.open','file.save','reports.export','qr.print','backup.export','backup.import'].includes(action))
      throw Error('Tính năng tệp/xuất báo cáo trực tuyến chưa hỗ trợ ở bản 0.6. Đừng dùng dữ liệu offline thay thế.');
    if(action==='settings.get'&&!payload.siteId)payload={...payload,siteId:this.siteId};
    const response=await this.request(action,payload);
    if(action==='sites.switch')this.siteId=response.siteId;
    if(action==='auth.changePassword'){this.token=null;this.siteId=null;}
    return response;
  }
}
module.exports={RemoteBridge};