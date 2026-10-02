import {UserError, groundAssessments, validateAssessments} from './domain';
import type {Assessment} from './domain';
import type {Doc} from './types';

export const claimOptions = {
 relation: ['same_claim', 'different_claim', 'unclear'],
 relation_basis: ['explicit_same_subject', 'paraphrased_same_subject', 'explicit_other_subject', 'no_relevant_content', 'missing_subject_details'],
 old_claim_stance: ['asserted_now', 'not_asserted_now', 'unclear'],
 replacement_stance: ['applied', 'rejected', 'proposed', 'not_mentioned', 'unclear', 'not_assessed'],
 version_context: ['current', 'unknown'],
} as const;

type Claim = {
 document_id: string;
 relation: typeof claimOptions.relation[number];
 relation_basis: typeof claimOptions.relation_basis[number];
 shared_detail: boolean | null;
 old_claim_stance: typeof claimOptions.old_claim_stance[number];
 replacement_stance: typeof claimOptions.replacement_stance[number];
 version_context: typeof claimOptions.version_context[number];
 passage_index: number;
};
export type ClaimCheck = Claim & {verdict: Assessment['verdict']; conflict: boolean; reason: string};

// Only linguistic equivalents with an explicit weekday anchor. Never infer a date
// from today's date or rewrite the source used as evidence.
export function weekdayHints(body: string) {
 const offsets: number[] = [];
 let normalized = '';
 for (let i = 0; i < body.length; i++) {
  if (/[\u064B-\u065F\u0670\u0640]/u.test(body[i])) continue;
  normalized += body[i].replace(/[أإآ]/u, 'ا');
  offsets.push(i);
 }
 const days = ['الاحد','الاثنين','الثلاثاء','الاربعاء','الخميس','الجمعة','السبت'];
 const labels = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
 const patterns = [
  /اليوم\s+(التالي|اللاحق|السابق)\s+ل(?:يوم\s+)?((?:ال|ل)(?:احد|اثنين|ثلاثاء|اربعاء|خميس|جمعة|سبت))(?![\p{L}\p{N}])/gu,
  /اليوم\s+(?:الذي\s+)?(يلي|يسبق)\s+(?:يوم\s+)?(الاحد|الاثنين|الثلاثاء|الاربعاء|الخميس|الجمعة|السبت)(?![\p{L}\p{N}])/gu,
 ];
 const hints: {source: string; weekday: string}[] = [];
 for (const pattern of patterns) for (const match of normalized.matchAll(pattern)) {
  const delta = ['السابق','يسبق'].includes(match[1]) ? -1 : 1;
  const day = (days.indexOf(match[2].startsWith('ل') ? 'ا' + match[2] : match[2]) + delta + 7) % 7;
  hints.push({source: body.slice(offsets[match.index!], offsets[match.index! + match[0].length - 1] + 1), weekday: labels[day]});
 }
 return hints;
}

function decision(c: Claim): {verdict: Assessment['verdict']; conflict: boolean} {
 // Absence of an entity name is not evidence that two subjects differ.
 if (c.relation_basis === 'missing_subject_details') return {verdict: 'uncertain', conflict: false};
 // A paraphrased subject is a candidate link, not confirmed entity identity.
 // This does not forbid paraphrasing the claim about an explicitly identified subject.
 if (c.relation_basis === 'paraphrased_same_subject') return {verdict: 'uncertain', conflict: false};
 if (c.relation_basis === 'no_relevant_content' && c.shared_detail) return {verdict: 'uncertain', conflict: true};
 if (c.relation === 'same_claim' && !['explicit_same_subject','paraphrased_same_subject'].includes(c.relation_basis)) return {verdict: 'uncertain', conflict: true};
 // A different subject cannot simultaneously assert this old claim or its replacement.
 if (c.relation === 'different_claim') {
  const conflict = !['explicit_other_subject','no_relevant_content'].includes(c.relation_basis) || c.old_claim_stance !== 'not_asserted_now' || c.replacement_stance !== 'not_mentioned';
  return {verdict: conflict ? 'uncertain' : 'unaffected', conflict};
 }
 if (c.relation === 'unclear' || c.version_context === 'unknown') return {verdict: 'uncertain', conflict: false};
 // Old claim still asserted takes precedence, including mixed documents and rejected corrections.
 if (c.old_claim_stance === 'asserted_now') return {verdict: 'affected', conflict: false};
 if (c.old_claim_stance === 'unclear') return {verdict: 'uncertain', conflict: false};
 const conflict = c.replacement_stance === 'rejected';
 return {verdict: conflict || ['proposed','unclear'].includes(c.replacement_stance) ? 'uncertain' : 'unaffected', conflict};
}

// The provider selects bounded states and source passage indexes only. Explanations
// must not add model-written dates, names, quotations, or other ungrounded facts.
function explain(c: Claim, resolved: ReturnType<typeof decision>): string {
 if (resolved.conflict) return 'تعارضت مؤشرات الموضوع وموقف النص من التصحيح؛ يلزم التحقق البشري قبل الحسم.';
 if (c.relation_basis === 'missing_subject_details') return 'لا تكفي معلومات النص لتحديد هل المقصود هو الموضوع نفسه المشمول بالتصحيح. يلزم توضيح العلاقة قبل الحسم.';
 if (c.relation_basis === 'paraphrased_same_subject') return 'الربط مبني على تشابه وصف الموضوع؛ هوية الموضوع نفسه تحتاج تحققًا بشريًا قبل الحسم.';
 if (c.relation === 'different_claim') return c.relation_basis === 'explicit_other_subject'
  ? 'تشير قراءة السياق إلى موضوع آخر، فلا يظهر ارتباط بهذا التصحيح. راجع الشاهد قبل إغلاق الملاحظة.'
  : 'لم تحدد قراءة السياق محتوى مرتبطًا بالادعاء السابق أو التصحيح. راجع المادة قبل إغلاق الملاحظة.';
 if (c.relation === 'unclear') return 'العلاقة بالموضوع المشمول بالتصحيح غير محسومة. راجع المقطع مع المادة كاملة.';
 if (c.version_context === 'unknown') return 'لا يتضح أن المقطع يمثل النسخة الحالية أو أن التعديل نُفذ. يلزم التحقق البشري قبل الحسم.';
 if (c.old_claim_stance === 'asserted_now') return 'تشير قراءة السياق إلى استمرار تبنّي الادعاء السابق في النسخة الحالية. الموضع مرشّح للمراجعة قبل اتخاذ القرار.';
 if (resolved.verdict === 'unaffected') return c.replacement_stance === 'applied'
  ? 'تشير قراءة السياق إلى تبنّي التصحيح وعدم رصد تبنٍّ حالي للادعاء السابق. راجع الشاهد قبل إغلاق الملاحظة.'
  : 'لم ترصد قراءة السياق تبنّيًا حاليًا للادعاء السابق. راجع الشاهد قبل إغلاق الملاحظة.';
 return 'الحاجة إلى التصحيح غير محسومة من موقف النص أو حالة تنفيذ التعديل. يلزم التحقق البشري قبل الحسم.';
}

export function groundClaimChecks(value: unknown, docs: Pick<Doc,'id'|'body'>[]) {
 const data = value as {assessments?: unknown};
 if (!Array.isArray(data?.assessments)) throw new UserError('لم يرجع التحليل نتيجة مكتملة.', 502);
 const checks = data.assessments.map((item): ClaimCheck => {
  if (!item || typeof item !== 'object') throw new UserError('صيغة نتيجة التحليل غير صالحة.', 502);
  const c = item as Claim;
  if (c.relation_basis === 'explicit_other_subject' ? c.shared_detail !== null : typeof c.shared_detail !== 'boolean') throw new UserError('لم يلتزم التحليل بنطاق التفاصيل المشتركة.', 502);
  if (Object.hasOwn(c, 'reason')) throw new UserError('تضمنت النتيجة شرحًا مولدًا خارج الحقول المسموحة.', 502);
  for (const [field, options] of Object.entries(claimOptions)) {
   if (!(options as readonly unknown[]).includes(c[field as keyof typeof claimOptions])) throw new UserError('لم يحدد التحليل موقف الادعاء بوضوح.', 502);
  }
  // Once the old claim is asserted, its replacement's status is unnecessary for
  // this decision. Do not ask the model to invent that extra annotation.
  if ((c.old_claim_stance === 'asserted_now') !== (c.replacement_stance === 'not_assessed')) throw new UserError('تضمنت النتيجة وصفًا غير مسموح لموقف التصحيح. لم تُحفظ نتيجة جزئية.',502);
  const resolved = decision(c);
  if (c.passage_index === -1 && !(c.relation === 'different_claim' && c.relation_basis === 'no_relevant_content' && !c.shared_detail && !resolved.conflict)) throw new UserError('لم يقدم التحليل شاهدًا على حالة السياق.', 502);
  return {...c, ...resolved, reason: explain(c, resolved)};
 });
 const assessments = groundAssessments({assessments: checks}, docs);
 return {assessments, checks};
}

// A second reading is an agreement gate, not a claim of independent scientific validation.
export function reconcileChecks(first: Assessment[], second: Assessment[], docs: Pick<Doc,'id'|'body'>[], checks?:{first:ClaimCheck[];second:ClaimCheck[]}) {
 const primary = validateAssessments({assessments: first}, docs);
 const review = new Map(validateAssessments({assessments: second}, docs).map(a => [a.document_id, a]));
 const disagreements: string[] = [];
 const firstChecks=new Map(checks?.first.map(c=>[c.document_id,c])),secondChecks=new Map(checks?.second.map(c=>[c.document_id,c]));
 if(checks&&(firstChecks.size!==docs.length||secondChecks.size!==docs.length||docs.some(d=>!firstChecks.has(d.id)||!secondChecks.has(d.id))))throw new UserError('لم تكتمل مقارنة أدلة القراءتين.',502);
 const assessments = primary.map(a => {
  const b = review.get(a.document_id)!;
  const ca=firstChecks.get(a.document_id),cb=secondChecks.get(a.document_id);
  const fields: (keyof Claim)[]=['relation','relation_basis','old_claim_stance','shared_detail'];
  // A clearly unrelated subject does not depend on the age of its version.
  if(ca?.relation!=='different_claim'||cb?.relation!=='different_claim')fields.push('version_context','replacement_stance');
  const contextConflict=!!(ca&&cb&&fields.some(field=>ca[field]!==cb[field]));
  if (a.verdict === b.verdict&&!contextConflict) return b.quote ? b : a;
  disagreements.push(a.document_id);
  const quote = a.quote || b.quote;
  return {document_id: a.document_id, verdict: 'uncertain' as const, quote,
   reason: 'اختلفت قراءتا السياق في تحديد الموضوع أو موقف النص أو الحاجة إلى التصحيح. راجع المقطع مع المادة كاملة أو أحله للمختص؛ لم يُعتمد تصنيف حاسم.'};
 });
 return {assessments: validateAssessments({assessments}, docs), disagreements};
}
