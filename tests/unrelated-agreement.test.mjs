import test from 'node:test';
import assert from 'node:assert/strict';
import {groundClaimChecks,reconcileChecks} from '../lib/tadarok/claims.ts';
function compare(body,right={}){
 const docs=[{id:'d',body}];
 const base={document_id:'d',passage_index:0,relation:'different_claim',relation_basis:'explicit_other_subject',old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned',version_context:'current',shared_detail:null};
 const a=groundClaimChecks({assessments:[base]},docs);
 const b=groundClaimChecks({assessments:[{...base,relation_basis:'no_relevant_content',shared_detail:false,...right}]},docs);
 return reconcileChecks(a.assessments,b.assessments,docs,{first:a.checks,second:b.checks});
}
test('two grounded unrelated readings agree despite equivalent different reasons',()=>{
 const r=compare('تقام لقاءات التعريف مساء السبت.');assert.equal(r.assessments[0].verdict,'unaffected');assert.deepEqual(r.disagreements,[]);
});
test('mixed unrelated reasons still require clarification for deferred citations',()=>{
 const r=compare('سنضيف توثيق الحديث المقصود لاحقًا.');assert.equal(r.assessments[0].verdict,'uncertain');assert.deepEqual(r.evidenceGaps,['d']);
});
test('shared details and missing subject identity are never treated as unrelated agreement',()=>{
 for(const fields of [{shared_detail:true},{relation:'unclear',relation_basis:'missing_subject_details',shared_detail:true}])assert.equal(compare('الموعد مساء السبت.',fields).assessments[0].verdict,'uncertain');
});
