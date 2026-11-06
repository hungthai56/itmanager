/** Browser uses same-origin, HttpOnly session cookie + server-side CSRF token. No bearer tokens in JavaScript. */
let csrf: string | null = null;
async function fetchCsrf(): Promise<string> {
  const result = await fetch('/api/v1/csrf', {credentials:'same-origin', cache:'no-store'});
  if(!result.ok) throw Error('Không thể khởi tạo phiên bảo mật.');
  const payload = await result.json() as {csrf?:string};
  if(!payload.csrf)throw Error('Máy chủ không trả về mã CSRF.');
  return payload.csrf;
}
async function invoke(action:string,payload:Record<string,unknown>={}):Promise<any> {
  if(action==='connection.status')return {enabled:true,url:window.location.origin,web:true};
  if(action==='connection.configure')throw Error('Phiên bản web luôn sử dụng máy chủ hiện tại.');
  if(!csrf)csrf=await fetchCsrf();
  const response=await fetch('/api/v1/dispatch',{
    method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{'Content-Type':'application/json','Accept':'application/json','X-CSRF-Token':csrf},
    body:JSON.stringify({action,payload})
  });
  const data=await response.json().catch(()=>null) as {ok:boolean;error?:string;result?:any}|null;
  if(!response.ok||!data?.ok){if(response.status===401)csrf=null;throw Error(data?.error||'Yêu cầu đến máy chủ thất bại.');}
  if(action==='auth.login'&&data.result?.csrf){csrf=data.result.csrf;return data.result.status;}
  if(action==='auth.logout')csrf=null;
  return data.result;
}
if(!window.lotus)window.lotus={invoke};