/** Initial editorial collision inventory. Future changes edit query-policies.json explicitly. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeKbQuestion, KB_NORMALIZER_VERSION } from './normalize-kb.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data/kb', name), 'utf8'));
const write = (name, data) => fs.writeFileSync(path.join(root, 'data/kb', name), `${JSON.stringify(data, null, 2)}\n`);
const documents = ['fenasoja-kb.json', 'kb-expandida.json'].map(name => [name, read(name)]);
const entries = documents.flatMap(([,doc]) => doc.entries);
const rules = [
  { entry_ids:['ED01-PRES','HIS-008'], preferred_entry_id:'HIS-008', reason:'As respostas concordam sobre Willy Klaus; a entrada histórica abrange a pergunta pelo primeiro presidente.' },
  { entry_ids:['ED08-PRES','HIS-013'], preferred_entry_id:'HIS-013', reason:'A entrada histórica conserva a divergência 7ª/8ª e 1987/1990. O status confirmado da ficha não apaga o conflito documentado.' },
  { entry_ids:['ED25-VICE','F26-014'], preferred_entry_id:'ED25-VICE', reason:'Respostas compatíveis; a ficha da edição tem prioridade editorial estável para a vice-presidência de 2026.' },
  { entry_ids:['SR-001','RS-WK-0041'], preferred_entry_id:'SR-001', reason:'Localização compatível; a entrada institucional trata diretamente do endereço regional.' },
  { entry_ids:['AGRO-SOJ-0324','AGRO-FER-003'], preferred_entry_id:'AGRO-FER-003', reason:'A orientação geral evita apresentar duração mínima histórica do livro como norma atual; datas dependem de estado e safra.' },
  { entry_ids:['AGRO-SPD-0015','AGRO-SPD-0016'], clarification:'Você quer as razões para adotar o plantio direto sob a ótica dos agricultores ou da pesquisa?', reason:'A variante curta omite a perspectiva, e as respostas têm recortes diferentes.' },
  { entry_ids:['AGRO-OVI-0181','AGRO-OVI-0182'], clarification:'As ovelhas estão no início da gestação ou no terço final da gestação e lactação?', reason:'A fase altera a altura de pastejo recomendada; não escolher uma medida arbitrariamente.' },
  { entry_ids:['AGRO-ENSO-001','AGRO-WK-0140'], preferred_entry_id:'AGRO-ENSO-001', reason:'Definições compatíveis; prioridade editorial da referência primária NOAA sobre a enciclopédica.' },
  { entry_ids:['AGRO-INST-001','AGTECH-WK-0053'], preferred_entry_id:'AGRO-INST-001', reason:'Identidade institucional compatível; prioridade editorial da descrição com fonte da própria Embrapa.' },
  { entry_ids:['FEIRAS-AGS-001','FEIRAS-WK-0002'], preferred_entry_id:'FEIRAS-AGS-001', reason:'Prioridade à descrição da organização e referência de edição explícita, evitando cargo atual sem confirmação independente no verbete.' },
  { entry_ids:['FEIRAS-SRC-001','FEIRAS-WK-0003'], preferred_entry_id:'FEIRAS-SRC-001', reason:'Prioridade à organização da feira e período explícito; superlativos enciclopédicos não são equivalentes a ranking oficial.' },
  { entry_ids:['FEIRAS-BFS-001','FEIRAS-WK-0004'], preferred_entry_id:'FEIRAS-BFS-001', reason:'Prioridade à organização da feira e período explícito, evitando cargo atual sem confirmação independente no verbete.' },
  { entry_ids:['AGTECH-RGEN-0031','AGTECH-WK-0020'], preferred_entry_id:'AGTECH-RGEN-0031', reason:'Conceitos compatíveis; prioridade editorial à publicação da Embrapa com item identificado.' },
  { entry_ids:['SUST-ILPF-0107','SUST-ILPF-0188'], clarification:'Qual é a região e a atividade anterior da área: agricultura ou pecuária?', reason:'A variante omite região e situação prévia; as recomendações não são intercambiáveis.' },
  { entry_ids:['SUST-ILPF-0184','SUST-ILPF-0185','SUST-ILPF-0208'], clarification:'Você se refere à região Norte, ao Cerrado e pré-Amazônia do Nordeste ou à Caatinga, Agreste e Zona da Mata?', reason:'O bioma e a região alteram o perfil das propriedades e a indicação.' },
  { entry_ids:['SUST-ILPF-0199','SUST-ILPF-0221'], clarification:'O manejo florestal que você procura é para a região Norte ou Nordeste?', reason:'A variante omite a região e as recomendações são diferentes.' },
  { entry_ids:['SUST-ILPF-0210','SUST-ILPF-0211'], clarification:'A área já era usada para agricultura ou para pecuária?', reason:'A atividade anterior muda a recomendação de consórcio.' },
];
const questions = new Map();
for (const e of entries) for (const q of [e.canonical_question,...e.variants]) {
  const norm=normalizeKbQuestion(q); if (!questions.has(norm)) questions.set(norm,new Set()); questions.get(norm).add(e.id);
}
const collisions = [...questions].filter(([,ids])=>ids.size>1).map(([question_norm,ids], index)=>{
  const entry_ids=[...ids].sort(); const rule=rules.find(r=>r.entry_ids.slice().sort().join('|')===entry_ids.join('|'));
  if(!rule) throw new Error(`Unreviewed collision: ${question_norm}`);
  return {id:`collision-${String(index+1).padStart(3,'0')}`,question_norm, ...rule, action:rule.preferred_entry_id?'prefer':'clarify'};
});
if(collisions.length!==rules.length) throw new Error('Collision coverage differs from reviewed inventory');
const entry_overrides={};
const citationPolicies={
  'HIS-005':{citation_indexes:[0,1,2],reason:'Preserva o relato histórico, a ficha que dizia última visita em 1981 e a notícia da visita em 2022.'},
  'SOJ-004':{citation_indexes:[1,3,4],reason:'Preserva a versão do centenário 1923/1924 e as duas referências divergentes a 1914, Embrapa e Fenasoja.'},
  'PAR-002':{citation_indexes:[0,1,2],reason:'Preserva as três medidas conflitantes: 40, 47 e 36 hectares; demais fontes continuam na proveniência integral.'},
};
const curation=read('curation-log.json');
for(const e of entries){
  const cs=collisions.filter(c=>c.entry_ids.includes(e.id));
  e.query_policy={collision_groups:cs.map(c=>c.id),preference_rank:cs.some(c=>c.preferred_entry_id===e.id)?0:1};
  if(cs.some(c=>c.preferred_entry_id))e.query_policy.preferred_entry_id=cs.find(c=>c.preferred_entry_id).preferred_entry_id;
  if(e.id==='AGRO-OVI-0181'||e.id==='AGRO-OVI-0182') Object.assign(e.query_policy,{required_context:'gestation_phase',phase:e.id.endsWith('181')?'initial':'final'});
  if(citationPolicies[e.id]){
    const policy=citationPolicies[e.id];e.query_policy.citation_indexes=policy.citation_indexes;
    if(!curation.changes.some(c=>c.id===e.id&&c.field==='query_policy.citation_indexes'))curation.changes.push({id:e.id,field:'query_policy.citation_indexes',previous:null,revised:policy.citation_indexes,reason:policy.reason,source:policy.citation_indexes.map(i=>e.sources[i].url)});
  }
  if(cs.length||citationPolicies[e.id])entry_overrides[e.id]=e.query_policy;
}
write('query-policies.json',{version:'2026-10-17',normalizer_version:KB_NORMALIZER_VERSION,collisions,entry_overrides,
  semantics:{default_collision:'clarify when answer-changing tie; never infer compatibility from status',priority:'Fenasoja is preferred at 0.45 unless eligible expandida is at least 0.10 higher and at least 0.50. Priority column only stable tiebreak.',eight_presidency:'Use HIS-013 for 8th/1990 presidency context, preserving disagreement even when ED08-PRES has higher textual similarity.'}});
for(const [name,doc] of documents)write(name,doc);
write('curation-log.json',curation);
console.log(`Reviewed ${collisions.length} normalized collisions.`);
