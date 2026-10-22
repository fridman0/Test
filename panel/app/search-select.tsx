'use client';
import {useEffect,useRef,useState} from 'react';
type Option={value:string;label:string};
type Props={id:string;value:string;options:Option[];placeholder:string;disabled?:boolean;onChange:(value:string)=>void};
const normalize=(s:string)=>s.toLocaleLowerCase('ru').replace(/[\s_.-]+/g,'');
export default function SearchSelect({id,value,options,placeholder,disabled,onChange}:Props){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null);
 const selected=options.find(o=>o.value===value);
 const filtered=options.filter(o=>normalize(o.label).includes(normalize(query)));
 const index=Math.min(active,Math.max(0,filtered.length-1));
 useEffect(()=>{if(disabled){setOpen(false);setQuery('');}},[disabled]);
 useEffect(()=>{if(open)list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[index,open,query]);
 function choose(option:Option){onChange(option.value);setQuery('');setOpen(false);}
 function show(){setQuery('');setActive(Math.max(0,options.findIndex(o=>o.value===value)));setOpen(true);}
 return <div className="search-select" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)){setOpen(false);setQuery('');}}}>
 <div className="search-select-control"><input ref={input} id={id} role="combobox" type="text" autoComplete="off" disabled={disabled} aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-list'} aria-activedescendant={open&&filtered[index]?id+'-option-'+index:undefined} placeholder={open?'Введите для поиска…':placeholder} value={open?query:selected?.label||''} onClick={()=>{if(!open)show();}} onChange={e=>{setOpen(true);setQuery(e.target.value);setActive(0);}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!open){show();return;}setActive(i=>Math.max(0,Math.min(filtered.length-1,i+(e.key==='ArrowDown'?1:-1))));}else if(e.key==='Enter'&&open){e.preventDefault();if(filtered[index])choose(filtered[index]);}else if(e.key==='Escape'){e.preventDefault();setOpen(false);setQuery('');}}}/><button type="button" tabIndex={-1} disabled={disabled} aria-label="Открыть список" onMouseDown={e=>e.preventDefault()} onClick={()=>{input.current?.focus();if(open){setOpen(false);setQuery('');}else show();}}>⌄</button></div>
 {open&&<div className="search-select-popup"><div className="search-select-count" role="status">{filtered.length?'Найдено: '+filtered.length:'Ничего не найдено'}</div><div ref={list} id={id+'-list'} role="listbox" aria-labelledby={id+'-label'} className="search-select-list">{filtered.map((o,i)=><div id={id+'-option-'+i} key={o.value} role="option" aria-selected={index===i} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>choose(o)}>{o.label}{o.value===value&&<span aria-hidden="true"> ✓</span>}</div>)}</div></div>}
 </div>;
}
