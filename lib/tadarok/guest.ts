import {exampleCorrection,exampleDocuments} from './example';
import {database,uid,now,type Context} from './server';
import {UserError} from './domain';
const COOKIE='__Host-tadarok-trial';
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function guestSpace(request:Request){
 const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||! /^[a-f0-9]{64}$/.test(token))return null;
 return database().prepare('SELECT s.id,s.name,s.owner_id FROM guest_sessions g JOIN spaces s ON s.id=g.space_id WHERE g.token_hash=? AND g.expires_at>?').bind(await hash(token),now()).first<{id:string;name:string;owner_id:string}>();
}
export async function startGuest(request:Request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 try{
 if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))throw new UserError('مصدر الطلب غير مسموح.',403);
 const existing=await guestSpace(request);if(existing)return Response.json({ready:true},{headers});
 const db=database(),id=uid(),at=now(),expires=new Date(Date.now()+86400000).toISOString(),owner='guest:'+uid();
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const key=await hash(token),cid=uid();
 const statements=[db.prepare("INSERT INTO spaces(id,owner_id,name,created_at) SELECT ?,?,'تجربة تدارك',? WHERE (SELECT COUNT(*) FROM guest_sessions WHERE created_at>?)<200").bind(id,owner,at,new Date(Date.now()-86400000).toISOString()),db.prepare('INSERT INTO guest_sessions(token_hash,space_id,expires_at,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM spaces WHERE id=?)').bind(key,id,expires,at,id)];
 for(const {title,body,kind} of exampleDocuments)statements.push(db.prepare("INSERT INTO documents(id,space_id,title,body,kind,version,mutation_id,is_demo,created_at,updated_at) SELECT ?,?,?,?,?,1,?,0,?,? WHERE EXISTS(SELECT 1 FROM spaces WHERE id=?)").bind(uid(),id,title,body,kind,uid(),at,at,id));
 const c=exampleCorrection;
 statements.push(db.prepare("INSERT INTO corrections(id,space_id,title,old_text,new_text,reference,reference_url,reason,is_demo,created_at) SELECT ?,?,?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM spaces WHERE id=?)").bind(cid,id,c.title,c.oldText,c.newText,c.reference,c.referenceUrl,c.reason,at,id));
 const results=await db.batch(statements);if(!results[0].meta.changes)throw new UserError('بلغت التجربة السعة اليومية. يمكنك تسجيل الدخول لاستخدام مساحة خاصة أو المحاولة لاحقًا.',429);
 return Response.json({ready:true},{headers:{...headers,'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`}});
 }catch(e){return Response.json({error:e instanceof UserError?e.message:'تعذر بدء التجربة. حاول مجددًا.'},{status:e instanceof UserError?e.status:503,headers});}
}
export async function reserveGuestAnalysis(c:Context){
 const at=now(),since=new Date(Date.now()-86400000).toISOString();
 const result=await c.db.prepare('INSERT INTO guest_analysis_budget(id,space_id,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM guest_analysis_budget WHERE space_id=?)<5 AND (SELECT COUNT(*) FROM guest_analysis_budget WHERE created_at>?)<100').bind(uid(),c.space!.id,at,c.space!.id,since).run();
 if(!result.meta.changes)throw new UserError('بلغت التجربة حد الفحص للجلسة أو السعة اليومية. يمكنك متابعة المراجعة والتصدير أو تسجيل الدخول لمساحة خاصة.',429);
}
