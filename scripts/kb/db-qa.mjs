#!/usr/bin/env node
// Isolated PostgreSQL WASM integration; supplied runtime is outside project deps.
// Usage: node scripts/kb/db-qa.mjs --pglite <absolute path to pglite/dist>
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';

const runtime = process.argv[process.argv.indexOf('--pglite') + 1];
if (!process.argv.includes('--pglite') || !path.isAbsolute(runtime)) throw new Error('Pass --pglite <absolute runtime dist directory>');
const { PGlite } = await import(pathToFileURL(path.join(runtime, 'index.js')));
const { pg_trgm } = await import(pathToFileURL(path.join(runtime, 'contrib/pg_trgm.js')));
const { unaccent } = await import(pathToFileURL(path.join(runtime, 'contrib/unaccent.js')));
const db = new PGlite({ extensions: { pg_trgm, unaccent } });
const results = { environment: 'Isolated PostgreSQL WASM, real roles/RLS with simulated auth.uid claims; no remote JWT or production access', checks: [], measurements: [] };
const check = (name, value) => { assert.ok(value, name); results.checks.push({ name, result: 'OK' }); console.log('OK:',name); };
const sql = async (query, args = []) => (await db.query(query, args)).rows;
const read = (file) => fs.readFile(file, 'utf8');
const org = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const auth = async (id = actor, role = 'authenticated') => {
  await db.exec('RESET ROLE');
  await sql("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`SET ROLE ${role}`);
};
const rejected = async (name, query, args = [], pattern = /./) => {
  let failure;
  try { await sql(query, args); } catch (error) { failure = error; }
  check(name, failure && pattern.test(failure.message));
};

try {
  results.postgres = (await sql('SELECT version() version'))[0].version;
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.org_members(org_id uuid,user_id uuid,is_active boolean);
    INSERT INTO public.organizations VALUES('${org}');
    INSERT INTO public.org_members VALUES('${org}','${actor}',true);
    CREATE SCHEMA workers_private;`);
  for (const file of [
    '20261016120000_workers_readonly_workspace.sql',
    '20261017030000_workers_response_persistence.sql',
    '20261017060000_workers_identity_responses.sql',
    '20261017070000_workers_knowledge_base.sql',
  ]) { try { const migration=await read(`supabase/migrations/${file}`);await db.exec(migration);if(file==='20261017070000_workers_knowledge_base.sql')results.schema_sha256=createHash('sha256').update(migration).digest('hex'); } catch(error) { console.error(file, 'position', error.position, (await read(`supabase/migrations/${file}`)).slice(Number(error.position)-100,Number(error.position)+120)); throw error; } }
  check('schema and unchanged current sanitizers applied', true);
  const seedNames = (await fs.readdir('supabase/migrations')).filter((file) => /workers_kb_seed.*\.sql$/.test(file)).sort();
  const seedTexts = await Promise.all(seedNames.map(file=>read(`supabase/migrations/${file}`)));
  results.seed_hashes = seedNames.map((name,i)=>({name,sha256:createHash('sha256').update(seedTexts[i]).digest('hex')}));
  if (seedNames.length) {
    console.log('Applying complete seed snapshot...');
    const seedStarted=performance.now();
    for (const text of seedTexts) await db.exec(text);
    results.seed_apply_ms=Math.round(performance.now()-seedStarted);
    console.log(`Seed applied in ${results.seed_apply_ms} ms; checking repeat application...`);
    check('all generated seed migrations applied', true);
    const counts = await sql('SELECT kb,count(*)::int entries,(SELECT count(*)::int FROM public.kb_questions q WHERE q.kb=e.kb) questions FROM public.kb_entries e GROUP BY kb ORDER BY kb');
    assert.deepEqual(counts, [{ kb: 'expandida', entries: 2414, questions: 10889 }, { kb: 'fenasoja', entries: 372, questions: 1245 }]);
    results.counts = counts;
    check('2786 entries / 12134 question occurrences', true);
    for (const text of seedTexts) await db.exec(text);
    check('same seed version reapplies idempotently', true);
    const redacted = await sql('SELECT id FROM public.kb_entries WHERE public.ai_workers_redact_text(answer)<>answer');
    check(`all final answers unchanged by SQL redactor (${redacted.map((row) => row.id).join(',')})`, redacted.length === 0);
    const reviewedTexts = await sql(`SELECT e.id,field FROM public.kb_entries e CROSS JOIN LATERAL (
      SELECT 'note' field,value#>>'{}' value FROM jsonb_array_elements(e.public_notes)
      UNION ALL SELECT 'source label',value->>'label' FROM jsonb_array_elements(e.sources)
      UNION ALL SELECT 'area',e.area_name
    ) display WHERE value IS NOT NULL AND (char_length(value)>1200 OR (value~'[<>]' OR strpos(value,chr(96))>0) OR public.ai_workers_redact_text(value)<>value)`);
    check(`all public notes/labels/areas unchanged by redactor (${reviewedTexts.slice(0,5).map(row=>row.id+':'+row.field)})`,reviewedTexts.length===0);
    const documents = (await sql('SELECT * FROM public.kb_entries ORDER BY id')).map((entry)=>{
      const citations=entry.status==='sem_fonte'?[]:entry.sources.filter(source=>source.label&&source.accessed).slice(0,3).map(source=>({label:source.label,url:source.url,source:'kb',date:source.accessed}));
      const doc={version:1,worker:'radar',intent:'knowledge_base',summary:entry.answer,metadata:{organizationId:org,timezone:'America/Sao_Paulo',scope:'Base de conhecimento pública da Fenasoja',updatedAt:'2026-10-17T15:00:00Z',completeness:entry.status==='sem_fonte'?'unavailable':entry.status==='confirmado'?'complete':'partial',notes:entry.public_notes},blocks:citations.length?[{type:'sources',items:citations}]:[{type:'empty',message:'Esta informação não está confirmada nas fontes oficiais consultadas.'}]};
      return {id:entry.id,content:'```fenasoja-response\n'+JSON.stringify(doc)+'\n```',citations,summary:entry.answer};
    });
    const sanitized = await sql(`SELECT item->>'id' id,workers_private.sanitize_response_content(item->>'content',$2::uuid,item->'citations') content FROM jsonb_array_elements($1::jsonb) item`,[JSON.stringify(documents),org]);
    check('all 2786 response documents pass current SQL sanitizers with literal summary',sanitized.every((row,i)=>JSON.parse(row.content.slice(21,-4)).summary===documents[i].summary));
    const normalizationPath = path.resolve('scripts/kb/normalize-kb.mjs');
    try {
      const { normalizeKbQuestion } = await import(pathToFileURL(normalizationPath));
      if (normalizeKbQuestion) {
        const questions = await sql('SELECT id,question,question_norm FROM public.kb_questions');
        const mismatch = questions.filter((row) => normalizeKbQuestion(row.question) !== row.question_norm);
        check(`SQL and generator normalizer agree for all occurrences (${mismatch.slice(0,5).map(row=>row.id)})`, mismatch.length === 0);
      }
    } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  } else {
    await db.exec('BEGIN');
    await sql(`INSERT INTO public.kb_entries(id,kb,area,area_name,canonical_question,answer,kind,status,priority,kb_version,context,sources)
      VALUES('QA-ENTRY','fenasoja','INSTITUCIONAL','Fenasoja','Quem foi o presidente?','Resposta pública revisada.','fato','confirmado',1,'2026-10-17',
      '{"scope":"general","subject":"fenasoja","edition_required":false}', '[{"url":"https://fenasoja.com.br/edicoes/","label":"Fenasoja · edições","accessed":"2026-10-17"}]')`);
    await sql("INSERT INTO public.kb_questions(id,entry_id,kb,question,is_canonical,kb_version) VALUES('QA-ENTRY#0','QA-ENTRY','fenasoja','Quem foi o presidente?',true,'2026-10-17')");
    await db.exec('COMMIT');
  }
  const entry = (await sql("SELECT * FROM public.kb_entries WHERE status='confirmado' ORDER BY id LIMIT 1"))[0];
  await rejected('canonical cannot be removed without replacement','UPDATE public.kb_questions SET is_canonical=false WHERE entry_id=$1 AND is_canonical',[entry.id],/KB_CANONICAL_QUESTION_REQUIRED/);
  const sources = entry.sources.filter((source) => source.label && source.accessed && source.url.startsWith('https://')).slice(0,3).map((source) => ({ label: source.label, url: source.url, source: 'kb', date: source.accessed }));
  const document = { version: 1, worker: 'radar', intent: 'knowledge_base', summary: entry.answer, metadata: { organizationId: org, timezone: 'America/Sao_Paulo', scope: 'Base de conhecimento pública da Fenasoja', updatedAt: '2026-10-17T15:00:00.000Z', completeness: 'complete', notes: [] }, blocks: [{ type: 'sources', items: sources }] };
  const content = () => '```fenasoja-response\n' + JSON.stringify(document) + '\n```';
  const withSources = (items) => '```fenasoja-response\n' + JSON.stringify({ ...document, blocks:[{type:'sources',items}] }) + '\n```';
  const model = `deterministic/kb.${entry.kb_version}.${entry.id}`;
  await auth();
  if(seedTexts.length){
    const smoke=await db.exec(await read('scripts/kb/kb-smoke.sql'));
    const cases=smoke.flatMap(result=>result.rows).filter(row=>row.result);
    results.smoke=cases;
    check(`smoke cases all pass (${cases.filter(row=>row.result!=='OK').map(row=>row.check_name)})`,cases.every(row=>row.result==='OK'));
  }
  check('authenticated public content readable', (await sql('SELECT count(*)::int count FROM public.kb_entries'))[0].count > 0);
  check('search groups distinct entries', new Set((await sql('SELECT * FROM public.workers_search_kb($1)', [entry.canonical_question])).map(row=>row.entry_id)).size > 0);
  if(seedTexts.length){
    check('default RPC context preserves explicit text edition candidates',(await sql("SELECT * FROM public.workers_search_kb('Quem foi o presidente da Fenasoja 2024?',NULL,'fenasoja',3)")).some(row=>row.entry_id==='ED24-PRES'));
    check('current request without known edition cannot recycle edition facts',(await sql("SELECT * FROM public.workers_search_kb('Quando será a próxima Fenasoja?',NULL,NULL,5,'{\"temporal_mode\":\"current\",\"subject\":\"fenasoja\"}')")).every(row=>row.context.edition_required===false));
    const contextualSearch=(query,context)=>sql('SELECT * FROM public.workers_search_kb($1,NULL,NULL,3,$2::jsonb)',[query,JSON.stringify(context)]);
    check('population in absent 1990 period cannot return 2025 data',(await contextualSearch('Qual a população de Santa Rosa em 1990?',{subject:'regional',attribute:'population',reference_year:1990})).length===0);
    check('GDP in 2022 cannot return general geography',(await contextualSearch('Qual era o PIB do Rio Grande do Sul em 2022?',{subject:'regional',attribute:'gdp',reference_year:2022})).length===0);
    check('explicit absent Plano Safra period cannot fall back to general or dynamic',(await contextualSearch('Quanto tem o Plano Safra da Agricultura Familiar 2024/2025?',{subject:'plano_safra',audience:'familiar',reference_period:'2024/2025'})).length===0);
    const population2025=await contextualSearch('Quantos habitantes tem Santa Rosa?',{subject:'regional',attribute:'population',reference_year:2025});
    check('matching population period retained before candidate cut',population2025.some(row=>row.entry_id==='SR-002')&&population2025.every(row=>row.context.reference_period.split(/\D+/).includes('2025')));
    const women=await contextualSearch('Qual mulher já presidiu a Fenasoja?',{subject:'fenasoja',attribute:'female_president',comparative:true,role:'president'});
    check('female presidency keeps the relevant historical entry',women.some(row=>row.entry_id==='HIS-009')&&women.every(row=>/mulher|feminina/i.test(row.canonical_question)));
    const mayor=await contextualSearch('Quem é o prefeito de Santa Rosa?',{subject:'regional',attribute:'mayor',reference_year:2025});
    check('mayor role and explicit reference period remain eligible',mayor.some(row=>row.entry_id==='SR-004')&&mayor.every(row=>/prefeit/i.test(row.canonical_question)));
    check('uncovered municipality/year cannot borrow Santa Rosa population',(await contextualSearch('Quantos habitantes tem Alegria em 2025?',{attribute:'population',entity_name:'alegria',reference_year:2025})).length===0);
    check('exact municipality with covered year survives before candidate cut',(await contextualSearch('Quantos habitantes tem Alegria em 2022?',{attribute:'population',entity_name:'alegria',reference_year:2022})).some(row=>row.entry_id==='RS-IBGE-POP-4300455'));
    check('unknown municipality does not receive another city population',(await contextualSearch('Quantos habitantes tem Porto Alegre em 2025?',{attribute:'population',entity_name:'porto alegre',reference_year:2025})).length===0);
    check('matching mayor municipality remains eligible',(await contextualSearch('Quem é o prefeito de Santa Rosa?',{attribute:'mayor',entity_name:'santa rosa',reference_year:2025})).some(row=>row.entry_id==='SR-004'));
  }
  await rejected('direct DML denied', 'UPDATE public.kb_entries SET answer=answer');
  await rejected('oversized query rejected', 'SELECT * FROM public.workers_search_kb($1)', ['a'.repeat(501)], /KB_INVALID_QUERY/);
  await rejected('invalid limit rejected', 'SELECT * FROM public.workers_search_kb($1,NULL,NULL,6)', ['pergunta'], /KB_INVALID_QUERY/);
  await rejected('unknown factual attribute rejected','SELECT * FROM public.workers_search_kb($1,NULL,NULL,3,$2::jsonb)',['pergunta',JSON.stringify({attribute:'unreviewed'})],/KB_INVALID_QUERY/);
  await rejected('noncanonical municipality name rejected','SELECT * FROM public.workers_search_kb($1,NULL,NULL,3,$2::jsonb)',['pergunta',JSON.stringify({entity_name:'Santa Rosa'})],/KB_INVALID_QUERY/);
  for(const referenceYear of [1799,2101,2025.5,'2025',null])await rejected(`invalid reference year ${JSON.stringify(referenceYear)} rejected`,'SELECT * FROM public.workers_search_kb($1,NULL,NULL,3,$2::jsonb)',['pergunta',JSON.stringify({reference_year:referenceYear})],/KB_INVALID_QUERY/);
  check('empty normalized query has no matches',(await sql('SELECT * FROM public.workers_search_kb($1)',['???'])).length===0);
  check('unsafe source URL variants rejected',(await sql("SELECT bool_and(NOT public.kb_public_source_url(url)) ok FROM unnest(ARRAY['https://127.0.0.1/path','https://[::1]/','https://user:pass@fenasoja.com.br/','https://fenasoja.com.br:444/','https://fenasoja.com.br/%61reas/x','https://fenasoja.com.br/?access_token=x','https://fenasoja.com.br/?api%5fkey=x','https://fenasoja.com.br/%GG']) url"))[0].ok);
  const request = randomUUID();
  await sql('SELECT public.ai_workers_begin_turn($1,$2,$3,$4)', [org,request,'radar','Pergunta pública de teste']);
  await rejected('log before successful finish rejected', 'SELECT public.workers_log_kb_answer($1,$2,$3,$4,$5,$6)', [org,request,entry.id,1,'answered',entry.kb_version], /KB_TURN_NOT_COMPLETE/);
  const finish = 'SELECT public.ai_workers_finish_turn($1,$2,$3,$4::jsonb,$5,0,0,ARRAY[\'workers_search_kb\'])';
  const unregisteredSources=[{...sources[0],url:'https://example.org/unknown'}];
  const invalidDateSources=[{...sources[0],date:'2026-02-30'}];
  const sourceFreeKb='```fenasoja-response\n'+JSON.stringify({...document,blocks:[]})+'\n```';
  await rejected('KB document requires deterministic model even without citations',finish,[org,request,sourceFreeKb,'[]','google/gemini-2.5-flash'],/KB_INVALID_RESPONSE/);
  await rejected('unregistered citation with matching block rejected', finish, [org,request,withSources(unregisteredSources),JSON.stringify(unregisteredSources),model], /WORKERS_INVALID_CITATION/);
  await rejected('invalid civil date with matching block rejected', finish, [org,request,withSources(invalidDateSources),JSON.stringify(invalidDateSources),model], /WORKERS_INVALID_CITATION/);
  await rejected('source block mismatch rejected',finish,[org,request,content(),JSON.stringify(unregisteredSources),model],/WORKERS_INVALID_RESPONSE_SOURCE/);
  await rejected('version swapped before completion rejected', finish, [org,request,content(),JSON.stringify(sources),`deterministic/kb.2026-10-16.${entry.id}`], /KB_VERSION_CHANGED/);
  await sql(finish,[org,request,content(),JSON.stringify(sources),model]);
  await sql(finish,[org,request,content(),JSON.stringify(sources),model]);
  const persisted = (await sql("SELECT content,citations,state FROM public.ai_messages WHERE request_id=$1 AND role='assistant'",[request]))[0];
  check('persisted complete and citation dates retained', persisted.state==='complete' && (assert.deepEqual(persisted.citations,sources),true));
  const persistedDoc=JSON.parse(persisted.content.slice(21,-4));
  check('reopened summary and sources equal reviewed response',persistedDoc.summary===entry.answer && (assert.deepEqual(persistedDoc.blocks[0].items,sources),true));
  check('central usage remains 0/0 and idempotent', (await sql('SELECT * FROM public.ai_usage WHERE request_id=$1',[request])).length===1);
  check('central audit records tool and turn completed once',(await sql("SELECT event,tool_name FROM public.ai_audit_events WHERE request_id=$1 AND event IN('turn_completed','tool_completed')",[request])).length===2);
  await sql('SELECT public.workers_log_kb_answer($1,$2,$3,$4,$5,$6)',[org,request,entry.id,1,'answered',entry.kb_version]);
  await sql('SELECT public.workers_log_kb_answer($1,$2,$3,$4,$5,$6)',[org,request,entry.id,1,'answered',entry.kb_version]);
  check('telemetry idempotent',(await sql('SELECT * FROM public.kb_answer_events')).length===1);
  await auth(other);
  check('other authenticated account can read public KB',(await sql('SELECT count(*)::int count FROM public.kb_entries'))[0].count>0);
  check('other account cannot read usage event',(await sql('SELECT * FROM public.kb_answer_events')).length===0);
  await rejected('other organization/user log denied','SELECT public.workers_log_kb_answer($1,$2,NULL,NULL,$3)',[org,request,'miss'],/WORKERS_FORBIDDEN/);
  await auth('','anon');
  await rejected('anon content access denied','SELECT * FROM public.kb_entries');
  await rejected('anon RPC denied','SELECT * FROM public.workers_search_kb($1)',['Fenasoja']);
  await auth();
  for(const query of ['Quem foi o presidente da Fenasoja 2024?','Qual o preço da soja hoje?','Qual o percentual de Reserva Legal no RS?']) {
    const timings=[];
    for(let i=0;i<7;i++) { const started=performance.now();await sql('SELECT * FROM public.workers_search_kb($1)',[query]);timings.push(performance.now()-started); }
    timings.sort((a,b)=>a-b);
    results.measurements.push({query,engine:'local WASM',median_ms:Number(timings[3].toFixed(2)),p95_ms:Number(timings[6].toFixed(2)),explain:await sql('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM public.workers_search_kb($1)',[query]),index_explain:await sql('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT q.id FROM public.kb_questions q WHERE q.question_norm OPERATOR(extensions.%) public.kb_normalize($1)',[query])});
  }
  const laterRequest=randomUUID();
  await sql('SELECT public.ai_workers_begin_turn($1,$2,$3,$4)', [org,laterRequest,'radar','Pergunta pública de teste']);
  await sql(finish,[org,laterRequest,content(),JSON.stringify(sources),model]);
  await db.exec('RESET ROLE');
  await sql('UPDATE public.kb_entries SET kb_version=$1 WHERE id=$2',['2026-10-18',entry.id]);
  check('base update preserves prior event',(await sql('SELECT * FROM public.kb_answer_events')).length===1);
  await auth();
  await rejected('version swapped after finish produces observable auxiliary failure','SELECT public.workers_log_kb_answer($1,$2,$3,$4,$5,$6)',[org,laterRequest,entry.id,1,'answered',entry.kb_version],/KB_VERSION_CHANGED/);
  await db.exec('RESET ROLE');
  if(seedTexts.length) {
    let failure;
    try {await db.exec(seedTexts[0]);}catch(error){failure=error;await db.exec('ROLLBACK');}
    check('older seed cannot downgrade newer managed entry',failure?.message.includes('KB_SEED_VERSION_DOWNGRADE'));
  }
  await sql('DELETE FROM public.kb_entries WHERE id=$1',[entry.id]);
  check('entry retirement preserves prior event',(await sql('SELECT * FROM public.kb_answer_events')).length===1);
  const semFonte=(await sql("SELECT * FROM public.kb_entries WHERE status='sem_fonte' LIMIT 1"))[0];
  if(semFonte){
    await rejected('incompatible persisted answer rejected','UPDATE public.kb_entries SET answer=$1 WHERE id=$2',['texto > inválido',semFonte.id],/check constraint/);
    await auth();
    const semRequest=randomUUID();
    await sql('SELECT public.ai_workers_begin_turn($1,$2,$3,$4)',[org,semRequest,'radar','Consulta sem confirmação']);
    const semDoc={...document,summary:semFonte.answer,metadata:{...document.metadata,completeness:'unavailable'},blocks:[{type:'empty',message:'Esta informação não está confirmada nas fontes oficiais consultadas.'}]};
    await sql(finish,[org,semRequest,'```fenasoja-response\n'+JSON.stringify(semDoc)+'\n```','[]',`deterministic/kb.${semFonte.kb_version}.${semFonte.id}`]);
    await rejected('sem_fonte cannot log answered','SELECT public.workers_log_kb_answer($1,$2,$3,$4,$5,$6)',[org,semRequest,semFonte.id,1,'answered',semFonte.kb_version],/KB_INVALID_OUTCOME/);
    await sql('SELECT public.workers_log_kb_answer($1,$2,$3,$4,$5,$6)',[org,semRequest,semFonte.id,1,'not_confirmed',semFonte.kb_version]);
    check('sem_fonte persists and logs honestly without citations',(await sql("SELECT citations FROM public.ai_messages WHERE request_id=$1 AND role='assistant'",[semRequest]))[0].citations.length===0);
  }
  const legacyRequest=randomUUID();
  await sql('SELECT public.ai_workers_begin_turn($1,$2,$3,$4)',[org,legacyRequest,'radar','Consulta pelo fluxo anterior']);
  await sql("SELECT public.ai_workers_finish_turn($1,$2,$3,'[]'::jsonb,'google/gemini-2.5-flash',3,5,ARRAY[]::text[])",[org,legacyRequest,'Resposta do fluxo anterior.']);
  const legacy=(await sql("SELECT m.state,m.content,u.input_tokens,u.output_tokens FROM public.ai_messages m JOIN public.ai_usage u USING(request_id) WHERE m.request_id=$1 AND m.role='assistant'",[legacyRequest]))[0];
  check('legacy text completion and real token counters remain unchanged',legacy.state==='complete'&&legacy.content==='Resposta do fluxo anterior.'&&legacy.input_tokens===3&&legacy.output_tokens===5);
  const {createKbTestDb}=await import('./db-fixture.mjs');
  const existingExtensionsDb=await createKbTestDb(runtime,{seed:false,extensionSchema:'public'});
  try {
    const locations=(await existingExtensionsDb.query("SELECT e.extname,n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname IN('pg_trgm','unaccent') ORDER BY e.extname")).rows;
    check('preexisting extension schemas preserved',locations.length===2&&locations.every(row=>row.nspname==='public'));
    check('fixed dictionary works with preexisting public extension',(await existingExtensionsDb.query("SELECT public.kb_normalize('vigésima   primeira edição 1999/00') normalized")).rows[0].normalized==='21 edicao 1999 2000');
  }finally{await existingExtensionsDb.close();}
  await fs.mkdir('docs/kb/evidence',{recursive:true});
  await fs.writeFile('docs/kb/evidence/db-qa.json',JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({environment:results.environment,postgres:results.postgres,checks:results.checks,counts:results.counts,measurements:results.measurements.map(({explain,index_explain,...measurement})=>measurement)},null,2));
} catch(error) { console.error(error.message); if(error.detail)console.error(error.detail);process.exitCode=1; }
finally { await db.close(); }
