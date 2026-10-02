import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createClaimContract} from '../lib/tadarok/contract.ts';
import {groundClaimChecks} from '../lib/tadarok/claims.ts';
const require=createRequire(import.meta.url),Ajv=createRequire(require.resolve('eslint'))('ajv');
const docs=[{id:'d',title:'مادة اصطناعية',body:'الورشة التقنية الخميس الساعة السادسة. هذه ورشة منفصلة عن اللقاء التعريفي.'}];
const base={passage_index:1,relation:'different_claim',relation_basis:'explicit_other_subject',shared_detail:null,old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned',version_context:'current'};

test('provider output cannot introduce a prose explanation or an invented weekday',()=>{
 const c=createClaimContract(docs),validate=new Ajv().compile(c.schema);
 const invented={assessments:{doc_1:{...base,reason:'موعد الورشة الثلاثاء.'}}};
 assert.equal(validate(invented),false);assert.throws(()=>c.ground(invented),{status:502});
 const valid={assessments:{doc_1:base}};
 assert.equal(validate(valid),true);
 const result=c.ground(valid);
 assert.equal(result.assessments[0].verdict,'unaffected');
 assert.equal(result.assessments[0].quote,'هذه ورشة منفصلة عن اللقاء التعريفي.');
 assert.match(result.assessments[0].reason,/موضوع آخر/);
 assert.doesNotMatch(JSON.stringify(result),/الثلاثاء/);
});

test('schema disallows different-topic fields alongside an applied replacement',()=>{
 const c=createClaimContract(docs),validate=new Ajv().compile(c.schema);
 for(const old_claim_stance of ['not_asserted_now']){
  const invalid={assessments:{doc_1:{...base,old_claim_stance,replacement_stance:'applied'}}};
  assert.equal(validate(invalid),false);
  const valid={assessments:{doc_1:{...invalid.assessments.doc_1,relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true}}};
  assert.equal(validate(valid),true);
  assert.equal(c.ground(valid).assessments[0].verdict,'unaffected');
 }
});

test('server explanation describes only the bounded decision and preserves exact source evidence',()=>{
 const common={...base,document_id:'d',relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true};
 const cases=[
  [{old_claim_stance:'asserted_now',replacement_stance:'not_assessed'},'affected',/الادعاء السابق/],
  [{old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned'},'unaffected',/تبنّيًا حاليًا/],
  [{old_claim_stance:'not_asserted_now',replacement_stance:'applied'},'unaffected',/التصحيح/],
  [{old_claim_stance:'not_asserted_now',replacement_stance:'proposed'},'uncertain',/غير محسومة/],
  [{old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned',version_context:'unknown'},'uncertain',/النسخة الحالية/],
 ];
 for(const [patch,verdict,reason] of cases){
  const result=groundClaimChecks({assessments:[{...common,...patch}]},docs);
  assert.equal(result.assessments[0].verdict,verdict);assert.match(result.assessments[0].reason,reason);
  assert.equal(result.checks[0].reason,result.assessments[0].reason);
  assert.ok(docs[0].body.includes(result.assessments[0].quote));
 }
});

test('the contract does not extract an unnecessary distinction between absence and historical mention',()=>{
 const c=createClaimContract(docs),validate=new Ajv().compile(c.schema);
 for(const old_claim_stance of ['absent','denied_or_historical']){
  const input={assessments:{doc_1:{...base,old_claim_stance}}};
  assert.equal(validate(input),false);assert.throws(()=>c.ground(input),{status:502});
 }
 const result=c.ground({assessments:{doc_1:{...base,relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,replacement_stance:'applied'}}});
 assert.equal(result.assessments[0].verdict,'unaffected');
 assert.doesNotMatch(result.assessments[0].reason,/التاريخي|ورد للنفي|عدم ورود/);
});

test('a proven different subject does not extract irrelevant shared-detail annotations',()=>{
 const c=createClaimContract(docs),validate=new Ajv().compile(c.schema);
 for(const shared_detail of [true,false]){
  const invalid={assessments:{doc_1:{...base,shared_detail}}};
  assert.equal(validate(invalid),false);assert.throws(()=>c.ground(invalid),{status:502});
 }
 const valid={assessments:{doc_1:{...base,shared_detail:null}}};
 assert.equal(validate(valid),true);assert.equal(c.ground(valid).assessments[0].verdict,'unaffected');
});
