import {tr, translateLocaleValue, readUILanguage} from './i18n';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {AlertTriangle,CalendarRange,Check,CheckCircle2,ChevronLeft,ChevronRight,Clock3,History,ListChecks,Plus,Save,Trash2,X} from 'lucide-react';
import type {RecordItem,Site,ModuleId} from './types';

type Notify=(message:string,error?:boolean)=>void;
type Mutate=(fn:()=>Promise<unknown>,message?:string)=>Promise<void>;
const invoke=<T,>(action:string,payload:Record<string,unknown>)=>window.lotus.invoke(action,payload) as Promise<T>;
const isoToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const weekMonday=(date:string)=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)};
const periodKey=(date:string,freq:string)=>freq==='Weekly'?weekMonday(date):freq==='Monthly'?date.slice(0,7):freq==='Quarterly'?`${date.slice(0,4)}-Q${Math.floor((Number(date.slice(5,7))-1)/3)+1}`:freq==='Semiannual'?`${date.slice(0,4)}-H${Number(date.slice(5,7))<=6?1:2}`:freq==='Yearly'?date.slice(0,4):date;
const safeMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
const frequencies=['Daily','Weekly','Monthly','Quarterly','Semiannual','Yearly','Custom'];
const freqLabels:Record<string,string>={Daily:'Hằng ngày',Weekly:'Hằng tuần',Monthly:'Hằng tháng',Quarterly:'Hằng quý',Semiannual:'Nửa năm',Yearly:'Hằng năm',Custom:'Tùy chỉnh'};
const shiftDefaults=[{code:'D',factor:1},{code:'N',factor:1},{code:'HD',factor:0.5},{code:'AL',factor:0},{code:'DO',factor:0}];

export function ChecklistBoard({site,records,config,editable,mutate,refresh,notify}:{site:Site;records:RecordItem[];config:Record<string,any>;editable:boolean;mutate:Mutate;refresh:()=>Promise<void>;notify:Notify}){
  const [date,setDate]=useState(isoToday());const [frequency,setFrequency]=useState('Daily');
  const [marking,setMarking]=useState<{name:string;frequency:string;status:'Done'|'Not Done'}|null>(null);
  const [reason,setReason]=useState(''),[note,setNote]=useState(''),[quickMarking,setQuickMarking]=useState<string[]>([]);
  const templates:{name:string;frequency:string}[]=Array.isArray(config.checklistTemplates)?config.checklistTemplates:[{name:'Kiểm tra Backup',frequency:'Daily'},{name:'Kiểm tra NAS / Server',frequency:'Daily'}];
  const visible=templates.filter(t=>t.frequency===frequency&&t.name?.trim());
  const completed=visible.filter(t=>{
    const id=`${t.frequency}::${t.name.trim().toLocaleLowerCase('en-US')}`;
    return records.some(r=>r.data.boardKey===id&&r.data.periodKey===periodKey(date,t.frequency)&&r.data.status==='Done');
  }).length;
  async function save(e:FormEvent){e.preventDefault();if(!marking)return;
    if(marking.status==='Not Done'&&!reason.trim())return;
    await mutate(async()=>{await invoke('checklist.mark',{siteId:site.id,name:marking.name,frequency:marking.frequency,date,status:marking.status,reason,note});await refresh();setMarking(null);setReason('');setNote('');},'Đã ghi nhận kết quả kiểm tra.');
  }
  async function doneInstantly(name:string,freq:string){
    const key=`${freq}::${name}`;
    if(quickMarking.includes(key))return;
    setQuickMarking(v=>[...v,key]);
    try{await invoke('checklist.mark',{siteId:site.id,name,frequency:freq,date,status:'Done',reason:'',note:''});await refresh()}
    catch(e){notify(safeMessage(e),true)}
    finally{setQuickMarking(v=>v.filter(k=>k!==key))}
  }
  const openMark=(name:string,frequency:string,status:'Done'|'Not Done')=>{setMarking({name,frequency,status});setReason('');setNote('')};
  return <section className="panel feature-board"><div className="feature-header"><div className="feature-icon"><ListChecks size={20}/></div><div><h3>{tr("Bảng kiểm tra định kỳ")}</h3><p>{tr("Đánh dấu trực tiếp theo lịch; hệ thống lưu người thực hiện, thời gian và lý do chưa hoàn thành.")}</p></div><span className="feature-stat">{completed}/{visible.length} hoàn thành</span></div>
   <div className="feature-toolbar"><div className="compact-tabs">{frequencies.map(f=><button type="button" key={f} className={frequency===f?'active':''} onClick={()=>setFrequency(f)}>{tr(freqLabels[f])}</button>)}</div><label className="inline-date"><CalendarRange size={15}/><input aria-label={tr("Ngày kiểm tra")} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
   {!visible.length?<div className="feature-empty">Chưa có mẫu {tr(freqLabels[frequency]).toLowerCase()}. Vào System Settings để khai báo thêm mẫu kiểm tra.</div>:<div className="check-rows">{visible.map((t,i)=>{
    const id=`${t.frequency}::${t.name.trim().toLocaleLowerCase('en-US')}`;
    const current=records.find(r=>r.data.boardKey===id&&r.data.periodKey===periodKey(date,t.frequency));
    const done=current?.data.status==='Done',notDone=current?.data.status==='Not Done';
    return <div className="check-row" key={`${t.name}-${i}`}><div className="check-row-index">{String(i+1).padStart(2,'0')}</div><div className="check-row-main"><strong>{t.name}</strong><small>{current?.data.checkedBy?`${String(current.data.checkedBy)} · ${new Date(String(current.data.checkedTime||current.updated_at)).toLocaleString('vi-VN')}`:`Chưa kiểm tra trong kỳ ${periodKey(date,t.frequency)}`}</small>{notDone&&<em className="issue-reason">{String(current.data.reason||'Cần xử lý')}</em>}</div><span className={`check-result ${done?'ok':notDone?'failed':'pending'}`}>{tr(done?'Done':notDone?'Not Done':'Pending')}</span>{editable&&<div className="check-actions"><button type="button" className="btn light mini" disabled={quickMarking.includes(`${t.frequency}::${t.name}`)||done} onClick={()=>void doneInstantly(t.name,t.frequency)}><Check size={15}/>{tr("Done")}</button><button type="button" className="btn light mini" onClick={()=>openMark(t.name,t.frequency,'Not Done')}><AlertTriangle size={15}/>{tr("Not Done")}</button></div>}</div>
   })}</div>}
   {marking&&<div className="modal-shade" onMouseDown={()=>setMarking(null)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h3>{tr("Ghi nhận kết quả checklist")}</h3><button className="iconbtn" onClick={()=>setMarking(null)}><X size={18}/></button></div><form onSubmit={save}><div className="modal-body"><strong>{marking.name}</strong><span className={`check-result ${marking.status==='Done'?'ok':'failed'}`}>{tr(marking.status)}</span>{marking.status==='Not Done'&&<label className="field"><span>{tr("Lý do chưa hoàn thành")}<em>*</em></span><textarea required rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: Server đang bảo trì, cần quay lại kiểm tra..."/></label>}<label className="field"><span>{tr("Ghi chú công việc")}</span><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Kết quả kiểm tra / phát hiện..."/></label></div><div className="modal-footer"><button type="button" className="btn light" onClick={()=>setMarking(null)}>{tr("Hủy")}</button><button className="btn primary"><Save size={16}/>{tr("Lưu kết quả")}</button></div></form></div></div>}
  </section>;
}

export function RosterCalendar({site,records,config,editable,mutate,refresh,notify}:{site:Site;records:RecordItem[];config:Record<string,any>;editable:boolean;mutate:Mutate;refresh:()=>Promise<void>;notify:Notify}){
 const [month,setMonth]=useState(isoToday().slice(0,7));const [adding,setAdding]=useState('');
 const [employee,setEmployee]=useState(''),[from,setFrom]=useState(0),[to,setTo]=useState(0),[dragging,setDragging]=useState(false);
 const shifts:{code:string;factor:number}[]=Array.isArray(config.shiftTypes)?config.shiftTypes:shiftDefaults;
 const [shift,setShift]=useState('D'),[note,setNote]=useState(''),[quickMode,setQuickMode]=useState(false),[savingQuick,setSavingQuick]=useState(false);
 const dragRef=useRef<{name:string;from:number;to:number}|null>(null);
 const cycleDay=Number(config.payrollCycles?.[site.id]?.startDay||1);
 const dates=useMemo(()=>{
   const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
   const start=cycleDay===1?Date.UTC(year,m-1,1):Date.UTC(year,m-2,cycleDay);
   const end=cycleDay===1?Date.UTC(year,m,1):Date.UTC(year,m-1,cycleDay);
   return Array.from({length:Math.round((end-start)/86400000)},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
 },[month,cycleDay]);
 const people=Array.from(new Set([...records.map(r=>String(r.data.employee||'').trim()).filter(Boolean),...(adding.trim()?[adding.trim()]:[])])).sort((a,b)=>a.localeCompare(b,'vi'));
 const recordsByKey=new Map(records.map(r=>[`${String(r.data.employee||'')}|${String(r.data.date||'')}`,r]));
 const min=Math.min(from,to),max=Math.max(from,to);
 const count=employee?max-min+1:0;
 function begin(name:string,index:number){if(!editable||savingQuick)return;dragRef.current={name,from:index,to:index};setEmployee(name);setFrom(index);setTo(index);setDragging(true)}
 async function finish(){setDragging(false);const part=dragRef.current;if(!quickMode||!part||savingQuick)return;setSavingQuick(true);try{const days=dates.slice(Math.min(part.from,part.to),Math.max(part.from,part.to)+1);await invoke('roster.batch',{siteId:site.id,employee:part.name,dates:days,shift,note});await refresh();setEmployee('')}catch(e){notify(safeMessage(e),true)}finally{setSavingQuick(false);dragRef.current=null}}
 async function apply(){if(!employee||!editable)return;
    const chosen=dates.slice(min,max+1);
    await mutate(async()=>{await invoke('roster.batch',{siteId:site.id,employee,dates:chosen,shift,note});await refresh();setEmployee('');},`Đã gán ca ${shift} cho ${chosen.length} ngày.`);
 }
 const previous=(step:number)=>{const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1+step,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setEmployee('')};
 return <section className="panel feature-board"><div className="feature-header"><div className="feature-icon"><CalendarRange size={20}/></div><div><h3>{tr("Roster · Lịch ca trực")}</h3><p>{tr("Kéo chọn nhiều ô liên tiếp trên một hàng để gán ca. Lịch hiện có được cập nhật thay vì tạo dòng trùng.")}</p></div></div>
  <div className="feature-toolbar roster-controls"><span className="muted">{tr("Kỳ công")} {dates[0]} – {dates[dates.length-1]} ({cycleDay===1?tr("Theo tháng"):String(cycleDay)+"–"+String(cycleDay-1)})</span><div className="month-switch"><button aria-label="Tháng trước" className="iconbtn" onClick={()=>previous(-1)}><ChevronLeft size={17}/></button><input type="month" aria-label="Tháng phân ca" value={month} onChange={e=>{setMonth(e.target.value);setEmployee('')}}/><button aria-label="Tháng sau" className="iconbtn" onClick={()=>previous(1)}><ChevronRight size={17}/></button></div>{editable&&<label className="new-person"><input placeholder="Thêm tên nhân viên IT..." value={adding} onChange={e=>setAdding(e.target.value)} /><button className="btn light mini" onClick={()=>{setAdding(adding.trim())}}><Plus size={14}/>{tr("Thêm")}</button></label>}</div>
  {editable&&<div className="roster-fast-bar"><label className="quick-toggle"><input type="checkbox" checked={quickMode} onChange={e=>{setQuickMode(e.target.checked);setEmployee('')}}/><span>{tr('Gán ca nhanh (thả chuột để lưu)')}</span></label><div className="shift-palette">{shifts.map(item=><button type="button" key={item.code} className={shift===item.code?'active':''} onClick={()=>setShift(item.code)} title={`${item.code} · ${item.factor} WD`}>{item.code}</button>)}</div>{savingQuick&&<span className="muted">{tr('Đang ghi ca...')}</span>}</div>}
  {!people.length?<div className="feature-empty">{tr("Chưa có nhân viên trên bảng ca. Nhập tên nhân viên ở phía trên hoặc tạo một ca trực.")}</div>:<div className="roster-scroll"><table className="roster-table" onMouseUp={()=>void finish()} onMouseLeave={()=>{if(dragging){setDragging(false);dragRef.current=null}}}><thead><tr><th className="roster-person-col">{tr("Nhân viên")}</th>{dates.map((d,i)=><th key={d} className={(new Date(d+'T00:00:00').getDay()===0||new Date(d+'T00:00:00').getDay()===6)?'weekend':''}>{Number(d.slice(8,10))}<small>{['CN','T2','T3','T4','T5','T6','T7'][new Date(d+'T00:00:00').getDay()]}</small></th>)}<th>{tr("WD")}</th></tr></thead><tbody>{people.map(name=>{
     const wd=dates.reduce((sum,d)=>{const data=recordsByKey.get(`${name}|${d}`)?.data;const factor=shifts.find(x=>x.code===String(data?.shift||''))?.factor;return sum+Number(factor??data?.factor??0)},0);
     return <tr key={name}><th className="roster-person-col">{name}</th>{dates.map((d,i)=>{const code=String(recordsByKey.get(`${name}|${d}`)?.data.shift||'');const chosen=employee===name&&i>=min&&i<=max;return <td key={d} className={chosen?'roster-selected':''} onMouseDown={e=>{e.preventDefault();begin(name,i)}} onMouseEnter={()=>{if(dragging&&employee===name){setTo(i);if(dragRef.current)dragRef.current.to=i}}}><span title={String(recordsByKey.get(`${name}|${d}`)?.data.note||'')} className={`shift-chip ${code?'has-shift':''}`}>{code||'·'}</span></td>})}<td><strong>{Number(wd.toFixed(2))}</strong></td></tr>})}</tbody></table></div>}
  {editable&&employee&&!quickMode&&<div className="roster-selection"><span><strong>{employee}</strong> · {dates[min]} đến {dates[max]} · {count} ngày</span><label>{tr("Ca")}<select value={shift} onChange={e=>setShift(e.target.value)}>{shifts.map(s=><option key={s.code} value={s.code}>{s.code} ({s.factor})</option>)}</select></label><input placeholder="Ghi chú (không bắt buộc)" value={note} onChange={e=>setNote(e.target.value)}/><button className="btn primary" onClick={()=>void apply()}><Save size={15}/> Lưu {count} ngày</button><button className="iconbtn" onClick={()=>setEmployee('')} title={tr("Bỏ chọn")}><X size={16}/></button></div>}
 </section>;
}

type ProjectTask={id:string;site_id:string;project_id:string;title:string;owner:string;due_date:string;status:'Not Started'|'In Progress'|'Blocked'|'Done';notes:string;updated_at:string};
const blankTask={title:'',owner:'',due_date:'',status:'Not Started' as const,notes:''};
export function ProjectRegistry({site,records,editable,mutate,refresh,notify}:{site:Site;records:RecordItem[];editable:boolean;mutate:Mutate;refresh:()=>Promise<void>;notify:Notify}){
 const [chosen,setChosen]=useState('');const project=records.find(p=>p.id===chosen)||records[0];
 const [tasks,setTasks]=useState<ProjectTask[]>([]),[loading,setLoading]=useState(false),[editing,setEditing]=useState<Partial<ProjectTask>|null>(null);
 const [quickTaskTitle,setQuickTaskTitle]=useState(''),[quickTaskBusy,setQuickTaskBusy]=useState(false),[quickStatusId,setQuickStatusId]=useState<string|null>(null);
 const load=useCallback(async()=>{if(!project){setTasks([]);return}setLoading(true);try{setTasks(await invoke<ProjectTask[]>('project.tasks.list',{siteId:site.id,projectId:project.id}))}finally{setLoading(false)}},[site.id,project?.id]);
 useEffect(()=>{void load().catch(()=>setTasks([]))},[load]);
 async function save(e:FormEvent){e.preventDefault();if(!project||!editing)return;
    await mutate(async()=>{await invoke('project.tasks.save',{siteId:site.id,projectId:project.id,task:editing});setEditing(null);await load();await refresh()},'Đã cập nhật đầu việc và tiến độ dự án.');
 }
 async function addQuickTask(e:FormEvent){e.preventDefault();if(!project||!quickTaskTitle.trim()||quickTaskBusy)return;
   setQuickTaskBusy(true);
   try{await invoke('project.tasks.save',{siteId:site.id,projectId:project.id,task:{...blankTask,title:quickTaskTitle.trim()}});setQuickTaskTitle('');await load();await refresh()}
   catch(e){notify(safeMessage(e),true)}finally{setQuickTaskBusy(false)}
 }
 async function changeTaskStatus(task:ProjectTask,status:ProjectTask['status']){if(!project||quickStatusId)return;
   setQuickStatusId(task.id);
   try{await invoke('project.tasks.save',{siteId:site.id,projectId:project.id,task:{...task,status}});await load();await refresh()}
   catch(e){notify(safeMessage(e),true)}finally{setQuickStatusId(null)}
 }
 async function remove(id:string){if(!project||!window.confirm(tr('Xóa đầu việc này?')))return;
    await mutate(async()=>{await invoke('project.tasks.delete',{siteId:site.id,projectId:project.id,id});await load();await refresh()},'Đã xóa đầu việc.');
 }
 const completed=tasks.filter(t=>t.status==='Done').length;
 return <section className="panel feature-board"><div className="feature-header"><div className="feature-icon"><CheckCircle2 size={20}/></div><div><h3>{tr("Project Task Registry")}</h3><p>{tr("Chia dự án thành các đầu việc, chỉ định người phụ trách và tự động cập nhật % hoàn thành.")}</p></div><span className="feature-stat">{completed}/{tasks.length} đầu việc</span></div>
  {!project?<div className="feature-empty">{tr("Tạo một dự án để bắt đầu lập danh sách đầu việc.")}</div>:<><div className="feature-toolbar"><label className="project-picker">{tr("Dự án")}<select value={project.id} onChange={e=>setChosen(e.target.value)}>{records.map(r=><option key={r.id} value={r.id}>{String(r.data.name||'Dự án chưa đặt tên')}</option>)}</select></label><span className="project-progress">{tr("Tiến độ")}<strong>{Number(project.data.progress||0)}%</strong></span>{editable&&<button className="btn primary" onClick={()=>setEditing({...blankTask})}><Plus size={16}/>{tr("Thêm đầu việc")}</button>}</div>
   {editable&&<form className="project-quick-create" onSubmit={addQuickTask}><Plus size={16}/><input value={quickTaskTitle} maxLength={250} onChange={e=>setQuickTaskTitle(e.target.value)} placeholder={tr('Nhập đầu việc và nhấn Enter để tạo...')}/><button type="submit" className="btn light mini" disabled={quickTaskBusy||!quickTaskTitle.trim()}>{tr('Thêm nhanh')}</button></form>}
   {loading?<div className="feature-empty">{tr("Đang tải đầu việc...")}</div>:!tasks.length?<div className="feature-empty">{tr("Dự án chưa có đầu việc nào. Thêm đầu việc để tự động tính tiến độ.")}</div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>{tr("Đầu việc")}</th><th>{tr("Người phụ trách")}</th><th>{tr("Hạn")}</th><th>{tr("Trạng thái")}</th><th>{tr("Thao tác")}</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id}><td className="cell-title">{t.title}</td><td>{t.owner||'—'}</td><td>{t.due_date||'—'}</td><td>{editable?<select className="quick-inline-select" aria-label={`${tr('Trạng thái')} · ${t.title}`} value={t.status} disabled={quickStatusId===t.id} onChange={e=>void changeTaskStatus(t,e.target.value as ProjectTask['status'])}>{['Not Started','In Progress','Blocked','Done'].map(status=><option key={status} value={status}>{tr(status)}</option>)}</select>:<span className={`check-result ${t.status==='Done'?'ok':t.status==='Blocked'?'failed':'pending'}`}>{tr(t.status)}</span>}</td><td className="cell-actions">{editable&&<><button className="btn light mini" onClick={()=>setEditing(t)}>{tr("Sửa")}</button><button className="iconbtn danger" onClick={()=>void remove(t.id)}><Trash2 size={15}/></button></>}</td></tr>)}</tbody></table></div>}
  </>}
  {editing&&<div className="modal-shade" onMouseDown={()=>setEditing(null)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h3>{tr(editing.id?'Sửa':'Thêm')} {tr('đầu việc')} {tr('dự án')}</h3><button className="iconbtn" onClick={()=>setEditing(null)}><X size={18}/></button></div><form onSubmit={save}><div className="modal-body"><label className="field"><span>{tr("Tên đầu việc *")}</span><input required maxLength={250} value={editing.title||''} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label className="field"><span>{tr("Người phụ trách")}</span><input value={editing.owner||''} onChange={e=>setEditing({...editing,owner:e.target.value})}/></label><label className="field"><span>{tr("Hạn hoàn thành")}</span><input type="date" value={editing.due_date||''} onChange={e=>setEditing({...editing,due_date:e.target.value})}/></label><label className="field"><span>{tr("Trạng thái")}</span><select value={editing.status||'Not Started'} onChange={e=>setEditing({...editing,status:e.target.value as ProjectTask['status']})}><option value="Not Started">{tr("Not Started")}</option><option value="In Progress">{tr("In Progress")}</option><option value="Blocked">{tr("Blocked")}</option><option value="Done">{tr("Done")}</option></select></label><label className="field"><span>{tr("Ghi chú")}</span><textarea rows={3} value={editing.notes||''} onChange={e=>setEditing({...editing,notes:e.target.value})}/></label></div><div className="modal-footer"><button type="button" className="btn light" onClick={()=>setEditing(null)}>{tr("Hủy")}</button><button className="btn primary"><Save size={16}/>{tr("Lưu đầu việc")}</button></div></form></div></div>}
 </section>;
}

type HistoryItem={id:string;record_id:string;site_id:string;module:string;action:string;before_data:string|null;after_data:string|null;username:string;created_at:string};
export function RecordHistory({site,module,record,onClose,notify}:{site:Site;module:ModuleId;record:RecordItem;onClose:()=>void;notify:Notify}){
 const [entries,setEntries]=useState<HistoryItem[]>([]),[loading,setLoading]=useState(true),[expanded,setExpanded]=useState<string|null>(null);
 useEffect(()=>{let active=true;invoke<HistoryItem[]>('records.history',{siteId:site.id,module,id:record.id}).then(r=>{if(active)setEntries(r)}).catch(e=>notify(safeMessage(e),true)).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[site.id,module,record.id,notify]);
 function changes(r:HistoryItem){const a=JSON.parse(r.before_data||'{}') as Record<string,unknown>,b=JSON.parse(r.after_data||'{}') as Record<string,unknown>;
    return Array.from(new Set([...Object.keys(a),...Object.keys(b)])).filter(k=>!k.startsWith('_')&&JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>({key:k,old:a[k],value:b[k]}));}
 return <div className="modal-shade" onMouseDown={onClose}><div className="modal history-modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h3><History size={18}/>{tr("Lịch sử thay đổi")}</h3><small>{String(record.data.name||record.data.title||record.data.assetCode||'Bản ghi')}</small></div><button className="iconbtn" onClick={onClose}><X size={19}/></button></div><div className="modal-body">{loading?<p>{tr("Đang tải lịch sử...")}</p>:!entries.length?<p>{tr("Chưa có lịch sử cho bản ghi này. Các lần thay đổi sau khi nâng cấp sẽ được ghi nhận.")}</p>:<div className="history-timeline">{entries.map(h=><div key={h.id} className="history-entry"><div className="history-dot"><Clock3 size={13}/></div><div className="history-body"><strong>{tr(h.action)} · {h.username||tr('System')}</strong><small>{new Date(h.created_at).toLocaleString(readUILanguage()==='en'?'en-US':'vi-VN')}</small><button className="history-toggle" onClick={()=>setExpanded(expanded===h.id?null:h.id)}>{tr(expanded===h.id?'Thu gọn':'Xem các trường thay đổi')}</button>{expanded===h.id&&<div className="history-changes">{changes(h).length?changes(h).map(c=><div key={tr(c.key)}><strong>{tr(c.key)}</strong><span>{translateLocaleValue(c.old)} → {translateLocaleValue(c.value)}</span></div>):tr('Không có thay đổi nội dung.')}</div>}</div></div>)}</div>}</div><div className="modal-footer"><button className="btn light" onClick={onClose}>{tr("Đóng")}</button></div></div></div>;
}