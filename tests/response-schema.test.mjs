import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createClaimContract} from '../lib/tadarok/contract.ts';

// Reuse the independent JSON Schema validator in the pinned ESLint toolchain.
// No provider call, credentials, or test code is part of the deployed app.
const require=createRequire(import.meta.url);
const Ajv=createRequire(require.resolve('eslint'))('ajv');
const docs=[{id:'d',title:'مادة',body:'عبارة محتملة الصلة. السياق محفوظ للمراجع.'}];
const contract=createClaimContract(docs);
const validate=new Ajv({allErrors:true}).compile(contract.schema);
const base={relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'asserted_now',replacement_stance:'not_assessed',version_context:'current',passage_index:0};
const value=patch=>({assessments:{doc_1:{...base,...patch}}});

test('request schema prevents the observed missing-witness failure before generation',()=>{
 const cases=[
  {},
  {relation:'unclear',relation_basis:'missing_subject_details',old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned'},
  {relation:'different_claim',relation_basis:'explicit_other_subject',shared_detail:null,old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned'},
  {old_claim_stance:'not_asserted_now',replacement_stance:'applied'},
  {version_context:'unknown'},
 ];
 for(const patch of cases){
  const grounded=value(patch);
  assert.equal(validate(grounded),true,JSON.stringify(validate.errors));
  assert.equal(contract.ground(grounded).assessments[0].quote,'عبارة محتملة الصلة.');
  const omitted=value({...patch,passage_index:-1});
  assert.equal(validate(omitted),false,JSON.stringify(patch));
  assert.throws(()=>contract.ground(omitted),{status:502});
 }
});

test('only truly unrelated content can omit a witness, without contradictory stances',()=>{
 const unrelated={relation:'different_claim',relation_basis:'no_relevant_content',shared_detail:false,old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned',passage_index:-1};
 const clear=value(unrelated);
 assert.equal(validate(clear),true,JSON.stringify(validate.errors));
 assert.equal(contract.ground(clear).assessments[0].quote,'');
 for(const patch of [{relation:'unclear'},{relation_basis:'missing_subject_details'},{shared_detail:true},{old_claim_stance:'asserted_now'},{replacement_stance:'applied'},{replacement_stance:'rejected'}]){
  assert.equal(validate(value({...unrelated,...patch})),false,JSON.stringify(patch));
 }
});

test('schema and source grounding both reject unavailable or substituted evidence',()=>{
 for(const patch of [{passage_index:-2},{passage_index:0.5},{passage_index:'0'},{relation_basis:'invented'},{shared_detail:'false'},{passage_index:20},{document_id:'foreign'}]){
  const result=value(patch);
  assert.equal(validate(result),false);
  assert.throws(()=>contract.ground(result),{status:502});
 }
});

test('required document slots preserve identities and each document owns its passage range',()=>{
 const documents=[{id:'opaque-a',title:'عنوان متكرر',body:'الأولى. الثانية.'},{id:'opaque-b',title:'عنوان متكرر',body:'مادة أخرى كاملة.'}];
 const c=createClaimContract(documents),valid=new Ajv().compile(c.schema);
 // Reordered JSON keys and identical titles cannot reassign the database IDs.
 const data={assessments:{doc_2:{...base},doc_1:{...base,passage_index:1}}};
 assert.equal(valid(data),true);
 const results=c.ground(data).assessments;
 assert.deepEqual(results.map(a=>[a.document_id,a.quote]),[['opaque-a','الثانية.'],['opaque-b','مادة أخرى كاملة.']]);
 const crossDocument={assessments:{...data.assessments,doc_2:{...base,passage_index:1}}};
 assert.equal(valid(crossDocument),false);assert.throws(()=>c.ground(crossDocument),{status:502});
 for(const assessments of [{doc_1:base},{doc_1:base,doc_3:base},{doc_1:base,doc_2:base,extra:base},[base,base]]){
  assert.equal(valid({assessments}),false);assert.throws(()=>c.ground({assessments}),{status:502});
 }
 assert.equal(JSON.stringify(c.documents).includes('opaque-a'),false);
});

test('invalid source collections fail before a provider request',()=>{
 assert.throws(()=>createClaimContract([docs[0],docs[0]]),{status:400});
 assert.throws(()=>createClaimContract([{...docs[0],body:'!!!!!!'}]),{status:400});
});
