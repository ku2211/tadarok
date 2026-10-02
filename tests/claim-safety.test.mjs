import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createClaimContract} from '../lib/tadarok/contract.ts';
import {groundClaimChecks,reconcileChecks} from '../lib/tadarok/claims.ts';
const require=createRequire(import.meta.url),Ajv=createRequire(require.resolve('eslint'))('ajv');
const docs=[{id:'d',title:'مادة اصطناعية',body:'الادعاء السابق لا يزال قائمًا. عبارة سياق إضافية.'}];
const base={passage_index:0,relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'asserted_now',replacement_stance:'not_assessed',version_context:'current'};

test('an asserted old claim cannot carry an unnecessary claim that its correction was rejected',()=>{
 const c=createClaimContract(docs),validate=new Ajv().compile(c.schema);
 const invalid={assessments:{doc_1:{...base,replacement_stance:'rejected'}}};
 assert.equal(validate(invalid),false);assert.throws(()=>c.ground(invalid),{status:502});
 const valid={assessments:{doc_1:{...base,replacement_stance:'not_assessed'}}};
 assert.equal(validate(valid),true);assert.equal(c.ground(valid).assessments[0].verdict,'affected');
});

test('identity inferred only through a paraphrased subject always requires human verification',()=>{
 const r=groundClaimChecks({assessments:[{...base,document_id:'d',relation_basis:'paraphrased_same_subject'}]},docs);
 assert.equal(r.assessments[0].verdict,'uncertain');
 assert.match(r.assessments[0].reason,/هوية الموضوع/);
});

test('equal verdicts cannot conceal conflicting descriptions of the replacement',()=>{
 const first=groundClaimChecks({assessments:[{...base,document_id:'d',old_claim_stance:'not_asserted_now',replacement_stance:'applied'}]},docs);
 const second=groundClaimChecks({assessments:[{...base,document_id:'d',old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned'}]},docs);
 assert.equal(first.assessments[0].verdict,second.assessments[0].verdict);
 const r=reconcileChecks(first.assessments,second.assessments,docs,{first:first.checks,second:second.checks});
 assert.equal(r.assessments[0].verdict,'uncertain');assert.deepEqual(r.disagreements,['d']);
});
