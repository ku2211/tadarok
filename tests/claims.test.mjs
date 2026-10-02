import test from 'node:test';
import assert from 'node:assert/strict';
import {groundClaimChecks, reconcileChecks, weekdayHints} from '../lib/tadarok/claims.ts';
const docs=[{id:'d',body:'نسخة قديمة. النص المعتمد الآن.'}];
const base={document_id:'d',relation:'same_claim',relation_basis:'explicit_same_subject',shared_detail:true,old_claim_stance:'asserted_now',replacement_stance:'not_assessed',version_context:'current',passage_index:1};
const assess=(patch={})=>groundClaimChecks({assessments:[{...base,...(patch.old_claim_stance&&patch.old_claim_stance!=='asserted_now'?{replacement_stance:'not_mentioned'}:{}),...patch}]},docs);

test('an asserted old claim is affected without a redundant replacement annotation',()=>{
 assert.equal(assess().assessments[0].verdict,'affected');
 for(const replacement_stance of ['rejected','applied','not_mentioned'])assert.throws(()=>assess({replacement_stance}),{status:502});
});
test('executed corrections and denied historical claims remain unaffected',()=>{
 for(const old_claim_stance of ['not_asserted_now'])assert.equal(assess({old_claim_stance,replacement_stance:'applied'}).assessments[0].verdict,'unaffected');
 assert.equal(assess({old_claim_stance:'not_asserted_now'}).assessments[0].verdict,'unaffected');
});
test('unknown version, unanswered question and missing implementation evidence abstain',()=>{
 for(const patch of [{version_context:'unknown'},{old_claim_stance:'unclear'},{relation:'unclear'},{old_claim_stance:'not_asserted_now',replacement_stance:'proposed'},{old_claim_stance:'not_asserted_now',replacement_stance:'rejected'}])assert.equal(assess(patch).assessments[0].verdict,'uncertain');
});
test('different subject is distinct from internally conflicting claim fields',()=>{
 const unrelated=assess({relation:'different_claim',relation_basis:'no_relevant_content',shared_detail:false,old_claim_stance:'not_asserted_now',passage_index:-1});
 assert.equal(unrelated.assessments[0].verdict,'unaffected');assert.equal(unrelated.assessments[0].quote,'');
 for(const patch of [{relation:'different_claim'},{old_claim_stance:'not_asserted_now',replacement_stance:'rejected'}]){
  const a=assess(patch);assert.equal(a.assessments[0].verdict,'uncertain');assert.equal(a.checks[0].conflict,true);
 }
});
test('malformed contexts and ungrounded claims are rejected, not guessed',()=>{
 for(const patch of [{relation:'toString'},{replacement_stance:'invented'},{old_claim_stance:null},{version_context:'tomorrow'},{passage_index:-1},{passage_index:5},{reason:''}])assert.throws(()=>assess(patch),{status:502});
 for(const assessments of [[],[base,base],[{...base,document_id:'foreign'}]])assert.throws(()=>groundClaimChecks({assessments},docs),{status:502});
});
test('two readings must agree on a decisive verdict; conflicts retain exact evidence',()=>{
 const affected=assess().assessments;
 const clear=assess({old_claim_stance:'not_asserted_now',replacement_stance:'applied',passage_index:0}).assessments;
 const uncertain=assess({version_context:'unknown'}).assessments;
 for(const pair of [[affected,clear],[clear,affected],[affected,uncertain],[uncertain,clear]]){
  const r=reconcileChecks(...pair,docs);assert.equal(r.assessments[0].verdict,'uncertain');assert.deepEqual(r.disagreements,['d']);assert.ok(docs[0].body.includes(r.assessments[0].quote));
 }
 assert.equal(reconcileChecks(affected,affected,docs).assessments[0].verdict,'affected');
 assert.equal(reconcileChecks(clear,clear,docs).assessments[0].verdict,'unaffected');
 assert.throws(()=>reconcileChecks(affected,[],docs),{status:502});
});
test('explicit weekday equivalents wrap correctly without inventing calendar dates',()=>{
 const days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
 for(let i=0;i<days.length;i++){
  const next='اليوم التالي ل'+days[i].slice(1);const previous='اليوم السابق ل'+days[i].slice(1);
  assert.deepEqual(weekdayHints(next),[{source:next,weekday:days[(i+1)%7]}]);
  assert.deepEqual(weekdayHints(previous),[{source:previous,weekday:days[(i+6)%7]}]);
 }
 assert.deepEqual(weekdayHints('غدًا عند السادسة. الأسبوع المقبل.'),[]);
 assert.deepEqual(weekdayHints('اليوم التالي للأربعاءXYZ'),[]);
});
test('normalization hints preserve source spelling and never determine a verdict',()=>{
 const source='اليوم التَّالي للأَربعاء';
 const hints=weekdayHints(source);assert.equal(hints.length,1);assert.equal(hints[0].source,source);assert.equal(hints[0].weekday,'الخميس');
 assert.equal(weekdayHints('اليوم الذي يسبق يوم الأحد')[0].weekday,'السبت');
 const body='لا تستخدم الموعد القديم: اليوم التالي للأربعاء. اعتمد التصحيح.';
 assert.equal(weekdayHints(body)[0].weekday,'الخميس');assert.equal(body,'لا تستخدم الموعد القديم: اليوم التالي للأربعاء. اعتمد التصحيح.');
});

test('missing subject identity with overlapping details is uncertain, never cleared',()=>{
 for(const relation of ['same_claim','different_claim','unclear']){
  assert.equal(assess({relation,relation_basis:'missing_subject_details',old_claim_stance:'not_asserted_now'}).assessments[0].verdict,'uncertain');
 }
 assert.equal(assess({relation:'different_claim',relation_basis:'no_relevant_content',old_claim_stance:'not_asserted_now',shared_detail:true}).assessments[0].verdict,'uncertain');
});
test('explicitly distinct event remains unaffected even when its details coincide',()=>{
 const patch={relation:'different_claim',relation_basis:'explicit_other_subject',shared_detail:null,old_claim_stance:'not_asserted_now',passage_index:0};
 assert.equal(assess(patch).assessments[0].verdict,'unaffected');
 assert.throws(()=>assess({...patch,passage_index:-1}),{status:502});
 assert.throws(()=>assess({shared_detail:'yes'}),{status:502});
});
