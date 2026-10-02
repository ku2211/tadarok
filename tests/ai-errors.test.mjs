import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeImpact} from '../lib/tadarok/ai.ts';
const correction={old_text:'نص قديم',new_text:'نص مصحح',reason:'تصحيح تجريبي',reference:'مرجع تجريبي'};
for (const [code,type,status,expected] of [
 ['credit_balance_exhausted','insufficient_quota',429,'رصيد واجهة API'],
 ['insufficient_quota','insufficient_quota',429,'رصيد واجهة API'],
 ['rate_limit_exceeded','rate_limit_error',429,'حد الطلبات المؤقت'],
 ['invalid_api_key','invalid_request_error',401,'مفتاح API'],
 ['model_not_found','invalid_request_error',404,'صلاحية استخدام النموذج']
]) test(`upstream ${code} has an actionable, redacted message`,async()=>{
 const previousFetch=globalThis.fetch, previousError=console.error; const logged=[];
 globalThis.fetch=async()=>Response.json({error:{code,type,message:'sensitive upstream body'}},{status});
 console.error=(...args)=>logged.push(args);
 try {await assert.rejects(analyzeImpact('test-key-not-a-secret',undefined,correction,[]),e=>e.status===503&&e.message.includes(expected)&&!e.message.includes('sensitive'));
 assert.equal(JSON.stringify(logged).includes('sensitive'),false);
 assert.equal(JSON.stringify(logged).includes('test-key-not-a-secret'),false);
 }finally{globalThis.fetch=previousFetch;console.error=previousError;}
});
test('Responses contract maps a selected passage to the stored quotation',async()=>{
 const previousFetch=globalThis.fetch;
 const docs=[{id:'doc-1',title:'اختبار',body:'هذه مقدمة. النصُ  القديم هنا.'}];
 globalThis.fetch=async(_url,options)=>{
  const request=JSON.parse(options.body),input=JSON.parse(request.input);
  assert.equal(input.documents[0].passages[1].text,'النصُ  القديم هنا.');
  assert.equal(input.documents[0].document_key,'doc_1');
  assert.equal(input.documents[0].document_id,undefined);
  assert.ok(request.text.format.schema.properties.assessments.properties.doc_1.anyOf.every(s=>s.required.includes('passage_index')));
  assert.equal(request.model,'gpt-4.1-2025-04-14');
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({assessments:{doc_1:{passage_index:1,relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'asserted_now',replacement_stance:'not_assessed',version_context:'current'}}})}]}]});
 };
 try {const result=await analyzeImpact('test-key-not-a-secret',undefined,correction,docs);assert.equal(result.assessments[0].document_id,'doc-1');assert.equal(result.assessments[0].quote,'النصُ  القديم هنا.');assert.equal(result.checks.passes,2);assert.match(result.engine,/claims-v10-scoped-fields/);}finally{globalThis.fetch=previousFetch;}
});

test('dual reading merges disagreements conservatively and counts both requests',async()=>{
 const previousFetch=globalThis.fetch;let calls=0;
 const docs=[{id:'d',title:'سياق تجريبي',body:'اليوم التالي للأربعاء. موعد قائم.'}];
 globalThis.fetch=async(_url,options)=>{
  const input=JSON.parse(JSON.parse(options.body).input);assert.equal(input.documents[0].weekday_hints[0].weekday,'الخميس');
  const n=calls++;
  const a={relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:n?'not_asserted_now':'asserted_now',replacement_stance:n?'applied':'not_assessed',version_context:'current',passage_index:1};
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({assessments:{doc_1:a}})}]}]});
 };
 try{const r=await analyzeImpact('test-key-not-a-secret',undefined,correction,docs);assert.equal(calls,2);assert.equal(r.assessments[0].verdict,'uncertain');assert.deepEqual(r.checks.disagreements,['d']);assert.equal(r.usage.input_tokens,20);assert.equal(r.usage.output_tokens,10);}finally{globalThis.fetch=previousFetch;}
});

test('one incomplete reading prevents a partial result from being accepted',async()=>{
 const previousFetch=globalThis.fetch;let calls=0;
 const docs=[{id:'d',title:'تجريبي',body:'عبارة من المصدر.'}];
 globalThis.fetch=async()=>{
  if(calls++===1)return Response.json({status:'incomplete'});
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({assessments:{doc_1:{relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'asserted_now',replacement_stance:'not_assessed',version_context:'current',passage_index:0}}})}]}]});
 };
 try{await assert.rejects(analyzeImpact('test-key-not-a-secret',undefined,correction,docs),e=>e.status===502&&e.message.includes('لم يكتمل'));assert.equal(calls,2);}finally{globalThis.fetch=previousFetch;}
});
