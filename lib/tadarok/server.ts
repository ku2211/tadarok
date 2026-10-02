import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {UserError} from './domain';
import type {Actor,WorkspaceState} from './types';
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export function database(){if(!env.DB)throw new UserError('تعذر الاتصال بمساحة العمل. حاول مجددًا بعد قليل.',503);return env.DB;}
export async function context(spaceId?:string,request?:Request){
 if(request&&new URL(request.url).pathname==='/api/try'){
 const {guestSpace}=await import('./guest');const space=await guestSpace(request);
 if(!space)throw new UserError('انتهت جلسة التجربة. افتح صفحة جرّب تدارك لبدء جلسة جديدة.',401);
 if(spaceId&&spaceId!==space.id)throw new UserError('هذه المساحة ليست ضمن جلستك التجريبية.',403);
 return {db:database(),space,actor:{id:space.owner_id,name:'زائر تجريبي',email:space.owner_id+'@guest.invalid',role:'owner'} as Actor};
 }
 const user=await getChatGPTUser();if(!user)throw new UserError('سجل الدخول لفتح مساحة العمل.',401);
 const db=database();const email=user.email.toLowerCase();
 let space:{id:string;name:string;owner_id:string}|null;
 if(spaceId){space=await db.prepare('SELECT * FROM spaces WHERE id=?').bind(spaceId).first();}
 else{space=await db.prepare('SELECT * FROM spaces WHERE owner_id=? ORDER BY created_at,id LIMIT 1').bind(user.userId).first();if(!space)space=await db.prepare('SELECT s.* FROM spaces s JOIN members m ON s.id=m.space_id WHERE m.email=? ORDER BY s.created_at LIMIT 1').bind(email).first();}
 let role:Actor['role']='owner';if(space){if(space.owner_id!==user.userId){const member=await db.prepare('SELECT role FROM members WHERE space_id=? AND email=?').bind(space.id,email).first<{role:Actor['role']}>();if(!member)throw new UserError('لا تملك صلاحية الوصول لهذه المساحة.',403);role=member.role;}}else if(spaceId)throw new UserError('مساحة العمل غير متاحة.',404);
 return {db,space,actor:{id:user.userId,name:user.displayName,email,role} as Actor};
}
export type Context=Awaited<ReturnType<typeof context>>;
export function needSpace(c:Context){if(!c.space)throw new UserError('أنشئ مساحة العمل أولًا.');return c.space.id;}
type AuditGuard={docId:string;mutationId:string}|{runId:string;status:string}|{correctionId:string};
export function audit(c:Context,entityId:string,action:string,details:unknown,guard?:AuditGuard){
 const values=[uid(),needSpace(c),entityId,c.actor.id,c.actor.name,c.actor.role,action,JSON.stringify(details),now()];
 let sql='INSERT INTO events (id,space_id,entity_id,actor_id,actor_name,actor_role,action,details,created_at) SELECT ?,?,?,?,?,?,?,?,?';
 if(guard&&'docId' in guard){sql+=' WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND space_id=? AND mutation_id=?)';values.push(guard.docId,needSpace(c),guard.mutationId);}
 else if(guard&&'runId' in guard){sql+=' WHERE EXISTS(SELECT 1 FROM runs WHERE id=? AND space_id=? AND status=?)';values.push(guard.runId,needSpace(c),guard.status);}
 else if(guard){sql+=' WHERE EXISTS(SELECT 1 FROM corrections WHERE id=? AND space_id=?)';values.push(guard.correctionId,needSpace(c));}
 return c.db.prepare(sql).bind(...values);
}
export async function state(c:Context):Promise<WorkspaceState>{
 const accessible=await c.db.prepare('SELECT s.id,s.name FROM spaces s WHERE s.owner_id=? OR EXISTS(SELECT 1 FROM members m WHERE m.space_id=s.id AND m.email=?) ORDER BY s.created_at,s.id').bind(c.actor.id,c.actor.email).all<{id:string;name:string}>();
 const empty={spaces:accessible.results,space:c.space?{id:c.space.id,name:c.space.name}:null,actor:c.actor,documents:[],corrections:[],findings:[],events:[],runs:[],members:[],aiReady:!!env.OPENAI_API_KEY};if(!c.space)return empty;
 const s=c.space.id;const [documents,corrections,findings,events,runs,members]=await Promise.all([
 c.db.prepare('SELECT * FROM documents WHERE space_id=? ORDER BY created_at DESC').bind(s).all(),
 c.db.prepare('SELECT * FROM corrections WHERE space_id=? ORDER BY created_at DESC').bind(s).all(),
 c.db.prepare('SELECT f.* FROM findings f JOIN corrections c ON f.correction_id=c.id AND f.run_id=c.last_run_id WHERE f.space_id=?').bind(s).all(),
 c.db.prepare('SELECT * FROM events WHERE space_id=? ORDER BY created_at DESC LIMIT 150').bind(s).all(),
 c.db.prepare('SELECT * FROM runs WHERE space_id=? ORDER BY created_at DESC LIMIT 60').bind(s).all(),
 c.actor.role==='owner'?c.db.prepare('SELECT id,email,role FROM members WHERE space_id=? ORDER BY email').bind(s).all():Promise.resolve({results:[]})]);
 return {...empty,documents:documents.results,corrections:corrections.results,findings:findings.results,events:events.results,runs:runs.results,members:members.results} as WorkspaceState;
}
