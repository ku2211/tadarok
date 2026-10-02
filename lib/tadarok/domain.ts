import type {Role,Doc,Finding} from './types';
export class UserError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export function canApprove(role:Role){return role==='owner'||role==='reviewer';}
export function assertVersion(expected:number,actual:number){if(expected!==actual)throw new UserError('تغيّر النص بعد فتحه. حدّث الصفحة وراجع النسخة الجديدة.',409);}
export function assertReviewSnapshot(input:Record<string,unknown>,finding:Finding){
 if(!Number.isInteger(input.documentVersion)||typeof input.expectedStatus!=='string'||!(input.expectedReviewedAt===null||typeof input.expectedReviewedAt==='string'))throw new UserError('حدّث الصفحة وافتح الملاحظة مجددًا قبل اتخاذ القرار.',409);
 if(input.documentVersion!==finding.document_version||input.expectedStatus!==finding.status||input.expectedReviewedAt!==finding.reviewed_at)throw new UserError('تغيّرت الملاحظة أو اتُّخذ قرار أحدث. حدّث الصفحة وراجعها مجددًا.',409);
}
export function cleanString(value:unknown,name:string,max=3000,min=1){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new UserError(`تحقق من ${name}. الحد المسموح ${min}–${max} حرف.`);return value.trim();}
export function safeUrl(value:unknown){if(!value)return '';const s=cleanString(value,'رابط المرجع',600);try{const u=new URL(s);if(!['https:','http:'].includes(u.protocol))throw new Error();return u.toString();}catch{throw new UserError('أدخل رابط مرجع يبدأ بـ https:// أو http://');}}
export type Assessment={document_id:string;verdict:'affected'|'unaffected'|'uncertain';quote:string;reason:string};
export function validateAssessments(value:unknown,docs:Pick<Doc,'id'|'body'>[]):Assessment[]{
 const data=value as {assessments?:unknown};if(!Array.isArray(data?.assessments))throw new UserError('لم يرجع التحليل نتيجة مكتملة. أعد المحاولة.',502);
 const byId=new Map(docs.map(d=>[d.id,d]));const seen=new Set<string>();const out:Assessment[]=[];
 for(const item of data.assessments){if(!item||typeof item!=='object')throw new UserError('صيغة نتيجة التحليل غير صالحة.',502);const a=item as Assessment;const d=byId.get(a.document_id);
 if(!d||seen.has(a.document_id)||!['affected','unaffected','uncertain'].includes(a.verdict))throw new UserError('تضمنت النتيجة مادة غير معروفة أو مكررة.',502);
 seen.add(a.document_id);if(typeof a.quote!=='string'||typeof a.reason!=='string'||!a.reason.trim()||a.reason.length>1800||a.quote.length>3000)throw new UserError('نتيجة التحليل ناقصة.',502);
 if(a.verdict!=='unaffected'&&(!a.quote.trim()||!d.body.includes(a.quote)))throw new UserError('تعذر مطابقة الدليل مع النص الأصلي. لم تُحفظ نتائج غير موثقة.',502);
 if(a.quote&&!d.body.includes(a.quote))throw new UserError('اقتباس التحليل غير موجود في المادة.',502);
 out.push({document_id:a.document_id,verdict:a.verdict,quote:a.quote,reason:a.reason});}
 if(seen.size!==docs.length)throw new UserError('لم تُحلّل كل المواد. أعد المحاولة.',502);return out;
}

// Keep evidence copied from the stored document; the model only chooses its index.
export function evidencePassages(body:string):string[]{
 return (body.match(/[^.!؟\n]+[.!؟\n]*/gu)||[]).map(x=>x.trim()).filter(Boolean);
}
export function groundAssessments(value:unknown,docs:Pick<Doc,'id'|'body'>[]):Assessment[]{
 const data=value as {assessments?:unknown};
 if(!Array.isArray(data?.assessments))throw new UserError('لم يرجع التحليل نتيجة مكتملة. أعد المحاولة.',502);
 const byId=new Map(docs.map(d=>[d.id,d]));
 const assessments=data.assessments.map(item=>{
  if(!item||typeof item!=='object')throw new UserError('صيغة نتيجة التحليل غير صالحة.',502);
  const a=item as {document_id:string;passage_index:number;verdict:string;reason:string};
  const d=byId.get(a.document_id);
  if(!d||!Number.isInteger(a.passage_index))throw new UserError('تعذر تحديد شاهد من المادة الأصلية.',502);
  const passages=evidencePassages(d.body);
  if(a.passage_index < -1||a.passage_index>=passages.length||(a.passage_index===-1&&a.verdict!=='unaffected'))throw new UserError('اختار التحليل شاهدًا غير متاح في المادة. أعد الفحص.',502);
  return {document_id:a.document_id,verdict:a.verdict,reason:a.reason,quote:a.passage_index===-1?'':passages[a.passage_index]};
 });
 return validateAssessments({assessments},docs);
}
