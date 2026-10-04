import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const sql=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
class Statement {
 constructor(text,values=[]){this.text=text;this.values=values;}
 bind(...values){return new Statement(this.text,values);}
 async first(){return sql.prepare(this.text).get(...this.values)||null;}
 async all(){return {results:sql.prepare(this.text).all(...this.values)};}
 async run(){const r=sql.prepare(this.text).run(...this.values);return {meta:{changes:r.changes},success:true};}
}
globalThis.__tadarokTestEnv={DB:{prepare:text=>new Statement(text),batch:async statements=>{sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
globalThis.__tadarokTestIdentity=null;
const {GET,POST}=await import('../app/api/tadarok/route.ts');
const identities={owner:{userId:'owner',email:'owner@example.test',displayName:'مراجع اختباري'},other:{userId:'other',email:'other@example.test',displayName:'مستخدم آخر'},editor:{userId:'editor',email:'editor@example.test',displayName:'محرر اختباري'}};
async function req(who,action,payload={},expected=200){globalThis.__tadarokTestIdentity=identities[who]||null;if(action==='review'||(action==='edit_document'&&payload.findingId)){const f=sql.prepare('SELECT * FROM findings WHERE id=?').get(payload.findingId||payload.id);if(f)payload={documentVersion:f.document_version,expectedStatus:f.status,expectedReviewedAt:f.reviewed_at,...payload};}const options=action?{method:'POST',headers:{'Content-Type':'application/json',origin:'https://test.local'},body:JSON.stringify({action,...payload})}:{};const r=await (action?POST:GET)(new Request('https://test.local/api/tadarok',options));const data=await r.json();assert.equal(r.status,expected,JSON.stringify({action,data}));return data;}
await req(null,null,{},401);
let s=await req('owner','setup');const spaceId=s.space.id;
await req('other','add_document',{spaceId,title:'اختبار عزل',body:'نص اختبار اصطناعي.',confirmSynthetic:true},403);
await req('owner','add_document',{spaceId,title:'بدون إقرار',body:'نص اختبار اصطناعي.'},400);
s=await req('owner','example',{spaceId});
await req('owner','analyze',{spaceId,id:s.corrections[0].id},503);
// Downloads must authenticate and preserve workspace isolation and redaction.
const exportUrl='https://test.local/api/tadarok?export=1&space='+spaceId;
for(const [identity,status] of [[null,401],[identities.other,403],[identities.owner,200]]){
 globalThis.__tadarokTestIdentity=identity;
 const response=await GET(new Request(exportUrl));assert.equal(response.status,status);
 if(status===200){assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(response.headers.get('cache-control'),'no-store');const report=await response.json();assert.equal(report.scope.completeArchive,false);assert.equal(report.documents.length,5);assert.equal(report.actor.email,'');assert.equal(JSON.stringify(report).includes('owner@example.test'),false);}
}

await req('owner','add_member',{spaceId,email:identities.editor.email,role:'editor'});
const unaffected=s.findings.find(f=>f.verdict==='unaffected');
await req('editor','review',{spaceId,id:unaffected.id,decision:'approve',note:'راجعنا النص.'},403);
await req('editor','add_member',{spaceId,email:'x@example.test',role:'reviewer'},403);
s=await req('owner','review',{spaceId,id:unaffected.id,decision:'approve',note:'راجعنا النص والمرجع.'});assert.equal(s.findings.find(f=>f.id===unaffected.id).status,'approved');
const affected=s.findings.find(f=>f.verdict==='affected');const doc=s.documents.find(d=>d.id===affected.document_id);
await req('owner','review',{spaceId,id:affected.id,decision:'approve',note:'محاولة قبل التصحيح.'},400);
s=await req('editor','edit_document',{spaceId,id:doc.id,version:1,title:doc.title,body:doc.body.replace('مسلم','البخاري'),findingId:affected.id,note:'تحديث المرجع.',confirmSynthetic:true});assert.equal(s.findings.find(f=>f.id===affected.id).status,'corrected');
s=await req('owner','review',{spaceId,id:affected.id,decision:'approve',note:'راجعت النسخة المصححة.'});assert.equal(s.findings.find(f=>f.id===affected.id).status,'approved');
await req('editor','edit_document',{spaceId,id:doc.id,version:1,title:doc.title,body:'تعديل قديم من نافذة أخرى.',confirmSynthetic:true},409);
s=await req('editor','edit_document',{spaceId,id:doc.id,version:2,title:doc.title,body:'تعديل جديد يتطلب إعادة مراجعة مستقلة.',confirmSynthetic:true});assert.equal(s.findings.find(f=>f.id===affected.id).status,'stale');
await req('owner','review',{spaceId,id:affected.id,decision:'approve',note:'محاولة على نسخة متغيرة.'},409);
assert.ok(s.events.some(e=>e.action==='document_edited'&&JSON.parse(e.details).before));
await req('owner','import_documents',{spaceId,documents:Array.from({length:16},(_,i)=>({title:'ملف '+i,body:'مادة اختبار اصطناعية للسعة.'})),confirmSynthetic:true},409);
s=await req('owner');assert.equal(s.documents.length,5);
s=await req('owner','import_documents',{spaceId,documents:Array.from({length:15},(_,i)=>({title:'ملف '+i,body:'مادة اختبار اصطناعية للسعة.'})),confirmSynthetic:true});assert.equal(s.documents.length,20);
await req('owner','add_document',{spaceId,title:'فوق السعة',body:'مادة اختبار اصطناعية للسعة.',confirmSynthetic:true},400);
console.log('PASS: actual API handlers + SQLite migration: authentication, tenant isolation, synthetic declaration, missing AI error, role enforcement, edit/approve/invalidate, audit, and atomic 20-file capacity.');

const second=await req('owner','create_space',{spaceId,name:'اختبار منفصل'});
assert.notEqual(second.space.id,spaceId);assert.equal(second.documents.length,0);assert.equal(second.corrections.length,0);assert.equal(second.events.length,0);assert.equal(second.spaces.length,2);
await req('other','add_document',{spaceId:second.space.id,title:'عزل',body:'محتوى اصطناعي جديد.',confirmSynthetic:true},403);
const memberState=await req('editor');assert.equal(memberState.spaces.length,1);assert.equal(memberState.spaces[0].id,spaceId);
const original=await req('owner');assert.equal(original.space.id,spaceId);assert.equal(original.documents.length,20);
for(let i=0;i<8;i++)await req('owner','create_space',{name:'مساحة '+i});
await req('owner','create_space',{name:'فوق الحد'},409);
console.log('PASS: multiple spaces, preserved original, member visibility, access isolation, creation limit.');

// Exercise the real analyze handler with a mocked provider; no API key or network.
const testSpace=second.space.id;
await req('owner','add_document',{spaceId:testSpace,title:'حالة تجريبية',body:'الموعد القديم ما زال في النص.',confirmSynthetic:true});
const withCorrection=await req('owner','add_correction',{spaceId:testSpace,title:'تصحيح اختباري',oldText:'الموعد القديم',newText:'الموعد الجديد',reference:'مرجع اصطناعي',reason:'اختبار الحفظ.',confirmSynthetic:true});
const testCorrection=withCorrection.corrections[0].id;
globalThis.__tadarokTestEnv.OPENAI_API_KEY='mock-key-only';
const previousFetch=globalThis.fetch,previousError=console.error;
let providerCalls=0;
globalThis.fetch=async(_url,options)=>{
 providerCalls++;
 const input=JSON.parse(JSON.parse(options.body).input);
 return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({assessments:Object.fromEntries(input.documents.map(d=>[d.document_key,{relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'asserted_now',replacement_stance:'not_assessed',version_context:'current',passage_index:0}]))})}]}]});
};
try{
 const result=await req('owner','analyze',{spaceId:testSpace,id:testCorrection});
 assert.equal(providerCalls,2);assert.equal(result.findings[0].verdict,'affected');
 const lastRun=result.corrections[0].last_run_id;
 assert.match(result.runs.find(r=>r.id===lastRun).engine,/gpt-4.1-2025-04-14 \/ claims-v11-deferred-evidence/);
 const details=JSON.parse(result.events.find(e=>e.action==='analysis_finished').details);
 assert.equal(details.checks.passes,2);assert.equal(details.checks.first.length,1);assert.equal(details.checks.second.length,1);
 const successfulFetch=globalThis.fetch;
 console.error=()=>{};
 for(const failure of ['incomplete','missing-witness','wrong-slot','invalid-index']){
  globalThis.fetch=async(...args)=>{
   if(failure==='incomplete')return Response.json({status:'incomplete'});
   const payload=await (await successfulFetch(...args)).json();
   const output=JSON.parse(payload.output[0].content[0].text);
   if(failure==='missing-witness')output.assessments.doc_1.passage_index=-1;
   if(failure==='invalid-index')output.assessments.doc_1.passage_index='0';
   if(failure==='wrong-slot')output.assessments={wrong:output.assessments.doc_1};
   payload.output[0].content[0].text=JSON.stringify(output);
   return Response.json(payload);
  };
  await req('owner','analyze',{spaceId:testSpace,id:testCorrection},502);
  const after=await req('owner','setup',{spaceId:testSpace});
  assert.equal(after.corrections[0].last_run_id,lastRun);assert.equal(after.findings.length,1);assert.ok(after.runs.some(r=>r.status==='failed'));
 }
}finally{globalThis.fetch=previousFetch;console.error=previousError;delete globalThis.__tadarokTestEnv.OPENAI_API_KEY;}
console.log('PASS: dual analysis handler, versioned engine, audit checks, and preservation of previous findings when verification fails.');
