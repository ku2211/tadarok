import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
if(process.argv.length!==4)throw new Error('Usage: node evaluation/score.mjs export.json correction-id');
const data=JSON.parse(readFileSync(process.argv[2],'utf8'));
const manifest=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url),'utf8'));
const correction=data.corrections.find(c=>c.id===process.argv[3]);
if(data.exampleOnly||!correction||correction.is_demo)throw new Error('A real analysis export is required. Illustrative examples cannot be scored.');
const run=data.runs.find(r=>r.id===correction.last_run_id);
if(!run||run.engine==='illustrative-example'||run.status!=='completed')throw new Error('The selected correction has no completed real analysis.');
if(correction.old_text!==manifest.correction.oldText||correction.new_text!==manifest.correction.newText)throw new Error('Correction does not match the evaluation manifest.');
const n={TP:0,FP:0,FN:0,TN:0,uncertainPositive:0,uncertainNegative:0};
const exact={TP:0,FP:0,FN:0,TN:0};
const cases=[];
for(const c of manifest.cases){
 const matching=data.documents.filter(d=>d.title===c.title);
 if(matching.length!==1)throw new Error('Missing or duplicate document: '+c.title);
 const d=matching[0];if(createHash('sha256').update(d.body.trim()).digest('hex')!==c.sha256)throw new Error('Document changed after evaluation fixture: '+c.title);
 const fs=data.findings.filter(f=>f.run_id===run.id&&f.document_id===d.id);
 if(fs.length!==1||fs[0].document_version!==d.version||fs[0].status==='stale')throw new Error('Missing or stale finding: '+c.title);
 const f=fs[0],pos=c.expected==='affected';
 if(f.verdict==='uncertain'){n[pos?'uncertainPositive':'uncertainNegative']++;}else n[pos?(f.verdict==='affected'?'TP':'FN'):(f.verdict==='affected'?'FP':'TN')]++;
 const literal=d.body.includes(correction.old_text);exact[pos?(literal?'TP':'FN'):(literal?'FP':'TN')]++;
 cases.push({title:c.title,expected:c.expected,predicted:f.verdict});
}
const ratio=(a,b)=>b?a/b:null;
console.log(JSON.stringify({notice:manifest.notice,engine:run.engine,runId:run.id,n:20,...n,precision:ratio(n.TP,n.TP+n.FP),recall:n.TP/12,falsePositiveRate:n.FP/8,abstentionRate:(n.uncertainPositive+n.uncertainNegative)/20,literalBaseline:exact,cases},null,2));
