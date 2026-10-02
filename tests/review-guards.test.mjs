import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

const sql=new DatabaseSync(':memory:');
for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
let afterRead=null;
class Statement {
 constructor(text,values=[]){this.text=text;this.values=values;}
 bind(...values){return new Statement(this.text,values);}
 async first(){const row=sql.prepare(this.text).get(...this.values)||null;afterRead?.(this.text,row);return row;}
 async all(){return {results:sql.prepare(this.text).all(...this.values)};}
 async run(){return {meta:{changes:sql.prepare(this.text).run(...this.values).changes},success:true};}
}
globalThis.__tadarokTestEnv={OPENAI_API_KEY:'mock-key-only',DB:{prepare:text=>new Statement(text),batch:async statements=>{sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
globalThis.__tadarokTestIdentity={userId:'guard-owner',email:'owner@example.test',displayName:'مراجع اختباري'};
const {POST}=await import('../app/api/tadarok/route.ts');
async function request(action,payload={}){
 const response=await POST(new Request('https://test.local/api/tadarok',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://test.local'},body:JSON.stringify({action,...payload})}));
 return {status:response.status,data:await response.json()};
}
const snapshot=f=>({documentVersion:f.document_version,expectedStatus:f.status,expectedReviewedAt:f.reviewed_at});
async function workspace(){
 const created=await request('create_space',{name:'مساحة اختبار تزامن'});assert.equal(created.status,200);
 const spaceId=created.data.space.id;
 const example=await request('example',{spaceId});assert.equal(example.status,200);
 const finding=example.data.findings.find(f=>f.verdict==='unaffected');
 return {spaceId,state:example.data,finding};
}

test('a review from an old open dialog cannot overwrite a newer human decision',async()=>{
 const {spaceId,finding}=await workspace();
 const first=await request('review',{spaceId,id:finding.id,decision:'refer',note:'يلزم مراجعة مختص.',...snapshot(finding)});assert.equal(first.status,200);
 const stale=await request('review',{spaceId,id:finding.id,decision:'approve',note:'قرار من نافذة قديمة.',...snapshot(finding)});
 assert.equal(stale.status,409);
 assert.equal(sql.prepare('SELECT status FROM findings WHERE id=?').get(finding.id).status,'referred');
});

test('a run replaced between reading and saving cannot receive a review decision',async()=>{
 const {spaceId,finding}=await workspace();
 afterRead=(query)=>{if(query==='SELECT * FROM documents WHERE id=? AND space_id=?'){
  afterRead=null;sql.prepare('UPDATE corrections SET last_run_id=NULL WHERE id=?').run(finding.correction_id);
 }};
 try{
  const result=await request('review',{spaceId,id:finding.id,decision:'approve',note:'مراجعة متزامنة مع فحص جديد.',...snapshot(finding)});
  assert.equal(result.status,409);
  assert.equal(sql.prepare('SELECT status FROM findings WHERE id=?').get(finding.id).status,'pending');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM events WHERE entity_id=? AND action='review_approve'").get(finding.id).n,0);
 }finally{afterRead=null;}
});

test('a library expanded while AI runs is not marked completely analyzed',async()=>{
 const {spaceId,state}=await workspace();
 const correction=state.corrections[0],previousRun=correction.last_run_id;
 const previousFetch=globalThis.fetch,previousError=console.error;
 let inserted=false;
 globalThis.fetch=async(_url,options)=>{
  const input=JSON.parse(JSON.parse(options.body).input);
  if(!inserted){inserted=true;const at=new Date().toISOString();sql.prepare('INSERT INTO documents(id,space_id,title,body,kind,version,mutation_id,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,1,?,0,?,?)').run(crypto.randomUUID(),spaceId,'إضافة أثناء الفحص','نص أضافه محرر آخر أثناء الفحص.','مسودة',crypto.randomUUID(),at,at);}
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({assessments:Object.fromEntries(input.documents.map(d=>[d.document_key,{passage_index:0,relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'asserted_now',replacement_stance:JSON.parse(options.body).instructions.includes('not_assessed')?'not_assessed':'not_mentioned',version_context:'current'}]))})}]}]});
 };
 console.error=()=>{};
 try{
  const result=await request('analyze',{spaceId,id:correction.id});assert.equal(result.status,409);
  assert.equal(sql.prepare('SELECT last_run_id FROM corrections WHERE id=?').get(correction.id).last_run_id,previousRun);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM runs WHERE space_id=? AND status='stale'").get(spaceId).n,1);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM events WHERE space_id=? AND action='analysis_finished'").get(spaceId).n,0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM events WHERE space_id=? AND action='analysis_invalidated'").get(spaceId).n,1);
 }finally{globalThis.fetch=previousFetch;console.error=previousError;}
});

test('the correction limit is enforced atomically without phantom audit events',async()=>{
 const {spaceId,state}=await workspace(),template=state.corrections[0];
 const add=()=>sql.prepare('INSERT INTO corrections(id,space_id,title,old_text,new_text,reference,reference_url,reason,is_demo,created_at) VALUES(?,?,?,?,?,?,?,?,0,?)').run(crypto.randomUUID(),spaceId,'تصحيح اصطناعي',template.old_text,template.new_text,template.reference,'',template.reason,new Date().toISOString());
 for(let i=0;i<38;i++)add();
 afterRead=query=>{if(query==='SELECT COUNT(*) n FROM corrections WHERE space_id=?'){afterRead=null;add();}};
 try{
  const result=await request('add_correction',{spaceId,title:'إضافة متزامنة',oldText:'النص السابق',newText:'النص المصحح',reference:'مرجع اصطناعي',reason:'اختبار حد السعة.',confirmSynthetic:true});
  assert.equal(result.status,409);assert.equal(sql.prepare('SELECT COUNT(*) n FROM corrections WHERE space_id=?').get(spaceId).n,40);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM events WHERE space_id=? AND action='correction_added'").get(spaceId).n,0);
 }finally{afterRead=null;}
});

test('adding the demo cannot overflow capacity when another editor adds documents',async()=>{
 const created=await request('create_space',{name:'اختبار سعة المثال'}),spaceId=created.data.space.id;
 const add=()=>{const at=new Date().toISOString();sql.prepare('INSERT INTO documents(id,space_id,title,body,kind,version,mutation_id,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,1,?,0,?,?)').run(crypto.randomUUID(),spaceId,'مادة اصطناعية','محتوى اصطناعي لاختبار السعة.','مسودة',crypto.randomUUID(),at,at);};
 for(let i=0;i<14;i++)add();
 afterRead=query=>{if(query==='SELECT COUNT(*) n FROM documents WHERE space_id=?'){afterRead=null;for(let i=0;i<5;i++)add();}};
 try{
  const result=await request('example',{spaceId});assert.equal(result.status,409);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM documents WHERE space_id=?').get(spaceId).n,19);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM corrections WHERE space_id=?').get(spaceId).n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM runs WHERE space_id=?').get(spaceId).n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM events WHERE space_id=?').get(spaceId).n,0);
 }finally{afterRead=null;}
});

test('an edit tied to a replaced finding is rejected atomically',async()=>{
 const {spaceId,state,finding}=await workspace();
 const doc=state.documents.find(d=>d.id===finding.document_id);
 afterRead=query=>{if(query.startsWith('SELECT f.* FROM findings f JOIN corrections c')&&query.includes('f.document_id=?')){afterRead=null;sql.prepare('UPDATE corrections SET last_run_id=NULL WHERE id=?').run(finding.correction_id);}};
 try{
  const result=await request('edit_document',{spaceId,id:doc.id,version:doc.version,title:doc.title,body:doc.body+' نص مضاف.',findingId:finding.id,note:'تصحيح من نافذة قديمة.',confirmSynthetic:true,...snapshot(finding)});
  assert.equal(result.status,409);
  assert.equal(sql.prepare('SELECT version FROM documents WHERE id=?').get(doc.id).version,doc.version);
  assert.equal(sql.prepare('SELECT status FROM findings WHERE id=?').get(finding.id).status,'pending');
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM events WHERE entity_id=? AND action='document_edited'").get(doc.id).n,0);
 }finally{afterRead=null;}
});
