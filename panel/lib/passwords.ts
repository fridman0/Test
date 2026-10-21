const enc=new TextEncoder();
export const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const digest=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
export async function hashPassword(password:string,pepper:string,salt=randomToken()){
  const keyed=await crypto.subtle.importKey('raw',enc.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const input=await crypto.subtle.sign('HMAC',keyed,enc.encode(password));
  const key=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveBits']);
  const hash=hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256));
  return 'pbkdf2-sha256-100000$'+salt+'$'+hash;
}
export async function verifyPassword(password:string,stored:string,pepper:string){
  const [algorithm,salt]=stored.split('$');if(algorithm!=='pbkdf2-sha256-100000'||!salt)return false;
  const actual=await hashPassword(password,pepper,salt);let diff=actual.length^stored.length;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^(stored.charCodeAt(i)||0);return diff===0;
}
