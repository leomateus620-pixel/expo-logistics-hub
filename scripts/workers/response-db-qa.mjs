/** Disposable PostgreSQL WASM with identified synthetic records. No .env or remote DB access. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = process.argv[process.argv.indexOf('--pglite-module') + 1];
if (!process.argv.includes('--pglite-module') || !path.isAbsolute(modulePath ?? '')) throw new Error('Supply absolute --pglite-module path.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const org = '10000000-0000-4000-8000-000000000001', user = '00000000-0000-4000-8000-000000000001';
const citations = [{ label: 'Publicação oficial', url: 'https://fenasoja.com.br/portal-oficial/geral/definidas-data-e-comissao-central-da-fenasoja-2028/', source: 'web', date: '2026-10-16' }];
const checks = [];
const envelope = () => ({ version: 1, worker: 'mapa', intent: 'map_sales', summary: 'Dados sintéticos para contato ana@example.com.', metadata: { organizationId: org, timezone: 'America/Sao_Paulo', scope: 'Dados sintéticos autorizados', updatedAt: '2026-10-16T22:00:00Z', completeness: 'complete', notes: [] }, blocks: [{ type: 'indicators', items: [{ label: 'Valor sintético', value: 12345678901, unit: 'BRL' }] }, { type: 'sources', items: citations }] });
const encode = document => '```fenasoja-response\n' + JSON.stringify(document) + '\n```';
async function sql(text, args = []) { return (await db.query(text, args)).rows; }
async function begin(n) {
  const requestId = `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await sql('SELECT public.ai_workers_begin_turn($1,$2,\'mapa\',\'Pergunta sintética\')', [org, requestId]);
  return requestId;
}
async function finish(id, content, sources = citations) {
  await sql('SELECT public.ai_workers_finish_turn($1,$2,$3,$4::jsonb,\'local/test\',0,0,ARRAY[\'map_sales_overview\'],true)', [org, id, content, JSON.stringify(sources)]);
}
async function fail(id) { await sql('SELECT public.ai_workers_fail_turn($1,$2)', [org, id]); }
async function check(name, run) { await run(); checks.push({ name, passed: true }); }
try {
  for (const file of ['scripts/workers/db-fixture.sql', 'supabase/migrations/20261016120000_workers_readonly_workspace.sql']) await db.exec(await fs.readFile(path.join(root, file), 'utf8'));
  await db.exec('CREATE SCHEMA workers_private');
  await db.exec(await fs.readFile(path.join(root, 'supabase/migrations/20261017030000_workers_response_persistence.sql'), 'utf8'));
  await db.exec(await fs.readFile(path.join(root, 'supabase/migrations/20261017060000_workers_identity_responses.sql'), 'utf8'));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',false);`);
  await check('numeric facts and validated institutional URLs survive persistence while textual personal data is redacted', async () => {
    const id = await begin(1); await finish(id, encode(envelope()));
    const stored = (await sql('SELECT content FROM ai_messages WHERE request_id=$1 AND role=\'assistant\'', [id]))[0].content;
    const decoded = JSON.parse(stored.slice(21, -4));
    assert.equal(decoded.blocks[0].items[0].value, 12345678901);
    assert.equal(decoded.blocks[1].items[0].url, citations[0].url);
    assert.equal(decoded.metadata.organizationId, org);
    assert.equal(decoded.metadata.updatedAt, '2026-10-16T22:00:00Z');
    assert.ok(!decoded.summary.includes('ana@example.com'));
    await finish(id, 'Overwriting would violate idempotency');
    assert.equal((await sql('SELECT content FROM ai_messages WHERE request_id=$1 AND role=\'assistant\'', [id]))[0].content, stored);
  });
  await check('invalid table shape cannot be persisted as an apparently valid response', async () => {
    const id = await begin(2), document = envelope(); document.blocks = [{ type: 'table', columns: ['A'], rows: [['A', 'B']] }];
    await assert.rejects(() => finish(id, encode(document)), error => error.code === '22023');
    await fail(id);
  });
  await check('structured sources cannot bypass the separately checked citation boundary', async () => {
    const id = await begin(3), document = envelope(); document.blocks[1].items = [{ ...citations[0], url: 'https://evil.example/private' }];
    await assert.rejects(() => finish(id, encode(document)), error => error.code === '22023');
    await fail(id);
  });
  await check('cross-organization metadata is rejected', async () => {
    const id = await begin(4), document = envelope(); document.metadata.organizationId = '10000000-0000-4000-8000-000000000002';
    await assert.rejects(() => finish(id, encode(document)), error => error.code === '22023');
    await fail(id);
  });
  await check('legacy plain content keeps the existing privacy redactor', async () => {
    const id = await begin(5); await finish(id, 'Resposta antiga: ana@example.com');
    assert.match((await sql('SELECT content FROM ai_messages WHERE request_id=$1 AND role=\'assistant\'', [id]))[0].content, /e-mail protegido/);
  });
  await check('private JSON sanitizers cannot be invoked directly by authenticated clients', async () => {
    await assert.rejects(() => sql('SELECT workers_private.sanitize_response_content(\'x\',$1,\'[]\')', [org]), error => error.code === '42501');
  });
  await check('missing version, worker or completeness fails closed instead of passing through SQL NULL logic', async () => {
    for (const [index, missing] of ['version', 'worker', 'completeness'].entries()) {
      const id = await begin(index + 6), document = envelope();
      if (missing === 'completeness') delete document.metadata.completeness; else delete document[missing];
      await assert.rejects(() => finish(id, encode(document)), error => error.code === '22023');
      await fail(id);
    }
  });
  await check('pie partitions, explicit comparison labels and closed query context persist without partial JSON',async()=>{
    // Advance only disposable fixture timestamps so the real 8 turns/minute
    // safeguard remains enabled while this isolated test exercises more cases.
    await db.exec(`RESET ROLE;UPDATE ai_messages SET created_at=now()-interval '2 minutes';SET ROLE authenticated;`);
    const id=await begin(10),document=envelope();
    document.metadata.filters={query:{group_by:'status',relationship:'all',weekday:5}};
    document.blocks=[{type:'pie_chart',title:'Eventos por situação',unit:'count',data:[{label:'Planejado',value:100},{label:'Concluído',value:50}],population:2,complete:true},{type:'comparison',title:'Eventos',currentLabel:'Outubro de 2026',previousLabel:'Setembro de 2026',unit:'count',items:[{label:'Eventos',current:150,previous:90}]}];
    await finish(id,encode(document));
    const stored=JSON.parse((await sql('SELECT content FROM ai_messages WHERE request_id=$1 AND role=\'assistant\'',[id]))[0].content.slice(21,-4));
    assert.equal(stored.blocks[0].data[0].value,100);assert.equal(stored.blocks[1].currentLabel,'Outubro de 2026');assert.equal(stored.metadata.filters.query.weekday,5);
    const invalid=await begin(11);document.blocks[0].population=3;
    await assert.rejects(()=>finish(invalid,encode(document)),error=>error.code==='22023');await fail(invalid);
  });
  await check('identity rankings persist and reopen with UUIDs, ties, official icon keys and zero; URLs and duplicate IDs fail', async () => {
    await db.exec(`RESET ROLE;UPDATE ai_messages SET created_at=now()-interval '2 minutes';SET ROLE authenticated;`);
    const document=envelope();
    document.blocks=[{type:'entity_ranking',title:'Comissões autorizadas',entityKind:'commission',population:2,items:[
      {id:'00000000-0000-4000-8000-000000000011',name:'Segurança',visualKey:'seguranca',events:12,position:1},
      {id:'00000000-0000-4000-8000-000000000012',name:'Segurança',visualKey:'unidade-nova',events:0,position:2}
    ]}];
    const id=await begin(20); await finish(id,encode(document));
    const stored=JSON.parse((await sql("SELECT content FROM ai_messages WHERE request_id=$1 AND role='assistant'",[id]))[0].content.slice(21,-4));
    assert.deepEqual(stored.blocks,document.blocks);
    for(const [i,mutate] of [
      d=>{d.blocks[0].items[0].photoUrl='https://arbitrary.test/picture'},
      d=>{d.blocks[0].items[1].id=d.blocks[0].items[0].id},
      d=>{d.blocks[0].items[0].visualKey='https://arbitrary.test/picture'},
      d=>{d.blocks[0].items[1].position=1},
      d=>{d.blocks[0].items[1].events=14},
    ].entries()){
      const invalid=structuredClone(document);mutate(invalid);const request=await begin(21+i);
      await assert.rejects(()=>finish(request,encode(invalid)),error=>error.code==='22023');await fail(request);
    }
    const person=structuredClone(document);person.blocks[0].entityKind='person';person.blocks[0].items.forEach(x=>{delete x.visualKey;x.events=12});
    const personRequest=await begin(26);await finish(personRequest,encode(person));
    assert.ok((await sql("SELECT content FROM ai_messages WHERE request_id=$1 AND role='assistant'",[personRequest]))[0].content.includes('entity_ranking'));
  });
  await check('structured identity choices survive SQL redaction and history reopening without technical labels', async () => {
    await db.exec(`RESET ROLE;UPDATE ai_messages SET created_at=now()-interval '2 minutes';SET ROLE authenticated;`);
    const document=envelope();document.blocks=[{type:'clarification',question:'Qual pessoa deseja consultar?',options:['Ana da Silva · identidade 1','Ana da Silva · identidade 2'],choices:[
      {id:'00000000-0000-4000-8000-000000000011',name:'Ana da Silva'},
      {id:'00000000-0000-4000-8000-000000000012',name:'Ana da Silva'}
    ]}];
    const id=await begin(30);await finish(id,encode(document));
    const stored=JSON.parse((await sql("SELECT content FROM ai_messages WHERE request_id=$1 AND role='assistant'",[id]))[0].content.slice(21,-4));
    assert.deepEqual(stored.blocks,document.blocks);
    for(const [i,mutate] of [
      d=>{d.blocks[0].choices[1].id=d.blocks[0].choices[0].id},
      d=>{d.blocks[0].choices[0].url='https://arbitrary.test'},
      d=>{d.blocks[0].options.pop()},
    ].entries()){
      const invalid=structuredClone(document);mutate(invalid);const request=await begin(31+i);
      await assert.rejects(()=>finish(request,encode(invalid)),error=>error.code==='22023');await fail(request);
    }
  });
  const output = { environment: 'isolated PGlite PostgreSQL; synthetic records only', checks };
  const directory = path.join(root, 'docs/workers/bot-fenasoja/evidence'); await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'response-persistence-qa.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
} finally { await db.close(); }
