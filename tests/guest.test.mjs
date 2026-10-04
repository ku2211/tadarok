import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
class Statement{constructor(text,values=[]){this.text=text;this.values=values;}bind(...v){return new Statement(this.text,v);}async first(){return sql.prepare(this.text).get(...this.values)||null;}async all(){return {results:sql.prepare(this.text).all(...this.values)};}async run(){return {meta:{changes:sql.prepare(this.text).run(...this.values).changes}};}}
globalThis.__tadarokTestEnv={OPENAI_API_KEY:'mock-only',DB:{prepare:t=>new Statement(t),batch:async ss=>{sql.exec('BEGIN');try{const results=[];for(const s of ss)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
globalThis.__tadarokTestIdentity=null;
const {GET,POST}=await import('../app/api/try/route.ts');const {startGuest}=await import('../lib/tadarok/guest.ts');const {exportForReview}=await import('../lib/tadarok/export.ts');
async function session(){const r=await startGuest(new Request('https://test.local/api/try/session',{method:'POST',headers:{origin:'https://test.local'}}));assert.equal(r.status,200);const c=r.headers.get('set-cookie');assert.match(c,/HttpOnly; Secure; SameSite=Strict/);return c.split(';')[0];}
async function req(cookie,action,payload={},status=200,path='/api/try'){
 const r=await(action?POST:GET)(new Request('https://test.local'+path,{method:action?'POST':'GET',headers:{cookie,'Content-Type':'application/json',origin:'https://test.local'},...(action?{body:JSON.stringify({action,...payload})}:{})}));const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
const a=await session(),b=await session();let x=await req(a),y=await req(b);assert.notEqual(x.space.id,y.space.id);assert.equal(x.documents.length,5);assert.equal(x.findings.length,0);assert.match(x.corrections[0].reference,/البخاري.*5027/);assert.equal(x.corrections[0].reference_url,'https://dorar.net/hadith/sharh/13180');
await req('',null,{},401);await req(a,null,{},401,'/api/tadarok');await req(a,null,{},403,'/api/try?space='+y.space.id);
await req(a,'add_member',{spaceId:x.space.id,email:'someone@example.test',role:'reviewer'},403);await req(a,'create_space',{name:'extra'},403);
const cross=await startGuest(new Request('https://test.local/api/try/session',{method:'POST',headers:{origin:'https://evil.test'}}));assert.equal(cross.status,403);
globalThis.fetch=async(_u,options)=>{const input=JSON.parse(JSON.parse(options.body).input);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({assessments:Object.fromEntries(input.documents.map(d=>[d.document_key,{relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'not_asserted_now',replacement_stance:'applied',version_context:'current',passage_index:0}]))})}]}]});};
// Regression: a rejected concurrent request must spend no guest budget.
const busyId='regression-busy-run';
sql.prepare("INSERT INTO runs(id,space_id,correction_id,engine,status,actor,doc_count,created_at) VALUES(?,?,?,'test','running','test',5,?)").run(busyId,x.space.id,x.corrections[0].id,new Date().toISOString());
const budgetBefore=sql.prepare('SELECT COUNT(*) n FROM guest_analysis_budget').get().n;
await req(a,'analyze',{id:x.corrections[0].id},429);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM guest_analysis_budget').get().n,budgetBefore,'busy requests must not consume quota');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM runs WHERE space_id=?').get(x.space.id).n,1,'busy requests must not create runs');
sql.prepare('DELETE FROM runs WHERE id=?').run(busyId);
x=await req(a,'analyze',{id:x.corrections[0].id});assert.equal(x.findings.length,5);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM guest_analysis_budget WHERE id=?').get(x.corrections[0].last_run_id).n,1,'accepted run and budget share an atomic reservation');
let f=x.findings[0];const snap=f=>({documentVersion:f.document_version,expectedStatus:f.status,expectedReviewedAt:f.reviewed_at});
x=await req(a,'review',{id:f.id,decision:'approve',note:'اختبار حفظ القرار',...snap(f)});assert.equal(x.findings[0].status,'approved');
x=await req(a);assert.equal(x.findings[0].status,'approved');f=x.findings[0];let doc=x.documents.find(d=>d.id===f.document_id);
x=await req(a,'edit_document',{id:doc.id,version:doc.version,title:doc.title,body:doc.body+' نص اصطناعي إضافي.',findingId:f.id,note:'اختبار تعديل النسخة',confirmSynthetic:true,...snap(f)});assert.equal(x.findings[0].status,'corrected');assert.equal(x.findings[0].document_version,2);
f=x.findings[1];x=await req(a,'review',{id:f.id,decision:'refer',note:'اختبار إحالة للمختص',...snap(f)});assert.equal(x.findings[1].status,'referred');
assert.equal((await req(b)).findings.length,0);const exported=exportForReview(x);assert.equal(exported.corrections[0].reference,x.corrections[0].reference);assert.ok(exported.events.some(e=>e.action==='review_refer'));assert.ok(!JSON.stringify(exported).includes(a.split('=')[1]));
for(let i=0;i<19;i++)await req(a,'analyze',{id:x.corrections[0].id});
assert.equal(sql.prepare('SELECT COUNT(*) n FROM guest_analysis_budget WHERE space_id=?').get(x.space.id).n,20);
await req(a,'analyze',{id:x.corrections[0].id},429);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM guest_analysis_budget WHERE space_id=?').get(x.space.id).n,20);
x=await req(a);f=x.findings[0];
x=await req(a,'review',{id:f.id,decision:'refer',note:'المراجعة متاحة بعد بلوغ حد التحليل',...snap(f)});
assert.equal(x.findings[0].status,'referred');assert.ok(exportForReview(await req(a)).events.some(e=>JSON.parse(e.details).note==='المراجعة متاحة بعد بلوغ حد التحليل'));
// Fill the remaining shared budget with four other synthetic sessions.
const fillSpaces=[];
for(let s=0;s<4;s++){
 const extra=await req(await session());fillSpaces.push(extra.space.id);
 for(let i=0;i<20;i++)sql.prepare('INSERT INTO guest_analysis_budget(id,space_id,created_at) VALUES(?,?,?)').run(`shared-budget-${s}-${i}`,extra.space.id,new Date().toISOString());
}
await req(b,'analyze',{id:y.corrections[0].id},429);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM guest_analysis_budget WHERE space_id=?').get(y.space.id).n,0);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM runs WHERE space_id=?').get(y.space.id).n,0,'shared quota rejection must not leave a running lock');
assert.equal((await req(b)).documents.length,5);
for(const space of fillSpaces)sql.prepare('UPDATE guest_analysis_budget SET created_at=? WHERE space_id=?').run('2000-01-01T00:00:00.000Z',space);
await req(b,'analyze',{id:y.corrections[0].id});
sql.prepare('UPDATE guest_sessions SET expires_at=? WHERE space_id=?').run('2000-01-01',x.space.id);await req(a,null,{},401);
console.log('PASS guest API + SQLite: isolated anonymous sessions, cookie security, private-route denial, cross-space denial, CSRF, live analysis handler (mock provider), review/edit/referral/export, persistence, quota and expiration.');
