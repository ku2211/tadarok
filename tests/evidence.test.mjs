import test from 'node:test';
import assert from 'node:assert/strict';
import {groundAssessments,evidencePassages} from '../lib/tadarok/domain.ts';
const body='«خيرُكم مَن تعلّم القرآن وعلّمه» رواه مسلم.\nهذا مثال اصطناعي!';
const docs=[{id:'a',body},{id:'b',body:'إعلان آخر.'}];
const item={document_id:'a',verdict:'affected',passage_index:0,reason:'ما زال ينسب الحديث إلى المرجع السابق.'};
const other={document_id:'b',verdict:'unaffected',passage_index:-1,reason:'لا يتصل بالتصحيح.'};
test('selected evidence preserves Arabic marks and punctuation from storage',()=>{
 const out=groundAssessments({assessments:[item,other]},docs);
 assert.equal(out[0].quote,'«خيرُكم مَن تعلّم القرآن وعلّمه» رواه مسلم.');
 assert.ok(body.includes(out[0].quote));assert.equal(out[1].quote,'');
});
test('rejects fabricated indices, missing evidence, and cross-document indices',()=>{
 for(const passage_index of [-2,-1,2,100,0.5,'0']) assert.throws(()=>groundAssessments({assessments:[{...item,passage_index},other]},docs),{status:502});
 assert.throws(()=>groundAssessments({assessments:[item,{...other,passage_index:1}]},docs),{status:502});
});
test('still rejects missing and duplicated document assessments',()=>{
 for(const assessments of [[item],[item,item]])assert.throws(()=>groundAssessments({assessments},docs),{status:502});
});
test('handles a paragraph without punctuation and preserves internal spacing',()=>{
 assert.deepEqual(evidencePassages('نص  عربي بلا نقطة'),['نص  عربي بلا نقطة']);
});
