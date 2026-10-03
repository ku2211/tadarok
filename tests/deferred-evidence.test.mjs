import test from 'node:test';
import assert from 'node:assert/strict';
import {groundClaimChecks,reconcileChecks,deferredEvidencePassage} from '../lib/tadarok/claims.ts';
import {analysisPrecedesEdit} from '../lib/tadarok/presentation.ts';
const base={document_id:'d',passage_index:0,relation:'different_claim',relation_basis:'no_relevant_content',old_claim_stance:'not_asserted_now',replacement_stance:'not_mentioned',version_context:'current',shared_detail:false};
function assess(body,fields={}){const docs=[{id:'d',body}];const a=groundClaimChecks({assessments:[{...base,...fields}]},docs);return reconcileChecks(a.assessments,a.assessments,docs,{first:a.checks,second:a.checks});}
test('agreed absence of relevance cannot clear an explicit deferred citation',()=>{
 for(const body of ['سنضيف توثيق الحديث المقصود في النسخة النهائية.','لم نحدد مصدر الاقتباس بعد.','سيتم استكمال المرجع لاحقًا.','سَنُضِيفُ توثيق الحديث لاحقًا.']){
  const r=assess(body);assert.equal(r.assessments[0].verdict,'uncertain');assert.ok(body.includes(r.assessments[0].quote));assert.deepEqual(r.evidenceGaps,['d']);
 }
});
test('unrelated schedules and completed citations are not caught by the deferred evidence guard',()=>{
 for(const body of ['تقام لقاءات التعريف مساء السبت.','أضفنا توثيق الحديث في النسخة النهائية.','سنضيف موعد اللقاء لاحقًا.']){
  assert.equal(deferredEvidencePassage(body),null);assert.equal(assess(body).assessments[0].verdict,'unaffected');
 }
});
test('deferred evidence does not hide an asserted old claim or override explicit other-subject evidence',()=>{
 const body='سنضيف توثيق الاقتباس لاحقًا.';
 assert.equal(assess(body,{relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'asserted_now',replacement_stance:'not_assessed'}).assessments[0].verdict,'affected');
 assert.equal(assess(body,{relation_basis:'explicit_other_subject',shared_detail:null}).assessments[0].verdict,'unaffected');
});
test('linked edit remains historical after approval; a new analysis does not inherit its label',()=>{
 const doc={id:'d',version:2},f={id:'f',document_version:2,status:'approved'};
 const event={entity_id:'d',action:'document_edited',details:JSON.stringify({findingId:'f',fromVersion:1,toVersion:2})};
 assert.equal(analysisPrecedesEdit(f,doc,[event]),true);
 assert.equal(analysisPrecedesEdit({...f,id:'new'},doc,[event]),false);
 assert.equal(analysisPrecedesEdit(f,doc,[{...event,details:'bad json'}]),false);
 assert.equal(analysisPrecedesEdit({...f,document_version:1},doc,[]),true);
});
