// Separate PostgreSQL connections against db-run.ps1's synthetic local database.
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const value = key => args[args.indexOf(key)+1];
const psql = value('--psql');
const port = value('--port');
const database = value('--database');
const output = value('--output');
assert(psql && /^\d+$/.test(port) && database==='agenda_restaurant_test', 'Explicit isolated runtime required');
const org = '10000000-0000-0000-0000-000000000001';
const actor = '20000000-0000-0000-0000-000000000001';
const report = { boundary:'Synthetic loopback PostgreSQL only; separate connections, no remote writes',checks:[] };
const check = (name,condition) => { report.checks.push({name,passed:Boolean(condition)}); assert(condition,name); console.log(JSON.stringify(report.checks.at(-1))); };
function run(sql,authenticated=true) {
  return new Promise((resolve,reject)=>{
    const prefix = authenticated ? `BEGIN; SET ROLE authenticated; SET LOCAL request.jwt.claim.sub='${actor}';` : 'BEGIN;';
    const child = spawn(psql,['-X','-q','-A','-t','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-f','-'],{windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'}});
    let stdout='',stderr='';
    child.stdout.on('data',chunk=>{stdout+=chunk});
    child.stderr.on('data',chunk=>{stderr+=chunk});
    child.on('error',reject);
    child.on('close',code=>resolve({code,stdout:stdout.trim(),stderr}));
    child.stdin.end(Buffer.from(prefix+sql+'; COMMIT;','utf8'));
  });
}
const save = (payload,version) => `SELECT public.cronograma_save_event('${JSON.stringify(payload).replaceAll("'","''")}'::jsonb,${version==null?'NULL':version})::text`;
const payload = (key,request) => ({org_id:org,source_key:key,request_id:request,title:'Pedido de concorrência sintético',
  location_code:'centro_eventos_fenasoja',location:'CENTRO DE EVENTOS FENASOJA',source_year:2028,
  start_date:'2028-11-10',end_date:'2028-11-10',start_time:'10:00',end_time:'12:00',has_exact_date:true});
(async()=>{
  const same = payload('qa-concurrency-shared','60000000-0000-4000-8000-000000000001');
  const replies = await Promise.all([run(save(same)),run(save(same))]);
  report.initialReplies = replies;
  if (replies.some(r=>r.code!==0)) console.error(replies);
  check('Same submission in two connections succeeds through durable replay',replies.every(r=>r.code===0));
  const results = replies.map(r=>JSON.parse(r.stdout));
  check('Same submission returns one source and destination identity',results[0].id===results[1].id
    &&results[0].restaurant_forwarding.event_id===results[1].restaurant_forwarding.event_id);
  const counts = await run(`SELECT json_build_object('sources',(SELECT count(*) FROM public.cronograma_eventos WHERE source_key='qa-concurrency-shared'),
    'targets',(SELECT count(*) FROM public.venue_events WHERE cronograma_source_event_id='${results[0].id}'),
    'receipts',(SELECT count(*) FROM public.venue_mutation_receipts WHERE operation='cronograma_save_event' AND idempotency_key='${same.request_id}'))`,false);
  const count = JSON.parse(counts.stdout);
  check('Double request commits exactly one source, target and receipt',count.sources===1&&count.targets===1&&count.receipts===1);
  const edited = await Promise.all([1,2].map(n=>run(save({org_id:org,id:results[0].id,
    request_id:`60000000-0000-4000-8000-00000000000${n+1}`,description:`Revisão sintética ${n}`},1))));
  check('Concurrent editors accept one version and reject the stale version',edited.filter(r=>r.code===0).length===1
    &&edited.filter(r=>r.code!==0).every(r=>r.stderr.includes('CRONOGRAMA_CONFLICT')));
  const distinct = await Promise.all([1,2].map(n=>run(save(payload('qa-concurrency-distinct',`60000000-0000-4000-8000-00000000000${n+3}`)))));
  check('Two tabs with distinct receipts and shared source key cannot duplicate creation',distinct.filter(r=>r.code===0).length===1
    &&distinct.filter(r=>r.code!==0).every(r=>r.stderr.includes('CRONOGRAMA_CONFLICT')));
  const created = JSON.parse(distinct.find(r=>r.code===0).stdout);
  const race = await Promise.all([
    run(save({org_id:org,id:created.id,request_id:'60000000-0000-4000-8000-000000000006',description:'Corrida de revisão sintética'},1)),
    run(`SELECT public.cronograma_delete_event('${created.id}','${org}','qa-concurrency-distinct',1)`),
  ]);
  check('Save/delete race terminates without deadlock or silent stale update',race.filter(r=>r.code===0).length===1
    &&race.filter(r=>r.code!==0).every(r=>/CRONOGRAMA_CONFLICT|CRONOGRAMA_NOT_FOUND/.test(r.stderr)));
  const contexts = await run(`SELECT (SELECT count(*) FROM agenda_private.cronograma_source_write_context)
    +(SELECT count(*) FROM agenda_private.cronograma_restaurant_write_context)`,false);
  check('Concurrent transactions leave no privileged write context',contexts.code===0&&Number(contexts.stdout)===0);
})().catch(error=>{report.error=error.message;process.exitCode=1;console.error(error.message)}).finally(()=>{
  fs.writeFileSync(path.join(output,'concurrency-report.json'),JSON.stringify(report,null,2));
});
