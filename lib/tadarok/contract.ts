import {UserError, evidencePassages} from './domain';
import {claimOptions, groundClaimChecks, weekdayHints} from './claims';
import type {Doc} from './types';

const required = ['passage_index', ...Object.keys(claimOptions), 'shared_detail'];

function claimSchema(lastPassage: number) {
 // Only bounded annotations and a server-owned source passage index are generated.
 const properties = {
  passage_index: {type: 'integer', minimum: 0, maximum: lastPassage},
  ...Object.fromEntries(Object.entries(claimOptions).map(([key, values]) => [key, {type: 'string', enum: values}])),
  shared_detail: {type: 'boolean'},
 };
 const related = (relation: 'same_claim'|'unclear', asserted: boolean) => ({type: 'object', additionalProperties: false, required, properties: {
  ...properties,
  relation: {type:'string',enum:[relation]},
  relation_basis: {type:'string',enum:relation==='same_claim'
   ? ['explicit_same_subject','paraphrased_same_subject']
   : ['missing_subject_details','paraphrased_same_subject']},
  ...(relation==='same_claim'?{shared_detail:{type:'boolean',enum:[true]}}:{}),
  old_claim_stance: {type:'string',enum:asserted?['asserted_now']:claimOptions.old_claim_stance.filter(x=>x!=='asserted_now')},
  replacement_stance: {type:'string',enum:asserted?['not_assessed']:claimOptions.replacement_stance.filter(x=>x!=='not_assessed')},
 }});
 const unrelated = (basis: 'explicit_other_subject'|'no_relevant_content') => ({type: 'object', additionalProperties: false, required, properties: {
  ...properties,
  relation: {type:'string',enum:['different_claim']},
  relation_basis: {type:'string',enum:[basis]},
  shared_detail: basis==='no_relevant_content'?{type:'boolean',enum:[false]}:{type:'null'},
  old_claim_stance: {type:'string',enum:['not_asserted_now']},
  replacement_stance: {type:'string',enum:['not_mentioned']},
 }});
 return {anyOf: [
  related('same_claim',true), related('same_claim',false),
  related('unclear',true), related('unclear',false),
  unrelated('explicit_other_subject'), unrelated('no_relevant_content'),
  {type: 'object', additionalProperties: false, required, properties: {
   ...properties,
   passage_index: {type: 'integer', enum: [-1]},
   relation: {type: 'string', enum: ['different_claim']},
   relation_basis: {type: 'string', enum: ['no_relevant_content']},
   shared_detail: {type: 'boolean', enum: [false]},
   old_claim_stance: {type: 'string', enum: ['not_asserted_now']},
   replacement_stance: {type: 'string', enum: ['not_mentioned']},
  }},
 ]};
}

// The server owns document identity. The model fills required named slots and
// cannot generate, truncate, omit, duplicate or substitute database IDs.
export function createClaimContract(documents: Pick<Doc, 'id'|'body'|'title'>[]) {
 if (new Set(documents.map(d => d.id)).size !== documents.length) throw new UserError('تكررت إحدى المواد في طلب التحليل.', 400);
 const slots = documents.map((doc, index) => {
  const passages = evidencePassages(doc.body);
  if (!passages.length) throw new UserError('إحدى المواد لا تحتوي نصًا يمكن تحليله. راجع محتوى المكتبة.', 400);
  return {key: `doc_${index + 1}`, doc, passages};
 });
 const keys = slots.map(s => s.key);
 const schema = {
  type: 'object', additionalProperties: false, required: ['assessments'],
  properties: {assessments: {
   type: 'object', additionalProperties: false, required: keys,
   properties: Object.fromEntries(slots.map(s => [s.key, claimSchema(s.passages.length - 1)])),
  }},
 };
 return {
  schema,
  documents: slots.map(({key, doc, passages}) => ({document_key: key, title: doc.title, body: doc.body,
   weekday_hints: weekdayHints(doc.body), passages: passages.map((text, index) => ({index, text}))})),
  ground(value: unknown) {
   const data = value as {assessments?: unknown};
   const items = data?.assessments;
   if (!items || typeof items !== 'object' || Array.isArray(items)) throw new UserError('لم ترجع نتائج المواد في الخانات المطلوبة.', 502);
   const byKey = items as Record<string, unknown>;
   if (Object.keys(byKey).length !== keys.length || keys.some(key => !Object.hasOwn(byKey, key))) throw new UserError('لم تكتمل نتائج جميع المواد. لم تُحفظ نتائج جزئية.', 502);
   const assessments = slots.map(({key, doc}) => {
    const item = byKey[key];
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new UserError('صيغة نتيجة المادة غير صالحة.', 502);
    const fields = item as Record<string, unknown>;
    if (Object.keys(fields).length !== required.length || required.some(field => !Object.hasOwn(fields, field))) throw new UserError('حقول نتيجة المادة غير مكتملة أو غير معروفة.', 502);
    return {...fields, document_id: doc.id};
   });
   return groundClaimChecks({assessments}, documents);
  },
 };
}
