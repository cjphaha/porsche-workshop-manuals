// Explicit project IDs prevent unrelated variants that share a WM code being merged.
export function getProjectParts(doc, documents) {
  const key=doc.projectId || doc.id;
  return documents.filter(d=>(d.projectId || d.id)===key).sort((a,b)=>a.start-b.start);
}
export const projectTitle=doc=>doc.title.replace(/\s*·\s*第\s*\d+\/\d+\s*部分$/u,'').replace(/\s*·\s*续页.*$/u,'').trim();
export function getProjectPages(parts) {
  return parts.flatMap(doc=>Array.from({length:doc.pages},(_,i)=>({doc,local:i+1,original:doc.start+i,size:doc.pageSizes?.[i] || [595.28,841.89]})));
}
