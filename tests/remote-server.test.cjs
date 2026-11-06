
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RemoteBridge}=require('../electron/remote.cjs');

test('remote mode requires real HTTPS URLs and keeps bearer only in main-process memory',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lotus-remote-'));
 const previous=global.fetch;
 try{
  const remote=new RemoteBridge(dir);
  for(const input of ['http://example.com','https://user:pass@example.com','https://localhost/','https://example.com/api','https://example.com/?token=secret']){
   assert.throws(()=>remote.validateUrl(input),/HTTPS|tên miền|API/);
  }
  const token='a'.repeat(64);let sawBearer=false;
  global.fetch=async (url,opts)=>{
    if(String(url).endsWith('/api/v1/health'))return {ok:true,json:async()=>({ok:true,service:'Lotus IT API'})};
    const body=JSON.parse(opts.body);
    if(body.action==='auth.login'){
      assert.equal(opts.headers.Authorization,undefined);
      return {ok:true,status:200,json:async()=>({ok:true,result:{bearerToken:token,status:{authenticated:true,user:{siteId:'site1'}}}})};
    }
    if(body.action==='auth.status'){
      sawBearer=opts.headers.Authorization==='Bearer '+token;
      return {ok:true,status:200,json:async()=>({ok:true,result:{authenticated:true}})};
    }
    throw Error('unexpected request');
  };
  await remote.configure({enabled:true,url:'https://it.example.com'});
  assert.equal(remote.enabled,true);
  assert.equal(remote.url,'https://it.example.com');
  const result=await remote.invoke('auth.login',{username:'user',password:'secret'});
  assert.equal(result.authenticated,true);
  assert.equal((await remote.invoke('auth.status')).authenticated,true);
  assert.equal(sawBearer,true);
  const saved=fs.readFileSync(path.join(dir,'remote-server.json'),'utf8');
  assert.equal(saved.includes(token),false);
  assert.equal(saved.includes('secret'),false);
 }finally{global.fetch=previous;fs.rmSync(dir,{recursive:true,force:true})}
});
