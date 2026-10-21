import {env} from 'cloudflare:workers';
import {digest,randomToken,hashPassword,verifyPassword} from '../../../lib/passwords';
export const dynamic='force-dynamic';
const cookieName='__Host-printhub';
type User={id:string;login:string;password:string;role:string;active:number;version:number};
const json=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
async function handle(req:Request){try{
 const db=env.DB;if(!db)return json({error:'База данных ещё не подключена.'},503);
 const pepper=(env as unknown as {PASSWORD_PEPPER?:string}).PASSWORD_PEPPER;if(!pepper)return json({error:'Защита паролей ещё не настроена.'},503);
 const url=new URL(req.url),action=url.pathname.replace(/^\/api\//,''),now=Math.floor(Date.now()/1000);
 if(req.method==='POST'&&req.headers.get('origin')!==url.origin)fail('Запрос с другого сайта запрещён.',403);
 const cookie=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
 const hash=await digest(cookie);
 const me=cookie?await db.prepare('SELECT u.id,u.login,u.role,u.active,u.version FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND s.version=u.version AND u.active=1').bind(hash,now).first<User>():null;
 const initialized=!!(await db.prepare("SELECT value FROM settings WHERE key='initialized'").first());
 if(req.method==='GET'&&action==='session')return json({user:me?{id:me.id,login:me.login,role:me.role}:null,initialized});
 if(req.method==='GET'&&action==='users'){if(me?.role!=='admin')fail('Требуется администратор.',403);return json({users:(await db.prepare('SELECT id,login,role,active,created FROM users ORDER BY created,login').all()).results});}
 if(req.method!=='POST')return json({error:'Не найдено.'},404);
 if(Number(req.headers.get('content-length')||0)>4096)fail('Слишком большой запрос.',413);
 const raw=await req.text();if(raw.length>4096)fail('Слишком большой запрос.',413);let parsed:unknown;try{parsed=JSON.parse(raw);}catch{fail('Некорректный запрос.');}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('Некорректный запрос.');const b=parsed as Record<string,unknown>;
 const credentials=()=>{const login=String(b.login||'').trim().toLowerCase(),password=String(b.password||'');if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(login))fail('Логин: 3–40 латинских букв, цифр, точек, дефисов или подчёркиваний.');if(password.length<14||password.length>128)fail('Пароль должен содержать от 14 до 128 символов.');return {login,password};};
 const limit=async()=>{const ip=req.headers.get('cf-connecting-ip')||'unknown';for(const scope of ['ip:'+ip,'login:'+String(b.login||'').trim().toLowerCase()]){const key=await digest(pepper+scope+Math.floor(now/900));const row=await db.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+900).first<{count:number}>();if((row?.count||0)>10)fail('Слишком много попыток. Повторите через 15 минут.',429);}await db.batch([db.prepare('DELETE FROM attempts WHERE expires<?').bind(now),db.prepare('DELETE FROM sessions WHERE expires<?').bind(now)]);};
 if(action==='setup'){
  if(initialized)fail('Настройка уже завершена.',409);
  // Bootstrap requires a server secret; caller-controlled identity headers are never trusted.
  const setupToken=(env as unknown as {SETUP_TOKEN?:string}).SETUP_TOKEN;const suppliedToken=String(b.setupToken||'');if(!setupToken||await digest(suppliedToken)!==await digest(setupToken))fail('Неверный ключ первоначальной настройки.',403);const owner='cloudflare-owner';
  await limit();const {login,password}=credentials(),passwordHash=await hashPassword(password,pepper),id=crypto.randomUUID();
  // The unique settings key and user insertion commit atomically, preventing two initial admins.
  await db.batch([db.prepare("INSERT INTO settings(key,value) VALUES('initialized',?)").bind(owner),db.prepare("INSERT INTO users(id,login,password,role,active,version,created) VALUES(?,?,?,'admin',1,1,?)").bind(id,login,passwordHash,now)]);
  return json({ok:true});
 }
 if(action==='login'){
  if(!initialized)fail('Сначала создайте администратора.',409);await limit();
  const login=String(b.login||'').trim().toLowerCase(),password=String(b.password||'');if(login.length>40||password.length>128)fail('Неверный логин или пароль.',401);
  const user=await db.prepare('SELECT * FROM users WHERE login=?').bind(login).first<User>();
  const valid=await verifyPassword(password,user?.password||'pbkdf2-sha256-100000$dummy$'+'0'.repeat(64),pepper);
  if(!valid||!user||!user.active)fail('Неверный логин или пароль.',401);
  const token=randomToken();const inserted=await db.batch([db.prepare('DELETE FROM sessions WHERE hash=?').bind(hash),db.prepare('INSERT INTO sessions(hash,user_id,version,expires) SELECT ?,id,version,? FROM users WHERE id=? AND active=1 AND version=?').bind(await digest(token),now+28800,user.id,user.version)]);
  if(!inserted[1].meta.changes)fail('Аккаунт был изменён. Повторите вход.',401);
  return json({ok:true},200,{'Set-Cookie':cookieName+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800'});
 }
 if(action==='logout'){await db.prepare('DELETE FROM sessions WHERE hash=?').bind(hash).run();return json({ok:true},200,{'Set-Cookie':cookieName+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});}
 if(!me)fail('Войдите в панель.',401);if(me.role!=='admin')fail('Требуется администратор.',403);
 if(action==='users/create'){const {login,password}=credentials();const id=crypto.randomUUID();try{await db.prepare("INSERT INTO users(id,login,password,role,active,version,created) VALUES(?,?,?,'user',1,1,?)").bind(id,login,await hashPassword(password,pepper),now).run();}catch{fail('Этот логин уже занят.',409);}return json({ok:true});}
 const id=String(b.id||'');if(id===me.id)fail('Нельзя изменить собственный аккаунт.');
 const target=await db.prepare('SELECT id,role FROM users WHERE id=?').bind(id).first<{id:string;role:string}>();if(!target)fail('Пользователь не найден.',404);if(target.role==='admin')fail('Изменение администратора запрещено.',403);
 if(action==='users/block'){if(typeof b.blocked!=='boolean')fail('Некорректное состояние.');await db.batch([db.prepare('UPDATE users SET active=?,version=version+1 WHERE id=?').bind(b.blocked?0:1,id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)]);return json({ok:true});}
 if(action==='users/delete'){await db.batch([db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),db.prepare('DELETE FROM users WHERE id=?').bind(id)]);return json({ok:true});}
 return json({error:'Не найдено.'},404);
 }catch(e){const error=e as Error&{status?:number};if(error.status)return json({error:error.message},error.status);console.error('Panel request failed');return json({error:'Не удалось выполнить операцию. Повторите позднее.'},500);}}
export const GET=handle;export const POST=handle;

