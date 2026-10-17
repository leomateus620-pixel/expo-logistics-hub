#!/usr/bin/env node
/** Deterministic, offline builder. Reviewed JSON is data, never agent instructions. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { normalizeKbQuestion, KB_NORMALIZER_VERSION } from './normalize-kb.mjs';
import { isKbSourceDate, isSafeKbSourceUrl } from '../../supabase/functions/_shared/workers/kb-source.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataRoot = path.join(root, 'data/kb');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const read = relative => JSON.parse(fs.readFileSync(path.join(dataRoot, relative), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const count = (items, key) => Object.fromEntries([...items.reduce((m, x) => m.set(x[key], (m.get(x[key]) ?? 0) + 1), new Map())].sort());
const sql = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const args = process.argv.slice(2);
assert(args.every((a,i)=>['--check','--stamp','--version'].includes(a)||['--stamp','--version'].includes(args[i-1])), 'Unknown generator argument');
const checking = args.includes('--check');
const oldManifest = fs.existsSync(path.join(dataRoot, 'manifest.json')) ? read('manifest.json') : null;
const arg = name => args.includes(name) ? args[args.indexOf(name)+1] : undefined;
const version = arg('--version') ?? (checking ? oldManifest?.version : null);
const stamp = arg('--stamp') ?? (checking ? oldManifest?.migration_stamp : null);
assert(isKbSourceDate(version), 'Pass --version YYYY-MM-DD (real revision date)');
assert(/^\d{14}$/.test(stamp ?? ''), 'Pass --stamp YYYYMMDDHHMMSS after latest migration');
assert(!oldManifest || version >= oldManifest.version, 'KB_SEED_VERSION_DOWNGRADE');
const seedName = `${stamp}_workers_kb_seed.sql`;
const seedPath = `supabase/migrations/${seedName}`;
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n=>/^\d{14}.*\.sql$/.test(n));
if (!fs.existsSync(path.join(root,seedPath))) assert(migrations.every(n=>n.slice(0,14)<stamp), 'KB_SEED_STAMP_NOT_AFTER_HISTORY');

// Execute the checked-in redactor implementation, not a weakened copy in the generator.
const contract = fs.readFileSync(path.join(root,'supabase/functions/_shared/workers/contracts.ts'),'utf8');
const redactSource = contract.match(/export function redactWorkerText\(value: string\): string \{[\s\S]*?\n\}/)?.[0];
assert(redactSource, 'Current redactWorkerText implementation not found');
const { redactWorkerText } = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(redactSource))}`);
function display(value, label, limit=1200) {
  assert(typeof value === 'string' && value.trim() && value.length <= limit, `${label}: invalid display length`);
  assert(!/[<>`\u0000-\u001f\u007f\u00a0\u200b-\u200d\ufeff]/.test(value), `${label}: unsupported display character`);
  assert(redactWorkerText(value) === value, `${label}: redactWorkerText changes reviewed text`);
}
const docs = ['fenasoja-kb.json','kb-expandida.json'].map(name=>({name,...read(name)}));
const entries = docs.flatMap(doc=>doc.entries).sort((a,b)=>a.id.localeCompare(b.id,'en'));
const expected = read('expected-counts.json');
const calendar = read('editions.json');
const policies = read('query-policies.json');
const curation = read('curation-log.json');
const provenance = read('raw/provenance.json');
assert(expected.version === version && calendar.version === version && policies.version === version && curation.version === version, 'Versioned inputs must match --version');
assert(provenance.revision === version, 'Raw provenance revision must match --version');
assert(policies.normalizer_version === KB_NORMALIZER_VERSION, 'Normalizer policy version mismatch');
assert(JSON.stringify(expected.initial_baseline)===JSON.stringify({fenasoja:{entries:372,questions:1245},expandida:{entries:2414,questions:10889}}), 'Initial import baseline cannot be silently weakened');
const ids = new Set(entries.map(e=>e.id));
assert(ids.size === entries.length, 'Duplicate entry ID');
const byId = new Map(entries.map(e=>[e.id,e]));
for (const doc of docs) {
  assert(doc.meta.version === version, `${doc.name}: meta version mismatch`);
  const actual={entries:doc.entries.length,questions:doc.entries.reduce((n,e)=>n+1+e.variants.length,0)};
  assert(JSON.stringify(actual)===JSON.stringify(expected.expected[doc.meta.kb]), `KB_SEED_COUNT_MISMATCH ${doc.name}`);
}
assert(Array.isArray(curation.changes), 'Invalid curation log changes');
for(const [index,change]of curation.changes.entries()) {
  const label=`curation.changes[${index}]`;
  assert(change&&typeof change==='object'&&!Array.isArray(change),`${label}: invalid change`);
  assert(ids.has(change.id)||expected.retired_ids?.includes(change.id),`${label}: unknown entry ID`);
  assert(typeof change.field==='string'&&/^[a-z_]+(?:\.[a-z_]+)*$/.test(change.field),`${label}: invalid field`);
  assert(Object.hasOwn(change,'previous')&&Object.hasOwn(change,'revised')&&JSON.stringify(change.previous)!==JSON.stringify(change.revised),`${label}: previous and revised values required and distinct`);
  assert(typeof change.reason==='string'&&change.reason.trim().length>0,`${label}: editorial reason required`);
  assert(Object.hasOwn(change,'source'),`${label}: source field required`);
  if(change.source!==null){
    const refs=Array.isArray(change.source)?change.source:[change.source];
    assert(refs.length>0,`${label}: empty evidence`);
    for(const ref of refs){
      assert(isSafeKbSourceUrl(typeof ref==='string'?ref:ref?.url),`${label}: invalid evidence URL`);
      if(typeof ref==='object'&&ref!==null){
        assert(ref.reviewed_on===undefined||isKbSourceDate(ref.reviewed_on),`${label}: invalid evidence review date`);
        assert(ref.response_sha256===undefined||/^[a-f0-9]{64}$/.test(ref.response_sha256),`${label}: invalid evidence hash`);
      }
    }
  }
}
const rawDocuments = new Map([...new Set(entries.map(e=>e.provenance?.source_file))].map(name=>{
  assert(typeof name==='string'&&!path.isAbsolute(name)&&!name.split(/[\\/]/).includes('..')&&name.endsWith('.json'),'Invalid raw provenance filename');
  return [name,{hash:hash(fs.readFileSync(path.join(dataRoot,'raw',name))),entries:new Map(read(`raw/${name}`).entries.map(e=>[e.id,e]))}];
}));
const columns = ['id','kb','area','area_name','subcategory','canonical_question','answer','kind','status','as_of','edition_number','edition_year','dynamic_instructions','citation_template','sources','tags','related_ids','fenasoja_links','gaps','relevance','priority','kb_version','context','public_notes','query_policy','editorial_metadata','provenance','managed_by'];
const questions = [];
const collisionMap = new Map();
for(const e of entries) {
  const label=e.id;
  assert(/^[A-Z][A-Z0-9-]{2,79}$/.test(e.id), `${label}: invalid ID`);
  assert(['fenasoja','expandida'].includes(e.kb), `${label}: invalid kb`);
  assert(['fato','conceito','dado','orientacao'].includes(e.kind), `${label}: invalid kind`);
  assert(['confirmado','parcial','conflito','dinamico','sem_fonte'].includes(e.status), `${label}: invalid status`);
  assert(e.kb_version === version, `${label}: kb_version mismatch`);
  display(e.answer,`${label}.answer`); display(e.canonical_question,`${label}.canonical_question`,500);
  display(e.area,`${label}.area`,80);display(e.area_name,`${label}.area_name`,140);display(e.subcategory,`${label}.subcategory`,180);
  display(e.kb==='fenasoja'?'Base de conhecimento pública da Fenasoja':`Base de conhecimento pública · ${e.area_name}`,`${label}.scope`,180);
  assert(e.as_of===null||typeof e.as_of==='string'&&e.as_of.length<=100, `${label}: invalid textual reference`);
  if(e.as_of)display(e.as_of,`${label}.as_of`,100);
  assert(Array.isArray(e.variants),`${label}: invalid variants`);
  for(const [i,q] of [e.canonical_question,...e.variants].entries()) {
    assert(typeof q==='string'&&q.trim().length>=2&&q.length<=500,`${label}#${i}: question length`);
    const norm=normalizeKbQuestion(q);assert(norm,`${label}#${i}: empty normalized question`);
    questions.push({id:`${label}#${i}`,entry_id:label,kb:e.kb,question:q,question_norm:norm,is_canonical:i===0,kb_version:version});
    if(!collisionMap.has(norm))collisionMap.set(norm,new Set());collisionMap.get(norm).add(label);
  }
  assert(Array.isArray(e.sources)&&e.sources.length<=8,`${label}: source count`);
  assert(e.status==='sem_fonte'||e.sources.length>0,`${label}: usable source required`);
  for(const [i,s]of e.sources.entries()) {
    assert(isSafeKbSourceUrl(s.url),`${label}.sources[${i}]: unsafe URL ${s.url}`);
    assert(isKbSourceDate(s.accessed),`${label}.sources[${i}]: invalid civil access date`);
    display(s.label,`${label}.sources[${i}].label`,160);
    assert(typeof s.title==='string'&&s.title.trim(),`${label}: original source title missing`);
  }
  // The response contract permits eight notes. Reserve two edition interpretations,
  // one compatible-question note, one status caveat and one data reference. Reject
  // oversized editorial inputs before publication; never truncate a public caveat.
  const reservedResponseNotes=2+1+1+1;
  assert(Array.isArray(e.public_notes)&&e.public_notes.length+reservedResponseNotes<=8,`${label}: KB_PUBLIC_NOTES_BUDGET_EXCEEDED (maximum 3 public notes; 5 response notes reserved)`);
  e.public_notes.forEach((n,i)=>display(n,`${label}.public_notes[${i}]`));
  assert(e.priority===(e.kb==='fenasoja'?1:2),`${label}: priority mismatch`);
  assert(['alta','media','baixa'].includes(e.relevance),`${label}: relevance`);
  for(const field of ['tags','related_ids','fenasoja_links','gaps'])assert(Array.isArray(e[field])&&e[field].every(v=>typeof v==='string'&&v.trim()),`${label}.${field}: expected nonempty strings`);
  for(const field of ['related_ids','fenasoja_links'])for(const id of e[field])assert(ids.has(id),`${label}.${field}: missing ${id}`);
  for(const id of e.fenasoja_links)assert(byId.get(id)?.kb==='fenasoja',`${label}: non-Fenasoja editorial link`);
  assert(e.citation_template===null||typeof e.citation_template==='string',`${label}: citation template metadata`);
  assert(e.editorial_metadata&&typeof e.editorial_metadata==='object'&&!Array.isArray(e.editorial_metadata),`${label}: editorial metadata`);
  assert(e.edition_year===null||Number.isInteger(e.edition_year)&&e.edition_year>=1966&&e.edition_year<=2100,`${label}: edition year`);
  assert(e.edition_number===null||Number.isInteger(e.edition_number)&&e.edition_number>=1&&e.edition_number<=100,`${label}: edition number`);
  const c=e.context;
  assert(c&&['general','edition','period','dynamic'].includes(c.scope)&&typeof c.subject==='string'&&typeof c.edition_required==='boolean',`${label}: context schema`);
  assert(c.audience===undefined||['familiar','empresarial'].includes(c.audience),`${label}: audience schema`);
  assert(c.reference_period===null||typeof c.reference_period==='string'&&c.reference_period.length<=100,`${label}: reference period`);
  for(const key of ['valid_from','valid_until'])assert(c[key]===null||isKbSourceDate(c[key]),`${label}: ${key}`);
  assert(!c.valid_from||!c.valid_until||c.valid_from<=c.valid_until,`${label}: reversed validity`);
  assert(!c.edition_required||e.edition_year!==null,`${label}: missing edition context`);
  assert(e.dynamic_instructions===null,`${label}: freeform dynamic instructions must remain editorial metadata only`);
  assert(e.provenance?.source_entry_id===label&&e.provenance?.managed_by==='fenasoja-kb-seed',`${label}: provenance mismatch`);
  assert(e.provenance.revision===version,`${label}: provenance revision mismatch`);
  const raw=rawDocuments.get(e.provenance.source_file), original=raw?.entries.get(label);
  assert(raw&&original&&raw.hash===e.provenance.source_sha256,`${label}: original record provenance hash`);
  if(version==='2026-10-17')assert(JSON.stringify([e.canonical_question,...e.variants])===JSON.stringify([original.canonical_question,...original.variants]),`${label}: initial question occurrences must be preserved`);
  assert(e.query_policy&&Array.isArray(e.query_policy.collision_groups)&&[0,1].includes(e.query_policy.preference_rank),`${label}: query_policy schema`);
  for(const group of e.query_policy.collision_groups)assert(policies.collisions.some(c=>c.id===group&&c.entry_ids.includes(label)),`${label}: missing collision group`);
  for(const field of ['historical_only','allow_comparative'])assert(e.query_policy[field]===undefined||typeof e.query_policy[field]==='boolean',`${label}: query policy ${field}`);
  assert(e.query_policy.preferred_entry_id===undefined||ids.has(e.query_policy.preferred_entry_id),`${label}: preferred entry missing`);
  if(e.query_policy.citation_indexes!==undefined){const indexes=e.query_policy.citation_indexes;assert(Array.isArray(indexes)&&indexes.length>=1&&indexes.length<=3&&new Set(indexes).size===indexes.length&&indexes.every(i=>Number.isInteger(i)&&i>=0&&i<e.sources.length),`${label}: citation selection policy`);}
  assert(e.status!=='conflito'||e.sources.length<=3||e.query_policy.citation_indexes,`${label}: conflict needs explicit selection preserving divergent sources`);
}
const actualCollisions=[...collisionMap].filter(([,set])=>set.size>1);
assert(actualCollisions.length===policies.collisions.length,'Unreviewed normalized collision count');
for(const [norm,set]of actualCollisions) {
  const policy=policies.collisions.find(p=>p.question_norm===norm);
  assert(policy&&policy.entry_ids.slice().sort().join('|')===[...set].sort().join('|'),`Unreviewed collision: ${norm}`);
  assert(['prefer','clarify'].includes(policy.action),`Invalid collision policy: ${norm}`);
  assert(policy.action==='prefer'?set.has(policy.preferred_entry_id):typeof policy.clarification==='string',`Incomplete collision policy: ${norm}`);
  if(policy.clarification)display(policy.clarification,`${policy.id}.clarification`);
}
for(const edition of calendar.editions) {
  assert(Number.isInteger(edition.year)&&typeof edition.number_confirmed==='boolean', 'Invalid calendar edition');
  for(const key of ['start','end'])assert(edition[key]===null||isKbSourceDate(edition[key]),`Invalid calendar ${edition.year}.${key}`);
  assert(!edition.number_confirmed||Number.isInteger(edition.number),`Invalid confirmed number ${edition.year}`);
  assert(!edition.start||!edition.end||edition.start<=edition.end,`Reversed calendar ${edition.year}`);
  assert(edition.provenance.entry_ids.every(id=>ids.has(id)),`Calendar provenance missing ${edition.year}`);
}
const rawInputs=provenance.inputs.map(input=>{
  const bytes=fs.readFileSync(path.join(dataRoot,'raw',input.name));assert(hash(bytes)===input.sha256,`Raw input hash mismatch ${input.name}`);
  return {name:`data/kb/raw/${input.name}`,sha256:hash(bytes),bytes:bytes.length};
});
const inputNames=['fenasoja-kb.json','kb-expandida.json','editions.json','query-policies.json','curation-log.json','expected-counts.json','raw/provenance.json','raw/factual-review.json','raw/period-source-checks.json'];
const inputs=inputNames.map(name=>({name:`data/kb/${name}`,sha256:hash(fs.readFileSync(path.join(dataRoot,name)))}));
const sourceHash=hash(JSON.stringify(inputs));
const payloads=entries.map(e=>Object.fromEntries(columns.map(c=>[c,c==='managed_by'?'fenasoja-kb-seed':e[c]])));
const statements=[`-- Generated by scripts/kb/build-kb-seed.mjs; immutable revision ${version}.\n-- Source SHA-256: ${sourceHash}. All content is published atomically.\nBEGIN;\nSET LOCAL standard_conforming_strings = on;\nSELECT pg_catalog.pg_advisory_xact_lock(20261017, 2786);`,
`DO $kb_guard$ BEGIN
  IF EXISTS (SELECT 1 FROM workers_private.kb_seed_publications WHERE version > ${sql(version)}::date)
    OR EXISTS (SELECT 1 FROM public.kb_entries WHERE managed_by = 'fenasoja-kb-seed' AND kb_version > ${sql(version)})
  THEN RAISE EXCEPTION 'KB_SEED_VERSION_DOWNGRADE'; END IF;
  IF EXISTS (SELECT 1 FROM workers_private.kb_seed_publications WHERE version = ${sql(version)}::date AND source_hash <> ${sql(sourceHash)})
  THEN RAISE EXCEPTION 'KB_SEED_VERSION_IMMUTABLE'; END IF;
END $kb_guard$;
CREATE TEMP TABLE _kb_seed_entries (payload jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE _kb_seed_questions (id text PRIMARY KEY, entry_id text NOT NULL, kb text NOT NULL, question text NOT NULL, expected_norm text NOT NULL, is_canonical boolean NOT NULL, kb_version text NOT NULL) ON COMMIT DROP;`];
const entryBatchSize=50,questionBatchSize=250;
for(let i=0;i<payloads.length;i+=entryBatchSize)statements.push(`INSERT INTO _kb_seed_entries(payload) VALUES\n${payloads.slice(i,i+entryBatchSize).map(e=>`(${sql(JSON.stringify(e))}::jsonb)`).join(',\n')};`);
for(let i=0;i<questions.length;i+=questionBatchSize)statements.push(`INSERT INTO _kb_seed_questions VALUES\n${questions.slice(i,i+questionBatchSize).map(q=>`(${[q.id,q.entry_id,q.kb,q.question,q.question_norm].map(sql).join(',')},${q.is_canonical},${sql(version)})`).join(',\n')};`);
statements.push(`DO $kb_validate$ BEGIN
  IF EXISTS (SELECT 1 FROM _kb_seed_entries s JOIN public.kb_entries e ON e.id=s.payload->>'id' WHERE e.managed_by IS DISTINCT FROM 'fenasoja-kb-seed' OR e.kb<>s.payload->>'kb')
  THEN RAISE EXCEPTION 'KB_SEED_UNMANAGED_ID_COLLISION'; END IF;
  IF EXISTS (SELECT 1 FROM _kb_seed_questions WHERE public.kb_normalize(question)<>expected_norm) THEN RAISE EXCEPTION 'KB_SEED_NORMALIZER_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM _kb_seed_entries s CROSS JOIN LATERAL (
    SELECT s.payload->>'answer' AS text UNION ALL SELECT s.payload->>'canonical_question' UNION ALL SELECT s.payload->>'area_name'
    UNION ALL SELECT jsonb_array_elements_text(s.payload->'public_notes')
    UNION ALL SELECT source->>'label' FROM jsonb_array_elements(s.payload->'sources') source
  ) display WHERE public.ai_workers_redact_text(display.text) IS DISTINCT FROM display.text)
  THEN RAISE EXCEPTION 'KB_SEED_DISPLAY_SANITIZER_MISMATCH'; END IF;
END $kb_validate$;
INSERT INTO public.kb_entries (${columns.join(',')})
SELECT ${columns.map(c=>`r.${c}`).join(',')} FROM _kb_seed_entries s CROSS JOIN LATERAL jsonb_populate_record(NULL::public.kb_entries,s.payload) r
ON CONFLICT (id) DO UPDATE SET ${columns.filter(c=>c!=='id').map(c=>`${c}=EXCLUDED.${c}`).join(',')}, updated_at=now()
WHERE (${columns.filter(c=>c!=='id').map(c=>`kb_entries.${c}`).join(',')}) IS DISTINCT FROM (${columns.filter(c=>c!=='id').map(c=>`EXCLUDED.${c}`).join(',')});
INSERT INTO public.kb_questions (id,entry_id,kb,question,is_canonical,kb_version)
SELECT id,entry_id,kb,question,is_canonical,kb_version FROM _kb_seed_questions
ON CONFLICT (id) DO UPDATE SET entry_id=EXCLUDED.entry_id,kb=EXCLUDED.kb,question=EXCLUDED.question,is_canonical=EXCLUDED.is_canonical,kb_version=EXCLUDED.kb_version
WHERE (kb_questions.entry_id,kb_questions.kb,kb_questions.question,kb_questions.is_canonical,kb_questions.kb_version) IS DISTINCT FROM (EXCLUDED.entry_id,EXCLUDED.kb,EXCLUDED.question,EXCLUDED.is_canonical,EXCLUDED.kb_version);
DELETE FROM public.kb_questions q USING public.kb_entries e
WHERE q.entry_id=e.id AND e.managed_by='fenasoja-kb-seed' AND e.id IN (SELECT payload->>'id' FROM _kb_seed_entries)
AND q.kb_version<=${sql(version)} AND NOT EXISTS(SELECT 1 FROM _kb_seed_questions s WHERE s.id=q.id);`);
assert(Array.isArray(expected.retired_ids)&&new Set(expected.retired_ids).size===expected.retired_ids.length,'Invalid retired_ids');
for(const id of expected.retired_ids)assert(!ids.has(id)&&/^[A-Z][A-Z0-9-]{2,79}$/.test(id),'Retired ID still present or invalid');
if(expected.retired_ids.length)statements.push(`DELETE FROM public.kb_entries WHERE managed_by='fenasoja-kb-seed' AND kb_version<=${sql(version)} AND id IN (${expected.retired_ids.map(sql).join(',')});`);
statements.push(`DO $kb_counts$ BEGIN
${Object.entries(expected.expected).map(([kb,n])=>`  IF (SELECT count(*) FROM public.kb_entries WHERE managed_by='fenasoja-kb-seed' AND kb=${sql(kb)} AND kb_version=${sql(version)})<>${n.entries}
    OR (SELECT count(*) FROM public.kb_entries WHERE managed_by='fenasoja-kb-seed' AND kb=${sql(kb)})<>${n.entries}
    OR (SELECT count(*) FROM public.kb_questions q JOIN public.kb_entries e ON e.id=q.entry_id WHERE e.managed_by='fenasoja-kb-seed' AND q.kb=${sql(kb)} AND q.kb_version=${sql(version)})<>${n.questions}
  THEN RAISE EXCEPTION 'KB_SEED_COUNT_MISMATCH'; END IF;`).join('\n')}
  IF EXISTS (SELECT e.id FROM public.kb_entries e LEFT JOIN public.kb_questions q ON q.entry_id=e.id AND q.is_canonical WHERE e.managed_by='fenasoja-kb-seed' GROUP BY e.id HAVING count(q.id)<>1)
  THEN RAISE EXCEPTION 'KB_SEED_COUNT_MISMATCH'; END IF;
END $kb_counts$;
INSERT INTO workers_private.kb_seed_publications(version,source_hash,entry_count,question_count)
VALUES(${sql(version)}::date,${sql(sourceHash)},${entries.length},${questions.length}) ON CONFLICT(version) DO NOTHING;
ANALYZE public.kb_entries;
ANALYZE public.kb_questions;
COMMIT;\n`);
const editionsTs=`// Generated by scripts/kb/build-kb-seed.mjs from data/kb/editions.json. Do not edit.\nexport const KB_EDITIONS = ${JSON.stringify(calendar.editions.map(e=>({...e,date_conflict:e.divergences.length>0&&e.start_candidates.length>1,notes:e.divergences,sources:e.provenance.sources})),null,2)} as const;\nexport const KB_ABSENT_EDITIONS = ${JSON.stringify(calendar.absent_years,null,2)} as const;\n`;
const policiesTs=`// Generated by scripts/kb/build-kb-seed.mjs from data/kb/query-policies.json. Do not edit.\nexport const KB_QUERY_POLICIES = ${JSON.stringify(policies,null,2)} as const;\n`;
const normalizerTs=`// Generated by scripts/kb/build-kb-seed.mjs from scripts/kb/normalize-kb.mjs. Do not edit.\n${fs.readFileSync(path.join(root,'scripts/kb/normalize-kb.mjs'),'utf8').replace('normalizeKbQuestion(value)', 'normalizeKbQuestion(value: string): string')}`;
const outputs=new Map([[seedPath,statements.join('\n\n')],['supabase/functions/_shared/workers/kb-editions.ts',editionsTs],['supabase/functions/_shared/workers/kb-policies.ts',policiesTs],['supabase/functions/_shared/workers/kb-normalization.ts',normalizerTs]]);
const manifest={version,migration_stamp:stamp,normalizer_version:KB_NORMALIZER_VERSION,source_hash:sourceHash,expected_counts:expected.expected,
  totals:{entries:entries.length,questions:questions.length,unique_questions:collisionMap.size,source_occurrences:entries.reduce((n,e)=>n+e.sources.length,0),unique_source_urls:new Set(entries.flatMap(e=>e.sources.map(s=>s.url))).size},
  by_base:Object.fromEntries(['fenasoja','expandida'].map(kb=>{const es=entries.filter(e=>e.kb===kb);return[kb,{entries:es.length,questions:questions.filter(q=>q.kb===kb).length,status:count(es,'status'),kind:count(es,'kind'),area:count(es,'area'),area_questions:Object.fromEntries([...new Set(es.map(e=>e.area))].sort().map(area=>[area,es.filter(e=>e.area===area).reduce((sum,e)=>sum+1+e.variants.length,0)])),source_occurrences:es.reduce((n,e)=>n+e.sources.length,0),unique_source_urls:new Set(es.flatMap(e=>e.sources.map(s=>s.url))).size}]})),
  editorial_changes:curation.changes.length,collisions_reviewed:policies.collisions.length,edition_records:calendar.editions.length,
  notes:['Source access dates are archive declarations unless explicitly rechecked in raw/factual-review.json.','The seven SIDRA moving-period endpoints were independently checked and pinned to 2025.','priority 1/2 does not replace score threshold rules.','Only explicit retired_ids can prune entries; obsolete variants can be removed only within the managed input IDs.'],
  inputs:[...rawInputs,...inputs],outputs:[...outputs].map(([name,value])=>({name,sha256:hash(value),bytes:Buffer.byteLength(value)})),publication:{transactional:true,files:1,entry_batches:Math.ceil(entries.length/entryBatchSize),question_batches:Math.ceil(questions.length/questionBatchSize),entry_batch_size:entryBatchSize,question_batch_size:questionBatchSize}};
outputs.set('data/kb/manifest.json',json(manifest));
for(const [relative,content]of outputs){
  const target=path.join(root,relative);const exists=fs.existsSync(target);const previous=exists?fs.readFileSync(target,'utf8'):null;
  if(checking)assert(previous===content,`KB_GENERATED_OUTPUT_STALE ${relative}`);
  else if(relative===seedPath&&exists)assert(previous===content,'KB_MIGRATION_IMMUTABLE: use a new version and a new timestamp; never overwrite a published migration');
}
if(!checking)for(const [relative,content]of outputs){const target=path.join(root,relative);if(relative===seedPath&&fs.existsSync(target))continue;fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
console.log(JSON.stringify({mode:checking?'check':'generate',version,entries:entries.length,questions:questions.length,collisions:policies.collisions.length,seed:seedPath,sha256:hash(outputs.get(seedPath))}));
