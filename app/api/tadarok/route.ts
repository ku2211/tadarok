import {env} from 'cloudflare:workers';
import {context,state,needSpace,uid,now,audit} from '@/lib/tadarok/server';
import {UserError,cleanString,safeUrl,assertVersion,assertReviewSnapshot,canApprove} from '@/lib/tadarok/domain';
import {analyzeImpact,impactEngine} from '@/lib/tadarok/ai';
import {exportForReview} from '@/lib/tadarok/export';
import {exampleCorrection,exampleDocuments} from '@/lib/tadarok/example';
import type {Doc,Correction,Finding} from '@/lib/tadarok/types';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function failure(e:unknown){if(e instanceof UserError)return json({error:e.message},e.status);console.error('Tadarok operation failed',e instanceof Error?e.name:'unknown');return json({error:'تعذر إكمال العملية. احتفظ بنصك وحاول مجددًا.'},503);}
export async function GET(request:Request){try{
 const params=new URL(request.url).searchParams;
 const data=await state(await context(params.get('space')||undefined,request));
 if(params.get('export')==='1')return new Response(JSON.stringify(exportForReview(data),null,2),{headers:{'Content-Type':'application/json;charset=utf-8','Content-Disposition':'attachment; filename="tadarok-review-report.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return json(data);
 }catch(e){return failure(e);}}
export async function POST(request:Request){
 try{
 if(request.headers.get('sec-fetch-site')==='cross-site')throw new UserError('طلب غير مسموح.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new UserError('صيغة الطلب غير مدعومة.',415);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new UserError('مصدر الطلب غير مسموح.',403);
 const raw=await request.text();if(raw.length>150000)throw new UserError('حجم الطلب أكبر من المسموح.',413);
 let input:Record<string,unknown>;try{input=JSON.parse(raw);}catch{throw new UserError('تعذر قراءة الطلب.');}
 if(!input||typeof input!=='object'||Array.isArray(input))throw new UserError('طلب غير صالح.');
 const action=cleanString(input.action,'العملية',40);let c=await context(typeof input.spaceId==='string'?input.spaceId:undefined,request);
 const guest=new URL(request.url).pathname==='/api/try';
 if(guest&&['create_space','add_member','example'].includes(action))throw new UserError('هذه العملية متاحة في مساحة العمل المسجلة فقط.',403);
 if(action==='create_space'){
 const name=cleanString(input.name,'اسم المساحة',80,2),id=uid();
 const saved=await c.db.prepare('INSERT INTO spaces(id,owner_id,name,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM spaces WHERE owner_id=?)<10').bind(id,c.actor.id,name,now(),c.actor.id).run();
 if(!saved.meta.changes)throw new UserError('يمكنك إنشاء 10 مساحات كحد أقصى.',409);
 return json(await state(await context(id,request)));}
 if(action==='setup'){
 if(!c.space){const id=uid();await c.db.prepare('INSERT INTO spaces(id,owner_id,name,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM spaces WHERE owner_id=?)').bind(id,c.actor.id,'مساحة تدارك',now(),c.actor.id).run();c=await context(undefined,request);}
 return json(await state(c));}
 const s=needSpace(c);
 if(['add_document','edit_document','import_documents','add_correction'].includes(action)&&input.confirmSynthetic!==true)throw new UserError('أكّد أن المحتوى اصطناعي أو مجهول الهوية بالكامل وخالٍ من سجلات المستفيدين.');
 if(action==='add_document'){
 const count=await c.db.prepare('SELECT COUNT(*) n FROM documents WHERE space_id=?').bind(s).first<{n:number}>();if((count?.n||0)>=20)throw new UserError('تدعم هذه النسخة 20 مادة في مساحة العمل.');
 const id=uid(),time=now();const title=cleanString(input.title,'العنوان',100);const body=cleanString(input.body,'النص',3000,10);const kind=cleanString(input.kind||'منشور','نوع المادة',30);
 const token=uid();const saved=await c.db.batch([c.db.prepare('INSERT INTO documents(id,space_id,title,body,kind,version,mutation_id,is_demo,created_at,updated_at) SELECT ?,?,?,?,?,1,?,0,?,? WHERE (SELECT COUNT(*) FROM documents WHERE space_id=?)<20').bind(id,s,title,body,kind,token,time,time,s),audit(c,id,'document_added',{title},{docId:id,mutationId:token})]);if(!saved[0].meta.changes)throw new UserError('بلغت المكتبة حد 20 مادة.',409);
 }else if(action==='import_documents'){
 if(!Array.isArray(input.documents)||input.documents.length<1||input.documents.length>20)throw new UserError('اختر من ملف واحد إلى 20 ملفًا.');
 const docs=input.documents.map((item:unknown)=>{if(!item||typeof item!=='object')throw new UserError('ملف غير صالح.');const d=item as Record<string,unknown>;return {id:uid(),title:cleanString(d.title,'العنوان',100),body:cleanString(d.body,'النص',3000,10),kind:cleanString(d.kind||'مسودة','نوع المادة',30)};});
 const firstId=docs[0].id;const at=now();const statements=docs.map((d,i)=>c.db.prepare('INSERT INTO documents(id,space_id,title,body,kind,version,mutation_id,is_demo,created_at,updated_at) SELECT ?,?,?,?,?,1,?,0,?,? WHERE '+(i===0?'(SELECT COUNT(*) FROM documents WHERE space_id=?) + ? <= 20':'EXISTS(SELECT 1 FROM documents WHERE id=? AND space_id=?)')).bind(d.id,s,d.title,d.body,d.kind,uid(),at,at,...(i===0?[s,docs.length]:[firstId,s])));
 statements.push(c.db.prepare('INSERT INTO events(id,space_id,entity_id,actor_id,actor_name,actor_role,action,details,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND space_id=?)').bind(uid(),s,firstId,c.actor.id,c.actor.name,c.actor.role,'documents_imported',JSON.stringify({count:docs.length,titles:docs.map(d=>d.title)}),at,firstId,s));
 const saved=await c.db.batch(statements);if(!saved[0].meta.changes)throw new UserError('الملفات تتجاوز سعة المكتبة: 20 مادة. لم يُستورد أي ملف.',409);
 }else if(action==='edit_document'){
 const id=cleanString(input.id,'المادة',80);const doc=await c.db.prepare('SELECT * FROM documents WHERE id=? AND space_id=?').bind(id,s).first<Doc>();if(!doc)throw new UserError('المادة غير موجودة.',404);assertVersion(Number(input.version),doc.version);
 const title=cleanString(input.title,'العنوان',100),body=cleanString(input.body,'النص',3000,10);if(body===doc.body&&title===doc.title)return json(await state(c));
 const token=uid();const guard={docId:id,mutationId:token};const statements=[
 c.db.prepare('UPDATE documents SET title=?,body=?,version=version+1,mutation_id=?,updated_at=? WHERE id=? AND space_id=? AND version=?').bind(title,body,token,now(),id,s,doc.version),
 c.db.prepare("UPDATE findings SET status='stale' WHERE document_id=? AND space_id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND mutation_id=?)").bind(id,s,id,token),
 audit(c,id,'document_edited',{title,fromVersion:doc.version,toVersion:doc.version+1,before:doc.body,after:body},guard)];
 if(input.findingId){const fid=cleanString(input.findingId,'الملاحظة',80);const finding=await c.db.prepare('SELECT f.* FROM findings f JOIN corrections c ON f.correction_id=c.id AND f.run_id=c.last_run_id WHERE f.id=? AND f.document_id=? AND f.space_id=?').bind(fid,id,s).first<Finding>();if(!finding)throw new UserError('الملاحظة غير متاحة.',404);assertVersion(finding.document_version,doc.version);
 assertReviewSnapshot(input,finding);
 statements[0]=c.db.prepare('UPDATE documents SET title=?,body=?,version=version+1,mutation_id=?,updated_at=? WHERE id=? AND space_id=? AND version=? AND EXISTS(SELECT 1 FROM findings f JOIN corrections cr ON cr.id=f.correction_id AND cr.last_run_id=f.run_id WHERE f.id=? AND f.document_id=documents.id AND f.space_id=documents.space_id AND f.document_version=documents.version AND f.status=? AND f.reviewed_at IS ?)').bind(title,body,token,now(),id,s,doc.version,fid,finding.status,finding.reviewed_at);
 statements[2]=audit(c,id,'document_edited',{title,fromVersion:doc.version,toVersion:doc.version+1,before:doc.body,after:body,findingId:fid,note:cleanString(input.note,'سبب التعديل',1000,3)},guard);
 statements.push(c.db.prepare("UPDATE findings SET status='corrected',document_version=?,note=?,reviewed_by=?,reviewed_at=? WHERE id=? AND space_id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND mutation_id=?)").bind(doc.version+1,cleanString(input.note,'سبب التعديل',1000,3),c.actor.name,now(),fid,s,id,token));}
 const result=await c.db.batch(statements);if(!result[0].meta.changes)throw new UserError('تغيّر النص أثناء الحفظ. حدّث الصفحة وحاول مجددًا.',409);
 }else if(action==='add_correction'){
 const oldText=cleanString(input.oldText,'النص السابق',2000,5),newText=cleanString(input.newText,'النص المصحح',2000,5);if(oldText===newText)throw new UserError('أدخل تغييرًا واضحًا بين النصين.');
 const count=await c.db.prepare('SELECT COUNT(*) n FROM corrections WHERE space_id=?').bind(s).first<{n:number}>();if((count?.n||0)>=40)throw new UserError('بلغت المساحة حد التصحيحات في هذه النسخة.');
 const id=uid(),title=cleanString(input.title,'عنوان التصحيح',120);const saved=await c.db.batch([c.db.prepare('INSERT INTO corrections(id,space_id,title,old_text,new_text,reference,reference_url,reason,is_demo,created_at) SELECT ?,?,?,?,?,?,?,?,0,? WHERE (SELECT COUNT(*) FROM corrections WHERE space_id=?)<40').bind(id,s,title,oldText,newText,cleanString(input.reference,'المرجع',600,3),safeUrl(input.referenceUrl),cleanString(input.reason,'سبب التصحيح',1000,3),now(),s),audit(c,id,'correction_added',{title,oldText,newText,reference:input.reference},{correctionId:id})]);
 if(!saved[0].meta.changes)throw new UserError('بلغت المساحة حد التصحيحات أثناء الحفظ. لم يُضف تصحيح جديد.',409);
 return json({...await state(c),selectedCorrectionId:id});
 }else if(action==='analyze'){
 if(!env.OPENAI_API_KEY)throw new UserError('التحليل الدلالي ينتظر ربط الخدمة. يمكنك الآن إضافة المواد وتجربة مسار المراجعة.',503);
 const id=cleanString(input.id,'التصحيح',80);const correction=await c.db.prepare('SELECT * FROM corrections WHERE id=? AND space_id=?').bind(id,s).first<Correction>();if(!correction)throw new UserError('التصحيح غير موجود.',404);
 const docs=(await c.db.prepare('SELECT * FROM documents WHERE space_id=? ORDER BY created_at').bind(s).all<Doc>()).results;if(!docs.length)throw new UserError('أضف مادة واحدة على الأقل إلى المكتبة.');
 const runId=uid(),started=now();
 if(guest){const {reserveGuestAnalysis}=await import('@/lib/tadarok/guest');await reserveGuestAnalysis(c,{id:runId,correctionId:id,engine:impactEngine(env.OPENAI_MODEL),docCount:docs.length,createdAt:started});}
 else{const acquired=await c.db.prepare("INSERT INTO runs(id,space_id,correction_id,engine,status,actor,doc_count,created_at) SELECT ?,?,?,?,'running',?,?,? WHERE (SELECT COUNT(*) FROM runs WHERE space_id=? AND created_at>?)<20 AND NOT EXISTS(SELECT 1 FROM runs WHERE space_id=? AND status='running' AND created_at>?)").bind(runId,s,id,impactEngine(env.OPENAI_MODEL),c.actor.name,docs.length,started,s,new Date(Date.now()-86400000).toISOString(),s,new Date(Date.now()-120000).toISOString()).run();if(!acquired.meta.changes)throw new UserError('يوجد تحليل جارٍ أو بلغ استخدام اليوم 20 محاولة. حاول لاحقًا.',429);}
 try{
 const result=await analyzeImpact(env.OPENAI_API_KEY,env.OPENAI_MODEL,correction,docs);
 const statements=result.assessments.map(a=>{const d=docs.find(x=>x.id===a.document_id)!;return c.db.prepare("INSERT INTO findings(id,space_id,correction_id,run_id,document_id,document_version,quote,reason,verdict,status,note,reviewed_by,created_at) SELECT ?,?,?,?,?,?,?,?,?, 'pending','','',? FROM documents WHERE id=? AND space_id=? AND version=?").bind(uid(),s,id,runId,d.id,d.version,a.quote,a.reason,a.verdict,now(),d.id,s,d.version);});
 statements.push(c.db.prepare("UPDATE runs SET status=CASE WHEN (SELECT COUNT(*) FROM findings WHERE run_id=?)=? AND (SELECT COUNT(*) FROM documents WHERE space_id=?)=? THEN 'completed' ELSE 'stale' END,elapsed_ms=?,engine=? WHERE id=? AND space_id=?").bind(runId,docs.length,s,docs.length,Date.now()-Date.parse(started),result.engine,runId,s));
 statements.push(c.db.prepare("UPDATE corrections SET last_run_id=? WHERE id=? AND space_id=? AND EXISTS(SELECT 1 FROM runs WHERE id=? AND status='completed')").bind(runId,id,s,runId));
 statements.push(audit(c,id,'analysis_finished',{runId,engine:result.engine,count:docs.length,usage:result.usage,checks:result.checks},{runId,status:'completed'}));
 statements.push(audit(c,id,'analysis_invalidated',{runId,engine:result.engine,count:docs.length,reason:'library_changed',usage:result.usage,checks:result.checks},{runId,status:'stale'}));await c.db.batch(statements);
 const status=await c.db.prepare('SELECT status FROM runs WHERE id=?').bind(runId).first<{status:string}>();if(status?.status!=='completed')throw new UserError('تغيّرت المكتبة أثناء التحليل. أعد الفحص ليشمل جميع المواد الحالية.',409);
 }catch(e){console.error('Tadarok analysis failed',{status:e instanceof UserError?e.status:503,reason:e instanceof UserError?e.message:e instanceof Error?e.name:'unknown'});await c.db.prepare("UPDATE runs SET status='failed',elapsed_ms=? WHERE id=? AND status='running'").bind(Date.now()-Date.parse(started),runId).run();throw e;}
 }else if(action==='review'){
 const id=cleanString(input.id,'الملاحظة',80);const finding=await c.db.prepare('SELECT f.* FROM findings f JOIN corrections c ON f.correction_id=c.id AND f.run_id=c.last_run_id WHERE f.id=? AND f.space_id=?').bind(id,s).first<Finding>();if(!finding)throw new UserError('الملاحظة لم تعد ضمن أحدث فحص.',409);
 const doc=await c.db.prepare('SELECT * FROM documents WHERE id=? AND space_id=?').bind(finding.document_id,s).first<Doc>();if(!doc)throw new UserError('المادة غير موجودة.',404);assertVersion(finding.document_version,doc.version);if(finding.status==='stale')throw new UserError('أعد الفحص لأن المادة تغيرت بعد المراجعة.',409);
 assertReviewSnapshot(input,finding);
 const decision=cleanString(input.decision,'القرار',20);if(!['approve','dismiss','refer'].includes(decision))throw new UserError('قرار غير صالح.');
 if(decision==='approve'&&!canApprove(c.actor.role))throw new UserError('اعتماد المراجعة متاح للمراجع ومسؤول المساحة.',403);
 if(decision==='approve'&&finding.verdict!=='unaffected'&&finding.status!=='corrected')throw new UserError('عدّل النص أولًا، أو سجّل أن التنبيه لا ينطبق مع توضيح السبب.');
 const note=cleanString(input.note,'سبب القرار',1000,3);const status=decision==='approve'?'approved':decision==='dismiss'?'dismissed':'referred';
 const at=new Date(Math.max(Date.now(),finding.reviewed_at?Date.parse(finding.reviewed_at)+1:0)).toISOString(),eventId=uid();
 // The unique audit row is an atomic mutation token. No event or decision is
 // written unless the viewed document, finding and latest run still match.
 const results=await c.db.batch([
  c.db.prepare('INSERT INTO events(id,space_id,entity_id,actor_id,actor_name,actor_role,action,details,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM findings f JOIN corrections cr ON cr.id=f.correction_id AND cr.last_run_id=f.run_id JOIN documents d ON d.id=f.document_id AND d.space_id=f.space_id WHERE f.id=? AND f.space_id=? AND f.document_version=? AND d.version=f.document_version AND f.status=? AND f.reviewed_at IS ?)').bind(eventId,s,id,c.actor.id,c.actor.name,c.actor.role,'review_'+decision,JSON.stringify({note,documentId:doc.id,documentTitle:doc.title,version:doc.version}),at,id,s,doc.version,finding.status,finding.reviewed_at),
  c.db.prepare('UPDATE findings SET status=?,note=?,reviewed_by=?,reviewed_at=? WHERE id=? AND space_id=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND space_id=? AND entity_id=?)').bind(status,note,c.actor.name,at,id,s,eventId,s,id),
 ]);if(!results[1].meta.changes)throw new UserError('تغيّرت الملاحظة أو الفحص أثناء اتخاذ القرار. حدّث الصفحة.',409);
 }else if(action==='add_member'){
 if(c.actor.role!=='owner')throw new UserError('إدارة الأعضاء متاحة لمسؤول المساحة.',403);const email=cleanString(input.email,'البريد',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new UserError('أدخل بريدًا صحيحًا.');const role=input.role;if(!['editor','reviewer'].includes(String(role)))throw new UserError('اختر دورًا صحيحًا.');if(email===c.actor.email)throw new UserError('أنت مسؤول المساحة بالفعل.');
 await c.db.batch([c.db.prepare('INSERT INTO members(id,space_id,email,role) VALUES(?,?,?,?) ON CONFLICT(space_id,email) DO UPDATE SET role=excluded.role').bind(uid(),s,email,role),audit(c,s,'member_added',{email,role})]);
 }else if(action==='example'){
 const previous=await c.db.prepare('SELECT id FROM corrections WHERE space_id=? AND is_demo=1 LIMIT 1').bind(s).first<{id:string}>();if(previous)return json({...await state(c),selectedCorrectionId:previous.id});
 const count=await c.db.prepare('SELECT COUNT(*) n FROM documents WHERE space_id=?').bind(s).first<{n:number}>();if((count?.n||0)>15)throw new UserError('المثال يحتاج مكانًا لخمس مواد ضمن الحد المسموح.');
 const cid=uid(),rid=uid(),at=now();const x=exampleCorrection;
 const commands=[c.db.prepare('INSERT INTO corrections(id,space_id,title,old_text,new_text,reference,reference_url,reason,last_run_id,is_demo,created_at) SELECT ?,?,?,?,?,?,?,?,?,1,? WHERE (SELECT COUNT(*) FROM documents WHERE space_id=?)<=15 AND (SELECT COUNT(*) FROM corrections WHERE space_id=?)<40 AND NOT EXISTS(SELECT 1 FROM corrections WHERE space_id=? AND is_demo=1)').bind(cid,s,x.title,x.oldText,x.newText,x.reference,x.referenceUrl,x.reason,rid,at,s,s,s),
 c.db.prepare("INSERT INTO runs(id,space_id,correction_id,engine,status,actor,doc_count,elapsed_ms,created_at) SELECT ?,?,?,'illustrative-example','completed',?,5,0,? WHERE EXISTS(SELECT 1 FROM corrections WHERE id=? AND space_id=?)").bind(rid,s,cid,c.actor.name,at,cid,s)];
 for(const d of exampleDocuments){const id=uid();commands.push(c.db.prepare('INSERT INTO documents(id,space_id,title,body,kind,version,mutation_id,is_demo,created_at,updated_at) SELECT ?,?,?,?,?,1,?,1,?,? WHERE EXISTS(SELECT 1 FROM corrections WHERE id=? AND space_id=?)').bind(id,s,d.title,d.body,d.kind,uid(),at,at,cid,s));commands.push(c.db.prepare("INSERT INTO findings(id,space_id,correction_id,run_id,document_id,document_version,quote,reason,verdict,status,note,reviewed_by,created_at) SELECT ?,?,?,?,?,1,?,?,?,'pending','','',? WHERE EXISTS(SELECT 1 FROM corrections WHERE id=? AND space_id=?)").bind(uid(),s,cid,rid,id,d.quote,d.reason,d.verdict,at,cid,s));}
 commands.push(audit(c,cid,'example_added',{notice:'بيانات ونتائج توضيحية معدة مسبقًا وليست قياسًا لدقة الذكاء الاصطناعي.'},{correctionId:cid}));
 const saved=await c.db.batch(commands);
 if(!saved[0].meta.changes){const existing=await c.db.prepare('SELECT id FROM corrections WHERE space_id=? AND is_demo=1 LIMIT 1').bind(s).first<{id:string}>();if(existing)return json({...await state(c),selectedCorrectionId:existing.id});throw new UserError('لا تتوفر سعة لإضافة المثال. لم تتغير المكتبة.',409);}
 return json({...await state(c),selectedCorrectionId:cid});
 }else throw new UserError('العملية غير مدعومة.');
 return json(await state(c));
 }catch(e){return failure(e);}
}
