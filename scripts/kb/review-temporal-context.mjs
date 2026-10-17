/** Explicit temporal review of the remaining institutional records, without assigning unrelated event years to Fenasoja. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../data/kb');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const write=(n,v)=>fs.writeFileSync(path.join(dir,n),`${JSON.stringify(v,null,2)}\n`);
const log=read('curation-log.json'), calendar=read('editions.json'), policies=read('query-policies.json');
const editionMap={
 'HIS-001':1966,'HIS-002':1966,'HIS-007':1981,'HIS-008':1966,
 'SOJ-008':2024,'SOJ-009':1966,'SOJ-015':2026,
 'PAR-006':2024,'PAR-007':2026,'PAR-008':2026,
 'EXP-002':2002,'EXP-004':2028,'EXP-005':2026,'EXP-006':2026,'EXP-007':2026,'EXP-008':2026,
 'VIS-007':2028,'VIS-008':2026,'EVT-001':2026,'EVT-002':2026,'EVT-004':2026,'EVT-005':2024,'EVT-006':2026,'ECO-003':2024,
};
for(const name of ['fenasoja-kb.json','kb-expandida.json']){
 const doc=read(name);
 for(const e of doc.entries){
  const before={edition_year:e.edition_year,edition_number:e.edition_number,context:structuredClone(e.context),query_policy:structuredClone(e.query_policy),public_notes:[...e.public_notes]};
  if(editionMap[e.id]){
   const edition=calendar.editions.find(x=>x.year===editionMap[e.id]);
   e.edition_year=edition.year;e.edition_number=edition.number_confirmed?edition.number:null;
   Object.assign(e.context,{scope:'edition',edition_required:true,valid_until:edition.end});
  }
  if(['HIS-007','HIS-008'].includes(e.id))e.query_policy.allow_comparative=true;
  if(['HIS-005','HIS-009','HIS-010','HIS-012'].includes(e.id))e.query_policy.historical_only=true;
  if(e.id==='SOJ-014'){
   Object.assign(e.context,{scope:'period',subject:'agriculture',reference_period:'2025/2026',valid_from:null,valid_until:'2026-06-30'});
   const note='Projeção histórica referente à safra 2025/2026. Não representa uma estimativa atual da produção.';
   if(!e.public_notes.includes(note))e.public_notes.push(note);
  }
  if(e.id==='SR-002')Object.assign(e.context,{scope:'period',subject:'regional',reference_period:'2025'});
  if(e.id==='SR-004')Object.assign(e.context,{scope:'period',subject:'regional',reference_period:'2025–2028',valid_from:'2025-01-01',valid_until:'2028-12-31'});
  if(e.id==='SR-007')Object.assign(e.context,{scope:'period',subject:'regional',reference_period:'Referência institucional sem data do dado'});
  if(e.id.startsWith('MUS-')){
   e.context.subject='other_fairs';
   if(e.id==='MUS-004')Object.assign(e.context,{scope:'period',reference_period:'2023'});
  }
  if(e.id==='EXP-009')Object.assign(e.context,{scope:'period',reference_period:'2012'});
  const after={edition_year:e.edition_year,edition_number:e.edition_number,context:e.context,query_policy:e.query_policy,public_notes:e.public_notes};
  for(const field of Object.keys(before))if(JSON.stringify(before[field])!==JSON.stringify(after[field]))log.changes.push({id:e.id,field,previous:before[field],revised:after[field],reason:'Revisão temporal explícita do conteúdo: separar fato de edição, consulta histórica/comparativa e período de outro assunto; não inferir datas de feira.',source:e.sources.map(s=>s.url)});
  if(Object.keys(e.query_policy).some(k=>!['collision_groups','preference_rank'].includes(k)))policies.entry_overrides[e.id]=e.query_policy;
 }
 write(name,doc);
}
write('query-policies.json',policies);write('curation-log.json',log);
console.log('Reviewed remaining edition and historical-context eligibility.');
