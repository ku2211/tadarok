import Workspace from '../workspace';
import {exampleCorrection,exampleDocuments} from '@/lib/tadarok/example';
import type {WorkspaceState} from '@/lib/tadarok/types';
export const metadata={title:'جولة توضيحية — تدارك'};
export default function DemoPage(){
 const at='2026-09-28T18:00:00.000Z';const x=exampleCorrection;
 const data:WorkspaceState={space:{id:'demo',name:'مثال تدريبي'},actor:{id:'demo',name:'مراجع تجريبي',email:'',role:'owner'},aiReady:false,members:[],events:[],
 documents:exampleDocuments.map((d,i)=>({id:'doc-'+i,space_id:'demo',title:d.title,body:d.body,kind:d.kind,version:1,is_demo:1,updated_at:at,mutation_id:'demo'})),
 corrections:[{id:'correction-demo',space_id:'demo',title:x.title,old_text:x.oldText,new_text:x.newText,reference:x.reference,reference_url:x.referenceUrl,reason:x.reason,last_run_id:'run-demo',is_demo:1,created_at:at}],
 runs:[{id:'run-demo',correction_id:'correction-demo',engine:'illustrative-example',status:'completed',doc_count:5,elapsed_ms:0,created_at:at}],
 findings:exampleDocuments.map((d,i)=>({id:'finding-'+i,space_id:'demo',correction_id:'correction-demo',run_id:'run-demo',document_id:'doc-'+i,document_version:1,quote:d.quote,reason:d.reason,verdict:d.verdict,status:'pending',note:'',reviewed_by:'',reviewed_at:null,created_at:at}))};
 return <Workspace signedIn={false} signInPath="/" demoData={data}/>;
}
