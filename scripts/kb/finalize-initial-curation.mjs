/** Explicit supplemental review of the initial archive. Does not contact external services. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'data/kb',n),'utf8'));
const write=(n,v)=>fs.writeFileSync(path.join(root,'data/kb',n),`${JSON.stringify(v,null,2)}\n`);
const log=read('curation-log.json');
const checks=read('raw/period-source-checks.json').checks;
for(const name of ['fenasoja-kb.json','kb-expandida.json']){
  const doc=read(name);
  for(const e of doc.entries){
    const change=(field,before,after,reason,source=null)=>{if(JSON.stringify(before)!==JSON.stringify(after))log.changes.push({id:e.id,field,previous:before,revised:after,reason,source});};
    if(e.id==='AGRO-ENSO-003'){
      const answer='A situação do El Niño e da La Niña muda ao longo do tempo. Consulte o boletim ENSO da NOAA/CPC indicado na fonte e confira a data de publicação para saber a condição mais recente.';
      const reason='Orientação pública para dado dinâmico: não fixar alerta ou previsão volátil de outubro de 2026 nem alegar consulta ao vivo. O texto original e sua data permanecem no arquivo original e nos metadados editoriais.';
      change('answer',e.answer,answer,reason,e.sources.map(s=>s.url));e.answer=answer;
      change('as_of',e.as_of,null,'A orientação dinâmica não representa o estado climático de uma data fixa; a referência histórica original permanece em editorial_metadata.as_of.');e.as_of=null;
      const label='NOAA/CPC · Boletim ENSO';
      change('sources.label',e.sources[0].label,label,'Rótulo público identifica o boletim móvel sem atribuir ao conteúdo atual a data histórica declarada no título original.');e.sources[0].label=label;
    }
    if(['MERC-PS-002','MERC-PS-003','MERC-PS-004','MERC-PS-009'].includes(e.id))e.context.audience='empresarial';
    if(['MERC-PS-005','MERC-PS-006','MERC-PS-008'].includes(e.id))e.context.audience='familiar';
    for(const s of e.sources){
      if(!s.url.includes('/p/last'))continue;
      const next=s.url.replace('/p/last','/p/2025');const check=checks.find(c=>c.url===next);
      if(!check?.confirmed)continue;
      change('sources.url',s.url,next,'Endpoint SIDRA de período explícito testado com HTTP 200 e todas as linhas no ano 2025; valores da resposta não foram recalculados.',{url:next,reviewed_on:'2026-10-17',response_sha256:check.sha256});
      s.original_url=s.url;s.url=next;
      const previous=[...e.public_notes];
      e.public_notes=e.public_notes.filter(n=>!n.startsWith('A fonte usa um endereço de atualização'));
      change('public_notes',previous,e.public_notes,'Fonte temporal fixada no ano do dado; ressalva de endpoint móvel deixa de se aplicar.');
    }
  }
  write(name,doc);
}
write('curation-log.json',log);
write('raw/factual-review.json',{reviewed_on:'2026-10-17',scope:'Priority factual review; all source access dates in original records remain archive declarations. No assertion that every factual claim was independently rechecked.',checks:[
 {entry_ids:['ED24-DATAS','ED24-PRES'],url:'https://fenasoja.com.br/edicoes-anteriores/',result:'Page explicitly gives 29/11–08/12/2024 and Dário Junior da Motta Germano. Existing 28/11 conflict retained.'},
 {entry_ids:['F28-001','F28-002','F28-006'],url:'https://fenasoja.com.br/portal-oficial/geral/definidas-data-e-comissao-central-da-fenasoja-2028/',result:'Dates 28/04–07/05/2028 and presidency confirmed in primary announcement. No official number confirmed.'},
 {entry_ids:['F28-003'],url:'https://fenasoja.com.br/portal-oficial/geral/evento-enaltece-resultados-da-fenasoja-2026-e-marca-anuncio-do-presidente-e-vice-presidente-de-2028/',result:'Primary official indexed text explicitly names Djeison Fernando Drey as vice in 2028 and president in 2030. No number or calendar inferred.'},
 {entry_ids:['MERC-PS-002'],url:'https://www.gov.br/agricultura/pt-br/assuntos/noticias/governo-federal-lanca-plano-safra-2025-2026-com-r-516-2-bilhoes-para-impulsionar-o-agro-brasileiro',result:'Primary indexed announcement confirms R$ 516.2 billion; live page redirect required login, so no new source replaces existing accessible sources.'},
 {entry_ids:['MERC-PS-005'],url:'https://www.gov.br/incra/pt-br/assuntos/noticias/plano-safra-da-agricultura-familiar-2025-26-tera-investimento-de-r-89-bilhoes/',result:'Primary announcement confirms R$ 89 billion and R$ 78.2 billion for Pronaf, with announcement on 30/06/2025. Historical cycle remains explicit.'},
 {entry_ids:['SUST-LEG-004'],url:'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm',result:'Article 12 supports 20% outside Legal Amazon with statutory exceptions; all exceptions and professional-use note retained.'},
 {entry_ids:['AGRO-OVI-0181','AGRO-OVI-0182'],url:'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/99735/1/500perguntasovinos.pdf',result:'No new factual change: source book 2007 and distinct pregnancy phases preserved from supplied records, with required clarification and professional confirmation note.'}
]});
console.log('Supplemental curation recorded; fixed seven confirmed SIDRA period URLs.');
