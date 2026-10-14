/* Real financial RPCs/RLS in two independent authenticated local PostgreSQL sessions. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name)+1];
const psql = option('--psql'), port = option('--port'), output = option('--output');
assert(path.isAbsolute(psql) && /^\d+$/.test(port) && output, 'Explicit local psql/port/output required.');
const database = 'financial_expenses_qa';
const org = 'a0000000-0000-0000-0000-000000000001';
const actors = { admin: '10000000-0000-0000-0000-000000000001', reader: '10000000-0000-0000-0000-000000000002',
  editor: '10000000-0000-0000-0000-000000000003', confirmer: '10000000-0000-0000-0000-000000000004',
  denied: '10000000-0000-0000-0000-000000000005' };
const report = { boundary: 'Fresh synthetic loopback PostgreSQL; actual migrated financial RPCs/RLS; no remote writes.',
  checks: [], concurrency: [], limitation: 'Database authenticated roles and JWT claims are exercised; Supabase Auth login is not involved.' };
const literal = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
function launch(text, profile='admin', hold=false) {
  let ready;
  const locked = new Promise(resolve => { ready = resolve; });
  const result = new Promise((resolve,reject) => {
    const child = spawn(psql, ['-X','-q','-A','-t','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,
      '-v','ON_ERROR_STOP=1','-f','-'], { env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
    let stdout='', stderr='';
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('__QA_LOCKED__')) ready(); });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => { ready(); resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }); });
    const auth = profile ? `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${literal(actors[profile])};` : '';
    child.stdin.end(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'; ${auth}\n${text};\n`+
      (hold ? "SELECT '__QA_LOCKED__'; SELECT pg_sleep(0.8);\n" : '') + 'COMMIT;\n');
  });
  return { result, locked };
}
const run = async (text,profile='admin') => { const result = await launch(text,profile).result;
  assert.equal(result.code,0,result.stderr); return result.stdout; };
const parse = text => JSON.parse(text.split('\n').find(line => line.startsWith('{') || line.startsWith('[')));
const query = async (text,profile='admin') => parse(await run(text,profile));
const rpc = (name,params) => `SELECT public.${name}(${params.join(',')})::text`;
const check = (name,condition,detail) => { const row = { name, passed: Boolean(condition), ...(detail ? { detail } : {}) };
  report.checks.push(row); assert(condition,name); console.log(JSON.stringify(row)); };
const expectError = async (name,text,pattern,profile='admin') => {
  const result = await launch(text,profile).result; check(name,result.code!==0 && pattern.test(result.stderr));
};
let e28,e26;
const saveSQL = (payload,version=null,key=randomUUID()) => rpc('financial_save_expense',[literal(org),json(payload),version ?? 'NULL',literal(key)]);
const save = (payload,version=null,key) => query(saveSQL(payload,version,key));
const transitionSQL = (expense,to,payload={},reason=null,key=randomUUID()) => rpc('financial_transition_expense',
  [literal(org),literal(expense.id),literal(to),expense.version,json(payload),literal(reason),literal(key)]);
const transition = (expense,to,payload={},reason=null) => query(transitionSQL(expense,to,payload,reason));
const categorySQL = (payload,version=null,key=randomUUID()) => rpc('financial_save_category',[literal(org),json({domain:'despesa',...payload}),version ?? 'NULL',literal(key)]);
const comparison = (filters={}) => query(rpc('financial_expense_comparison',[literal(org),literal(e28),json(filters)]));
const list = (filters={},limit=25,offset=0) => query(rpc('financial_list_expenses',[literal(org),literal(e28),json(filters),limit,offset]));
const detail = id => query(rpc('financial_expense_detail',[literal(org),literal(id)]));
const movementSQL = (expense,amount,key=randomUUID()) => rpc('financial_record_movement',[literal(org),
  json({edition_id:e28,kind:'pagamento',direction:'saida',amount_cents:amount,occurred_on:'2028-05-10'}),
  json([{obligation_id:expense.obligation_id,amount_cents:amount}]),literal(key)]);
async function race(name,first,second,expectedSecond) {
  const a = launch(`SELECT json_build_object('pid',pg_backend_pid()); ${first}`, 'admin', true);
  await a.locked;
  const b = launch(`SELECT json_build_object('pid',pg_backend_pid()); ${second}`);
  const replies = await Promise.all([a.result,b.result]);
  const pids = replies.map(reply => JSON.parse(reply.stdout.split('\n').find(line => line.startsWith('{'))).pid);
  const passed = replies[0].code===0 && (expectedSecond ? replies[1].code!==0&&expectedSecond.test(replies[1].stderr) : replies[1].code===0)
    && pids[0]!==pids[1];
  report.concurrency.push({ name, passed, pids, firstExit: replies[0].code, secondExit: replies[1].code,
    expectedConflict: expectedSecond?.source ?? null, error: replies[1].stderr || null });
  check(name,passed);
  return replies;
}
(async () => {
  const editions = await query(`SELECT json_build_object('e28',max(id::text) FILTER(WHERE code=2028),'e26',max(id::text) FILTER(WHERE code=2026))
    FROM financial_editions WHERE org_id=${literal(org)}`);
  e28=editions.e28; e26=editions.e26;
  check('2028 starts empty without copying historical values',(await list()).total===0);
  const cat = await query(categorySQL({name:'QA local · categoria personalizada',color:'#0f766e',icon:'shield'}));
  check('Create a custom financial category',Boolean(cat.id)&&cat.version===1);
  const renamed = await query(categorySQL({id:cat.id,name:'QA local · categoria renomeada'},cat.version));
  check('Rename with version preserved',renamed.name.includes('renomeada')&&renamed.version===2);
  const request=randomUUID(), payload={edition_id:e28,title:'QA local · palco previsto',category_id:cat.id,
    commission_id:'c0000000-0000-0000-0000-000000000001',planned_cents:100001,planned_on:'2028-05-01'};
  let expense=await save(payload,null,request);
  const replay=await save(payload,null,request);
  check('Retry preserves expense identity',expense.id===replay.id&&(await list()).total===1);
  await expectError('Same idempotency key rejects different content',saveSQL({...payload,title:'Alterado'},null,request),/FINANCIAL_IDEMPOTENCY_CONFLICT/);
  check('Projected expense reloads from server',(await detail(expense.id)).expense.planned_cents===100001);
  check('Projection creates no payable obligation',expense.obligation_id===null&&expense.paid_cents===0&&expense.open_cents===0);
  expense=await save({id:expense.id,title:'QA local · palco atualizado',planned_cents:110001},expense.version);
  check('Edit increments version and preserves cent precision',expense.version===2&&expense.planned_cents===110001);
  await expectError('Stale expense version is rejected',saveSQL({id:expense.id,title:'Stale'},1),/FINANCIAL_CONFLICT/);
  expense=await transition(expense,'realizada',{committed_cents:120001,committed_on:'2028-05-02',due_date:'2026-10-01'});
  check('Realization keeps projection and creates one obligation',expense.planned_cents===110001&&expense.committed_cents===120001&&Boolean(expense.obligation_id));
  const direct=await save({edition_id:e28,status:'realizada',title:'QA local · realizada sem previsão',committed_cents:50001,committed_on:'2028-05-03'});
  check('Direct realized expense keeps projection null',direct.planned_cents===null&&direct.committed_cents===50001);
  const payment=await query(movementSQL(expense,40001));
  const paid=(await detail(expense.id)).expense;
  check('Payment affects liquidation while commitment is preserved',paid.paid_cents===40001&&paid.open_cents===80000&&paid.committed_cents===120001);
  await expectError('Payment above balance is rejected',movementSQL(expense,80001),/FINANCIAL_OVER_SETTLEMENT/);
  await expectError('Cancellation with payment is rejected',transitionSQL(expense,'cancelada',{},'QA cancel'),/FINANCIAL_HAS_SETTLEMENT/);
  await expectError('Reversion with payment is rejected',transitionSQL(expense,'prevista',{},'QA revert'),/FINANCIAL_HAS_SETTLEMENT/);
  await expectError('Commitment cannot be reduced below paid',saveSQL({id:expense.id,committed_cents:40000},expense.version),/FINANCIAL_OBLIGATION_BELOW_SETTLED/);
  const cmp=await comparison();
  check('Comparison aggregates planned, committed, paid and balance independently',cmp.totals.planned_cents===110001&&cmp.totals.committed_cents===170002
    &&cmp.totals.paid_cents===40001&&cmp.totals.open_cents===130001&&cmp.totals.deviation_cents===60001);
  check('Without projection and overdue records are reported by server',cmp.totals.realized_without_plan_count===1&&cmp.totals.overdue_count===1);
  const page=await list({},1);
  check('Pagination affects list only',page.total===2&&page.items.length===1&&(await comparison()).totals.count===2);
  check('Search/category/commission share comparison and list scope',(await list({q:'palco',category_id:cat.id})).total===1
    &&(await comparison({q:'palco',category_id:cat.id})).totals.count===1);
  check('Explicit period field uses forecast date',(await list({date_field:'planned_on',from:'2028-05-01',to:'2028-05-01'})).total===1);
  check('Explicit period field uses commitment date',(await list({date_field:'committed_on',from:'2028-05-03',to:'2028-05-03'})).total===1);
  await query(rpc('financial_reverse_movement',[literal(org),literal(payment.id),literal('QA local · estorno'),literal('2028-05-11'),literal(randomUUID())]));
  check('Reversal restores paid to zero with history retained',(await detail(expense.id)).expense.paid_cents===0
    &&(await detail(expense.id)).movements.length===2);
  expense=await transition(expense,'prevista',{},'QA local · replanejamento');
  check('Reversion restores projected stage without deleting forecast',expense.status==='prevista'&&expense.planned_cents===110001&&expense.committed_cents===null);
  await expectError('Direct realized expense cannot revert without forecast',transitionSQL(direct,'prevista',{},'QA revert'),/FINANCIAL_NO_PROJECTION/);
  expense=await transition(expense,'cancelada',{},'QA local · cancelamento');
  check('Cancel keeps stable identity and audit history',expense.status==='cancelada'&&(await detail(expense.id)).history.length>=5);
  const archived=await query(categorySQL({id:cat.id,active:false},renamed.version));
  check('Archive retains linked category identity',archived.active===false&&(await detail(expense.id)).expense.category_id===cat.id);
  await expectError('Archived category rejects new expense link',saveSQL({...payload,title:'QA nova'}),/FINANCIAL_CATEGORY_ARCHIVED/);
  await expectError('2026 remains read only',saveSQL({...payload,edition_id:e26,category_id:null}),/FINANCIAL_EDITION_READ_ONLY/);
  check('Reader can consult financial data',(await query(rpc('financial_list_expenses',[literal(org),literal(e28),json({}),25,0]),'reader')).total===2);
  await expectError('Reader cannot write expenses',saveSQL({...payload,category_id:null}),/FINANCIAL_FORBIDDEN/,'reader');
  await expectError('Editor cannot create realized expense',saveSQL({edition_id:e28,status:'realizada',title:'QA editor',committed_cents:100,committed_on:'2028-05-02'}),/financial_confirm/,'editor');
  await expectError('No-finance operator cannot use expense RPC',rpc('financial_list_expenses',[literal(org),literal(e28),json({}),25,0]),/FINANCIAL_FORBIDDEN/,'denied');
  check('No-finance operator sees zero financial rows by RLS',Number(await run('SELECT count(*) FROM expenses WHERE financial_edition_id IS NOT NULL','denied'))===0);
  await expectError('Direct table edits are guarded outside financial RPC',`UPDATE expenses SET planned_cents=1 WHERE id=${literal(direct.id)}`,/FINANCIAL_EXPENSE_PROTECTED/);
  await expectError('Missing financial rights are never inherited from logistics role',saveSQL({...payload,category_id:null}),/FINANCIAL_FORBIDDEN/,'denied');
  const seeded=await query(rpc('financial_seed_expense_categories',[literal(org),literal(randomUUID())]));
  check('Historic category names are optional suggestions with no expense import',seeded.created===12&&(await list()).total===2);
  const concurrentPayload={edition_id:e28,title:'QA local · concorrência idempotência',planned_cents:10000}, concurrentKey=randomUUID();
  await race('Two sessions retry one creation idempotently',saveSQL(concurrentPayload,null,concurrentKey),saveSQL(concurrentPayload,null,concurrentKey));
  const concurrent=(await list({q:'concorrência idempotência'})).items[0];
  check('Concurrent retry stores one expense and one audit create',(await list({q:'concorrência idempotência'})).total===1
    &&(await detail(concurrent.id)).history.filter(row=>row.action==='create').length===1);
  await race('Two sessions edit one version; stale edit is rejected',saveSQL({id:concurrent.id,planned_cents:11000},1),
    saveSQL({id:concurrent.id,planned_cents:12000},1),/FINANCIAL_CONFLICT/);
  const afterEdit=(await detail(concurrent.id)).expense;
  await race('Two sessions realize one forecast; one obligation survives',transitionSQL(afterEdit,'realizada',{committed_cents:10000,committed_on:'2028-05-04'}),
    transitionSQL(afterEdit,'realizada',{committed_cents:10000,committed_on:'2028-05-04'}),/FINANCIAL_CONFLICT/);
  const realized=(await detail(concurrent.id)).expense;
  check('Concurrent realization keeps forecast and one source obligation',realized.planned_cents===11000&&Number(await run(`SELECT count(*) FROM financial_obligations
    WHERE source_type='despesa' AND source_id=${literal(realized.id)}`))===1);
  await race('Two sessions cannot overpay one expense',movementSQL(realized,7000),movementSQL(realized,7000),/FINANCIAL_OVER_SETTLEMENT/);
  check('Concurrent payments leave exact net paid/balance',(await detail(realized.id)).expense.paid_cents===7000&&(await detail(realized.id)).expense.open_cents===3000);
  const forCancel=await save({edition_id:e28,title:'QA local · pagamento versus cancelamento',status:'realizada',planned_cents:10000,committed_cents:10000,committed_on:'2028-05-04'});
  await race('Payment versus cancellation protects settled expense',movementSQL(forCancel,1000),transitionSQL(forCancel,'cancelada',{},'QA cancel'),/FINANCIAL_HAS_SETTLEMENT/);
  const forRevert=await save({edition_id:e28,title:'QA local · pagamento versus reversão',status:'realizada',planned_cents:10000,committed_cents:10000,committed_on:'2028-05-04'});
  await race('Payment versus reversion protects settled expense',movementSQL(forRevert,1000),transitionSQL(forRevert,'prevista',{},'QA revert'),/FINANCIAL_HAS_SETTLEMENT/);
  const forReduction=await save({edition_id:e28,title:'QA local · pagamento versus redução',status:'realizada',planned_cents:10000,committed_cents:10000,committed_on:'2028-05-04'});
  await race('Payment versus reduction keeps commitment above liquidation',movementSQL(forReduction,7000),saveSQL({id:forReduction.id,committed_cents:6000},1),/FINANCIAL_OBLIGATION_BELOW_SETTLED/);
  report.summary={passed:report.checks.filter(row=>row.passed).length,total:report.checks.length,concurrentSessions:report.concurrency.length};
})().catch(error=>{ report.error=error.message; process.exitCode=1; console.error(error.message); }).finally(()=>{
  fs.mkdirSync(output,{recursive:true}); fs.writeFileSync(path.join(output,'authenticated-database-report.json'),JSON.stringify(report,null,2));
});
