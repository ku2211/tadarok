import type {WorkspaceState} from './types';
export function exportForReview(data:WorkspaceState,exampleOnly=false){
 const actors=new Map<string,string>();
 const alias=(id:string)=>{if(!actors.has(id))actors.set(id,'مراجع '+(actors.size+1));return actors.get(id)!;};
 return {exportedAt:new Date().toISOString(),exampleOnly,notice:'أُخفيت هوية الحسابات من هذا التصدير. محتوى المواد والملاحظات كما أدخله المستخدم؛ راجعه قبل المشاركة. الأمثلة التدريبية لا تدخل في قياس الدقة.',
 space:{id:data.space?.id,name:'مساحة الاختبار'},
 actor:{id:'export-reviewer',name:'مراجع',email:'',role:data.actor.role},
 documents:data.documents,corrections:data.corrections,
 findings:data.findings.map(f=>({...f,reviewed_by:f.reviewed_by?'مراجع':''})),
 events:data.events.filter(e=>e.action!=='member_added').map(e=>({...e,actor_id:alias(e.actor_id),actor_name:alias(e.actor_id)})),
 runs:data.runs.map(r=>({...r,...('actor' in r?{actor:'مراجع'}:{})})),members:[],aiReady:data.aiReady};
}
