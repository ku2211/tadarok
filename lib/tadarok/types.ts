export type Role='owner'|'editor'|'reviewer';
export type Actor={id:string;email:string;name:string;role:Role};
export type Doc={id:string;space_id:string;title:string;body:string;kind:string;version:number;is_demo:number;updated_at:string;mutation_id:string};
export type Correction={id:string;space_id:string;title:string;old_text:string;new_text:string;reference:string;reference_url:string;reason:string;last_run_id:string|null;is_demo:number;created_at:string};
export type Finding={id:string;correction_id:string;run_id:string;document_id:string;document_version:number;quote:string;reason:string;verdict:'affected'|'unaffected'|'uncertain';status:'pending'|'corrected'|'approved'|'dismissed'|'referred'|'stale';note:string;reviewed_by:string;reviewed_at:string|null};
export type Audit={id:string;entity_id:string;actor_id:string;actor_name:string;actor_role:string;action:string;details:string;created_at:string};
export type Run={id:string;correction_id:string;engine:string;status:string;doc_count:number;elapsed_ms:number;created_at:string};
export type WorkspaceState={spaces?:{id:string;name:string}[];space:{id:string;name:string}|null;actor:Actor;documents:Doc[];corrections:Correction[];findings:Finding[];events:Audit[];runs:Run[];members:{id:string;email:string;role:Role}[];aiReady:boolean};
