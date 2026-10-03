import type {Audit, Doc, Finding} from './types';

// A linked edit preserves the old analysis as history while review tracks the new version.
export function analysisPrecedesEdit(finding: Finding, doc: Doc, events: Audit[]): boolean {
 if (finding.document_version !== doc.version || finding.status === 'corrected') return true;
 return events.some(event => {
  if (event.action !== 'document_edited' || event.entity_id !== doc.id) return false;
  try {
   const detail = JSON.parse(event.details);
   return detail.findingId === finding.id && Number.isInteger(detail.fromVersion) && Number.isInteger(detail.toVersion)
    && detail.fromVersion < detail.toVersion && detail.toVersion <= doc.version;
  } catch {return false;}
 });
}
