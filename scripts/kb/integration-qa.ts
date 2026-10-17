import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createKbTestDb, KB_DB_IDENTITIES, setKbTestIdentity } from './db-fixture.mjs';
import { interpretKbQuery, searchKnowledgeBase, type KbSelection } from '../../supabase/functions/_shared/workers/knowledge-base.ts';
import { runWorkerTurn, type WorkerTurnDependencies } from '../../supabase/functions/_shared/workers/engine.ts';
import { decodeWorkerResponse, validateWorkerResponseCitations } from '../../supabase/functions/_shared/workers/response-contract.ts';
import type { WorkerRequest, WorkerCitation } from '../../supabase/functions/_shared/workers/contracts.ts';

const native = process.argv.includes('--pg-module');
assert.notEqual(native, process.argv.includes('--pglite-module'), 'Supply exactly one local runtime: --pg-module or --pglite-module');
const runtime = process.argv[process.argv.indexOf(native ? '--pg-module' : '--pglite-module') + 1];
assert.ok(runtime, 'Supply the absolute local runtime module path');
const now = new Date('2026-10-17T15:00:00Z');
const cases: Array<[string, string | null]> = [
  ['Quem foi o presidente da Fenasoja 2024?', 'ED24-PRES'],
  ['Qual edição da Fenasoja teve o maior público?', 'REC-001'],
  ['Quando foi a décima Fenasoja?', 'ED10-DATAS'],
  ['Quem presidiu a 10ª edição?', 'ED10-PRES'],
  ['Quem presidiu a oitava Fenasoja?', 'HIS-013'],
  ['Quem presidiu a Fenasoja 1990?', 'HIS-013'],
  ['Quem foi o vice-presidente da Fenasoja 2026?', 'ED25-VICE'],
  ['Quanto dinheiro tem o Plano Safra 2025/26?', 'MERC-PS-002'],
  ['Quanto tem o Plano Safra da Agricultura Familiar 2025/2026?', 'MERC-PS-005'],
  ['Quanto tem o Pronaf esse ano?', null],
  ['Qual o percentual de Reserva Legal no RS?', 'SUST-LEG-004'],
  ['Quem é o presidente da Fenasoja?', 'F28-002'],
  ['Quem será o presidente da Fenasoja 2030?', 'F28-003'],
  ['Qual o preço da soja hoje?', 'MERC-DYN-001'],
  ['Qual foi o volume de negócios da Fenasoja 2018?', 'ED22-NEG'],
  ['Qual foi o público da Fenasoja 1966?', 'ED01-PUB'],
  ['Quando foi a Fenasoja 2024?', 'ED24-DATAS'],
  ['Teve Fenasoja em 2020?', 'GER-006'],
  ['Quanto custa o estacionamento da próxima Fenasoja?', 'FAQ-GER-004'],
  ['Qual a altura de pastejo para ovelhas?', 'clarification'],
  ['Quantos lotes vendemos em 2026?', null],
  ['Quais eventos tenho amanhã na agenda?', null],
  ['O que é Pix?', 'TEC-WK-0041'],
  ['Quem será o presidente da Fenasoja seguinte à de 2026?', 'F28-002'],
  ['Quem foi a primeira mulher presidente da Fenasoja?', 'HIS-009'],
  ['Qual é a população de Santa Rosa em 1990?', null],
  ['Qual é a população de Santa Rosa em 2025?', 'SR-002'],
  ['Quanto tem o Plano Safra da Agricultura Familiar em 2024?', 'clarification'],
  ['Qual o PIB do Rio Grande do Sul em 2022?', null],
  ['Qual o PIB do Rio Grande do Sul?', null],
  ['Quem não foi o presidente da Fenasoja 2024?', 'clarification'],
  ['Quem presidiu a 10ª e a 11ª edição?', 'clarification'],
  ['Quem presidiu a décima e a décima primeira Fenasoja?', 'clarification'],
  ['2028', null],
  ['Refiro-me à Fenasoja 2028', null],
  ['início da gestação', null],
  ['Por que a Fenasoja não aconteceu em 2020?', 'GER-006'],
  ['Quantos habitantes tem Alegria em 2025?', null],
  ['Quantos habitantes tem Alegria em 2022?', 'RS-IBGE-POP-4300455'],
  ['Quando ocorreu a Fenasoja?', 'ED25-DATAS'],
  ['Quem presidia a Fenasoja?', 'ED25-PRES'],
  ['Quantos habitantes?', 'clarification'],
];
const db = await createKbTestDb(runtime, native ? { engine: 'postgres' } : {});
const checks: unknown[] = [], failures: unknown[] = [];
let closed = false;
try {
  await setKbTestIdentity(db);
  const rpc = async (_name: string, args: Record<string, unknown>) => (await db.query('SELECT * FROM public.workers_search_kb($1,$2,$3,$4,$5)', [args._query,args._edition_year,args._kb,args._limit,JSON.stringify(args._context)])).rows;
  const selections = new Map<string, KbSelection | null>();
  for (const [message, expected] of cases) {
    const start = performance.now();
    const selection = await searchKnowledgeBase(rpc, message, now);
    const actual = selection?.type === 'answer' ? selection.hit.entry_id : selection?.type ?? null;
    selections.set(message, selection);
    const item = { question: message, expected, actual, score: selection?.type === 'answer' ? selection.hit.score : null, milliseconds: Number((performance.now()-start).toFixed(2)), passed: actual === expected };
    checks.push(item); if (!item.passed) {
      const q=interpretKbQuery(message,now);
      failures.push({ ...item, context:q, candidates: await rpc('workers_search_kb',{_query:q.searchText,_edition_year:q.editionYear??null,_kb:null,_limit:3,_context:{subject:q.subject,role:q.role,audience:q.audience,reference_period:q.referencePeriod,reference_year:q.referenceYear,attribute:q.attribute,entity_name:q.entityName,as_of:q.today,temporal_mode:q.temporalMode,comparative:q.comparative}}).then(rows=>rows.map(row=>({id:row.entry_id,score:row.score,question:row.matched_question}))) });
    }
  }
  let counter=100;
  for (const message of ['Quem foi o presidente da Fenasoja 2024?', 'Qual foi o volume de negócios da Fenasoja 2018?', 'Qual foi o público da Fenasoja 1966?', 'Qual o preço da soja hoje?', 'Qual a altura de pastejo para ovelhas?', 'Quem será o presidente da Fenasoja seguinte à de 2026?', 'Quem foi a primeira mulher presidente da Fenasoja?', 'Quanto tem o Plano Safra da Agricultura Familiar em 2024?', 'Qual o PIB do Rio Grande do Sul em 2022?']) {
    const request: WorkerRequest = { orgId:KB_DB_IDENTITIES.org,requestId:`90000000-0000-4000-8000-${String(counter++).padStart(12,'0')}`,worker:'mapa',message };
    const miss = message === 'Qual o PIB do Rio Grande do Sul em 2022?';
    if (miss) {
      // A second authorized fixture actor keeps the existing eight-turn rate
      // limit intact; no persisted timestamps or application limits are edited.
      await db.exec('RESET ROLE');
      await db.query('INSERT INTO public.org_members(org_id,user_id,is_active) VALUES($1,$2,true)',[KB_DB_IDENTITIES.org,KB_DB_IDENTITIES.other]);
      await setKbTestIdentity(db,KB_DB_IDENTITIES.other);
    }
    let providerCalls = 0;
    const forbidden = async () => { throw new Error('A deterministic KB turn called model/app/web/planner'); };
    const events: Array<{event:string; data:unknown}> = [];
    const deps: WorkerTurnDependencies = {
      // The miss fixture simulates only planner accounting: no fabricated tool
      // evidence, model-generated answer or business data enters persistence.
      provider:{model:miss?'test/fallback-accounting':'test/never-called',complete:miss?async()=>{providerCalls++;return {calls:[],inputTokens:31,outputTokens:7,usageReported:true};}:forbidden},
      listTools:miss?async()=>[{name:'list_events',description:'Fixture de consulta autorizada',readOnly:true,inputJsonSchema:{type:'object'}}]:forbidden,
      executeTool:forbidden,searchWeb:forbidden,institutionalPresident:forbidden,
      now:()=>now,searchKb:(text,date)=>searchKnowledgeBase(rpc,text,date),
      begin:async(value,worker)=>(await db.query('SELECT public.ai_workers_begin_turn($1,$2,$3,$4) AS value',[value.orgId,value.requestId,worker,value.message])).rows[0].value,
      finish:async(value,completion)=>{await db.query('SELECT public.ai_workers_finish_turn($1,$2,$3,$4::jsonb,$5,$6,$7,$8::text[],$9)',[value.orgId,value.requestId,completion.content,JSON.stringify(completion.citations),completion.model,completion.inputTokens,completion.outputTokens,completion.tools,completion.usageComplete]);},
      fail:async value=>{await db.query('SELECT public.ai_workers_fail_turn($1,$2)',[value.orgId,value.requestId]);},
      logKb:async(value,selection)=>{await db.query('SELECT public.workers_log_kb_answer($1,$2,$3,$4,$5,$6)',[value.orgId,value.requestId,selection?.type==='answer'?selection.hit.entry_id:null,selection?.type==='answer'?selection.hit.score:null,selection?.outcome??'miss',selection?.type==='answer'?selection.hit.kb_version:null]);},
    };
    try {
      await runWorkerTurn(request,deps,(event,data)=>events.push({event,data}));
      const stored=(await db.query("SELECT content,citations,state,worker_id FROM public.ai_messages WHERE request_id=$1 AND role='assistant'",[request.requestId])).rows[0];
      assert.equal(stored.state,'complete'); assert.equal(stored.worker_id,'mapa');
      const document=decodeWorkerResponse(stored.content)!; assert.ok(document, JSON.stringify(stored)); assert.equal(document.worker,'mapa');
      validateWorkerResponseCitations(document,stored.citations as WorkerCitation[]);
      const telemetry=(await db.query('SELECT * FROM public.kb_answer_events WHERE request_id=$1',[request.requestId])).rows;
      assert.equal(telemetry.length,1);
      const usage=(await db.query('SELECT input_tokens,output_tokens,model FROM public.ai_usage WHERE request_id=$1',[request.requestId])).rows[0];
      assert.equal(usage.input_tokens,miss?31:0);assert.equal(usage.output_tokens,miss?7:0);
      if (miss) {
        assert.equal(usage.model,'test/fallback-accounting'); assert.equal(providerCalls,1);
        assert.notEqual(document.intent,'knowledge_base'); assert.equal(stored.citations.length,0);
        assert.equal(telemetry[0].outcome,'miss'); assert.equal(telemetry[0].user_id,KB_DB_IDENTITIES.other);
        for (const field of ['entry_id','kb','status','score','kb_version']) assert.equal(telemetry[0][field],null);
        assert.deepEqual(Object.keys(telemetry[0]).sort(),['id','created_at','org_id','user_id','request_id','entry_id','kb','status','score','outcome','kb_version'].sort());
        assert.ok(!JSON.stringify(telemetry[0]).includes(message));
      } else assert.match(usage.model,/^deterministic\/kb\./);
      const audit=(await db.query('SELECT event,tool_name FROM public.ai_audit_events WHERE request_id=$1',[request.requestId])).rows;
      assert.ok(audit.some(item=>item.event==='tool_completed'&&item.tool_name==='workers_search_kb'));assert.ok(audit.some(item=>item.event==='turn_completed'));
      assert.ok(events.some(item=>item.event==='done'));
      // Re-admitting the same request loads persisted content; it must not consult or log twice.
      await runWorkerTurn(request,{...deps,searchKb:forbidden,logKb:forbidden},()=>{});
      assert.equal(providerCalls,miss?1:0);
      checks.push({integration:message,persistence:true,reopen:true,usage:true,audit:true,telemetry:true,noModel:!miss,...(miss?{outcome:'miss',stubProviderCalls:providerCalls,inputTokens:31,outputTokens:7,noBusinessData:true}:{}),passed:true});
    }catch(error){failures.push({integration:message,error:error instanceof Error?error.message:String(error)});}
  }
  await db.close(); closed = true;
  const output={environment:native ? 'local loopback PostgreSQL 16; randomly named temporary database; real schema, full seed, SQL search, server engine and persistence; synthetic auth claims; no remote JWT or project database'
    : 'isolated PGlite PostgreSQL; real schema, full seed, SQL search, server engine and persistence; synthetic auth claims; no remote JWT',
    ...(native ? { nativeDatabase: db.qaInfo } : {}),now:now.toISOString(),checks,failures,passed:failures.length===0};
  await fs.mkdir('docs/kb/evidence',{recursive:true});await fs.writeFile(`docs/kb/evidence/${native ? 'integration-pg-qa' : 'integration-qa'}.json`,JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output,null,2));
  assert.equal(failures.length,0,'KB integration matrix failed');
} finally {if (!closed) await db.close();}
