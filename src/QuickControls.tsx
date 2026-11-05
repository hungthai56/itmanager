import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Check,Plus,X} from 'lucide-react';
import {tr} from './i18n';

/** Edit a text cell in place. Enter/blur saves; Escape cancels. No modal required. */
export function QuickEditableCell({value,onSave,disabled=false,label}:{value:string;onSave:(value:string)=>Promise<void>;disabled?:boolean;label:string}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(value),[pending,setPending]=useState(false);
 const settled=useRef(false);
 useEffect(()=>{if(!editing)setDraft(value)},[value,editing]);
 const finish=async(cancel=false)=>{
  if(settled.current)return;
  settled.current=true;
  if(cancel||draft.trim()===value.trim()||!draft.trim()){
   setEditing(false);setDraft(value);return;
  }
  setPending(true);
  try{await onSave(draft.trim());setEditing(false)}
  catch{setDraft(value);setEditing(false)}
  finally{setPending(false)}
 };
 if(disabled)return <span>{value||'—'}</span>;
 if(!editing)return <button type="button" className="quick-cell-display" title={`${tr('Nhấp đúp để sửa')}: ${tr(label)}`} onDoubleClick={()=>{settled.current=false;setDraft(value);setEditing(true)}} onClick={e=>{if(e.detail===2){settled.current=false;setEditing(true)}}}>{value||'—'}</button>;
 return <input autoFocus aria-label={tr(label)} className="quick-cell-input" value={draft} disabled={pending} onChange={e=>setDraft(e.target.value)} onFocus={e=>e.currentTarget.select()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void finish()}else if(e.key==='Escape'){e.preventDefault();void finish(true)}}} onBlur={()=>void finish()}/>;
}

export function FastTaskComposer({owner,onCreate}:{owner:string;onCreate:(data:Record<string,string>)=>Promise<void>}){
 const [title,setTitle]=useState(''),[assignee,setAssignee]=useState(owner),[dueDate,setDueDate]=useState(()=>{
  const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 }),[priority,setPriority]=useState('Normal'),[busy,setBusy]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 async function add(e:FormEvent){e.preventDefault();if(!title.trim()||busy)return;
  setBusy(true);
  try{await onCreate({title:title.trim(),assignedTo:assignee.trim(),dueDate,priority,status:'Open'});setTitle('');input.current?.focus()}
  catch{ /* onCreate already reports the error; keep draft for retry */ }
  finally{setBusy(false)}
 }
 return <form onSubmit={add} className="quick-composer" aria-label={tr('Tạo công việc nhanh')}>
  <div className="quick-composer-title"><Plus size={17}/><input ref={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder={tr('Nhập công việc và nhấn Enter để tạo...')} required maxLength={250} aria-label={tr('Tên công việc')}/>{title&&<button type="button" title={tr('Xóa nội dung')} className="iconbtn" onClick={()=>setTitle('')}><X size={14}/></button>}</div>
  <input className="quick-assignee" value={assignee} onChange={e=>setAssignee(e.target.value)} aria-label={tr('Người phụ trách')} placeholder={tr('Người phụ trách')}/>
  <input className="quick-due" type="date" aria-label={tr('Hạn hoàn thành')} value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
  <select aria-label={tr('Mức ưu tiên')} value={priority} onChange={e=>setPriority(e.target.value)}>{['Low','Normal','High','Critical'].map(p=><option value={p} key={p}>{tr(p)}</option>)}</select>
  <button className="btn primary" type="submit" disabled={busy||!title.trim()}><Check size={16}/>{tr('Tạo nhanh')}</button>
 </form>;
}