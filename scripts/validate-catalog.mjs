import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const slug=s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
const text=s=>typeof s==='string'&&s.trim().length>0;
function schema(value,rule,where){
 if(rule.enum)check(rule.enum.includes(value),where+': недопустимое значение');
 if(rule.type==='object'){
  check(value&&typeof value==='object'&&!Array.isArray(value),where+': нужен объект');
  for(const key of rule.required||[])check(Object.hasOwn(value,key),where+': отсутствует '+key);
  if(rule.additionalProperties===false)for(const key of Object.keys(value))check(Object.hasOwn(rule.properties,key),where+': неизвестное поле '+key);
  for(const [key,child] of Object.entries(rule.properties||{}))if(Object.hasOwn(value,key))schema(value[key],child,where+'.'+key);
 }
 if(rule.type==='string'){check(typeof value==='string',where+': нужна строка');if(rule.minLength)check(value.trim().length>=rule.minLength,where+': пустая строка');if(rule.pattern)check(new RegExp(rule.pattern).test(value),where+': неверный формат');}
 if(rule.type==='integer')check(Number.isSafeInteger(value)&&value>=rule.minimum,where+': нужен положительный целый размер');
 if(rule.type==='array'){check(Array.isArray(value),where+': нужен массив');if(rule.minItems)check(value.length>=rule.minItems,where+': массив пуст');if(rule.uniqueItems)check(new Set(value.map(v=>JSON.stringify(v))).size===value.length,where+': повторяющиеся значения');value.forEach((v,i)=>schema(v,rule.items,where+'['+i+']'));}
}
try{
 const index=read('catalog/index.json'),manufacturers=read('catalog/manufacturers.json'),modelSchema=read('schemas/printer.schema.json');
 check(index.schemaVersion===1&&Array.isArray(index.printers),'Неверный index.json');
 check(manufacturers.schemaVersion===1&&Array.isArray(manufacturers.manufacturers),'Неверный manufacturers.json');
 const makers=new Set(),models=new Set(),paths=new Set();let total=0;
 for(const m of manufacturers.manufacturers){check(slug(m.id)&&text(m.name),'Неверное описание производителя');check(!makers.has(m.id),'Повтор производителя '+m.id);makers.add(m.id);}
 for(const p of index.printers){
  check(typeof p==='string'&&/^printers\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(p),'Неверный путь карточки: '+p);check(!paths.has(p),'Повтор пути '+p);paths.add(p);
  const m=read('catalog/'+p);schema(m,modelSchema,p);check(makers.has(m.manufacturer),p+': производитель не зарегистрирован');check(!models.has(m.id),'Повтор модели '+m.id);models.add(m.id);check(p===`printers/${m.manufacturer}/${m.id}.json`,p+': путь не соответствует модели');
  const ids=new Set();for(const f of m.files){check(!ids.has(f.id),p+': повтор файла '+f.id);ids.add(f.id);const u=new URL(f.downloadUrl);check(decodeURIComponent(u.pathname.split('/').at(-1))===f.filename,p+': filename не совпадает со ссылкой');const source=new URL(f.sourceUrl);check(source.protocol==='https:'&&!source.username&&!source.password,p+': неверный источник');if(f.kind==='ppd')check(f.filename.toLowerCase().endsWith('.ppd'),p+': готовый PPD должен иметь расширение .ppd');total++;}
 }
 function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const filename=path.join(dir,e.name);check(!e.isSymbolicLink(),'Символические ссылки не разрешены');if(e.isDirectory())scan(filename);else if(e.name.endsWith('.json')){const p=path.relative(path.join(root,'catalog'),filename).split(path.sep).join('/');check(paths.has(p),'Карточка не добавлена в index.json: '+p);}}}
 scan(path.join(root,'catalog/printers'));
 console.log(`Каталог корректен: производителей ${makers.size}, моделей ${models.size}, файлов ${total}.`);
}catch(e){console.error('Ошибка каталога: '+e.message);process.exitCode=1;}
