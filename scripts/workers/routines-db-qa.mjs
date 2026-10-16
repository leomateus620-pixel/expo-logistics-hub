/** Local synthetic PostgreSQL 16 QA only. Fixed loopback + dedicated database; no .env. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pgPath = process.argv[process.argv.indexOf('--pg-module') + 1];
if (!process.argv.includes('--pg-module') || !pgPath || !path.isAbsolute(pgPath)) throw new Error('Pass --pg-module with an absolute local pg/lib/index.js path.');
const { default: pg } = await import(pathToFileURL(pgPath).href);
const port = Number(process.env.WORKERS_QA_PG_PORT ?? 55438);
const user = process.env.WORKERS_QA_PG_USER ?? 'leonardo';
if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(user)) throw new Error('Invalid local PostgreSQL QA port/user.');
const connection = { host: '127.0.0.1', port, user, database: 'routines_phase23' };
const clients = [];
const proofs = [];
const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = '10000000-0000-4000-8000-000000000002';
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uuid = () => crypto.randomUUID();
async function connect(user = null) {
  const c = new pg.Client(connection); await c.connect(); clients.push(c);
  await c.query("SET statement_timeout='10s'");
  if (user) {
    await c.query('SET ROLE authenticated');
    await c.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [user]);
  }
  return c;
}
async function rpc(c, name, args) {
  assert.match(name, /^ai_workspace_[a-z_]+$/);
  const values = args.map((value, index) => name === 'ai_workspace_complete_run' && index === 4 ? JSON.stringify(value) : value);
  return (await c.query(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS data`, values)).rows[0].data;
}
async function denied(fn, code = '42501') {
  try { await fn(); } catch (error) { assert.equal(error.code, code, error.message); return; }
  assert.fail(`Expected SQL denial ${code}`);
}
async function check(name, fn) {
  const start = performance.now(); await fn(); proofs.push({ name, passed: true, milliseconds: Math.round(performance.now() - start) });
}
const agenda = extra => ({ title: 'Briefing sintético', workerId: 'agenda', schedule: { timeZone: 'America/Sao_Paulo', localTime: '00:00', weekdays: [1, 2, 3, 4, 5, 6, 7] },
  recipe: { recipeId: 'agendaBriefing', commissionId: null, dayOffset: 1, includeRestaurantConflicts: false }, delivery: 'inApp', executionMode: 'activeSession', ...extra });
const citations = [{ label: 'Agenda', url: '/cronograma-eventos', source: 'app' }];
try {
  const bootstrap = new pg.Client({ ...connection, database: 'postgres' }); await bootstrap.connect();
  if (!(await bootstrap.query("SELECT 1 FROM pg_database WHERE datname='routines_phase23'")).rowCount) await bootstrap.query('CREATE DATABASE routines_phase23');
  await bootstrap.end();
  const owner = await connect();
  assert.equal((await owner.query('SELECT current_database() name')).rows[0].name, 'routines_phase23');
  // Only this disposable, explicitly dedicated local fixture database is reset.
  await owner.query('DROP SCHEMA IF EXISTS workers_private CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await owner.query(await fs.readFile(path.join(root, 'scripts/workers/db-fixture.sql'), 'utf8'));
  await owner.query("CREATE FUNCTION public.venue_get_permissions(_org_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('venue_events_access',public.has_capability(auth.uid(),_org_id,'venue_events_access')); $$;");
  await owner.query(await fs.readFile(path.join(root, 'supabase/migrations/20261016120000_workers_readonly_workspace.sql'), 'utf8'));
  const actions = await fs.readFile(path.join(root, 'supabase/migrations/20261016130000_workers_confirmed_actions.sql'), 'utf8');
  const realRedactor = actions.match(/CREATE FUNCTION workers_private\.redact_text\(_text text\)[\s\S]*?END \$\$;/)?.[0];
  assert(realRedactor, 'Use the exact real additive redactor, never a duplicate fake.');
  await owner.query('CREATE SCHEMA IF NOT EXISTS workers_private');await owner.query(realRedactor);
  await owner.query('REVOKE ALL ON FUNCTION workers_private.redact_text(text) FROM PUBLIC,anon,authenticated');
  await owner.query(await fs.readFile(path.join(root, 'supabase/migrations/20261016130100_workers_routines_memory.sql'), 'utf8'));
  const conversations = {};
  for (let n = 1; n <= 7; n++) conversations[n] = (await owner.query("INSERT INTO ai_conversations(org_id,user_id,title,worker_id) VALUES($1,$2,'Conversa sintética','agenda') RETURNING id", [n === 6 ? otherOrg : org, uid(n)])).rows[0].id;
  const reader = await connect(uid(4)), reader2 = await connect(uid(4)), seller = await connect(uid(7)), seller2 = await connect(uid(7));
  const admin = await connect(uid(1)), manager = await connect(uid(2)), operator = await connect(uid(3)), outsider = await connect(uid(6));
  const propose = (c = reader, cfg = agenda(), request = uuid(), conversation = conversations[4]) => rpc(c, 'ai_workspace_propose_routine', [org, conversation, request, cfg]);
  const activate = async (c = reader, cfg = agenda(), conversation = conversations[4]) => { const p = await propose(c, cfg, uuid(), conversation); return rpc(c, 'ai_workspace_confirm_routine', [org, p.id, p.version]); };
  const forceDue = r => owner.query("UPDATE ai_routines SET next_scheduled_at=clock_timestamp()-interval '1 minute' WHERE id=$1", [r.id]);
  const finish = (c, claim) => rpc(c, 'ai_workspace_complete_run', [org, claim.run.id, claim.generation, 'Resultado sintético autorizado.', citations, ['list_events'], null]);
  const resetUser = async n => {
    await owner.query("UPDATE ai_routines SET status='disabled',next_scheduled_at=NULL WHERE user_id=$1", [uid(n)]);
    await owner.query("UPDATE ai_routine_runs SET state='failed',lease_expires_at=NULL WHERE user_id=$1 AND state='running'", [uid(n)]);
    await owner.query("UPDATE ai_messages SET state='failed' WHERE user_id=$1 AND role='assistant' AND state='pending'", [uid(n)]);
  };

  await check('propose is inert; confirm is idempotent and schedules strictly after DB clock', async () => {
    const req = uuid(); const p = await propose(reader, agenda({ title: 'Contato ana@example.com' }), req);
    assert.equal(p.state, 'proposed'); assert.equal(p.nextScheduledAt, null); assert.equal(p.canRunNow, false); assert(!JSON.stringify(p).includes('ana@example.com'));
    const replay = await propose(reader, agenda({ title: 'Contato ana@example.com' }), req); assert.equal(replay.id, p.id);
    await denied(() => propose(reader, agenda({ title: 'Outro' }), req), '55000');
    const a = await rpc(reader, 'ai_workspace_confirm_routine', [org, p.id, 1]);
    const b = await rpc(reader, 'ai_workspace_confirm_routine', [org, p.id, 1]);
    assert.equal(a.version, 2); assert.equal(b.id, a.id); assert(new Date(a.nextScheduledAt) > new Date(a.serverNow));
    assert.equal((await owner.query("SELECT count(*)::int n FROM ai_system_events WHERE entity_id=$1 AND kind='routineCreated'", [p.id])).rows[0].n, 1);
    await rpc(reader, 'ai_workspace_undo_routine', [org, a.id, a.version]);
    assert.equal((await rpc(reader, 'ai_workspace_undo_routine', [org, a.id, a.version])).state, 'cancelled');
  });
  await check('strict config disallows raw cron, unknown worker/recipe, fake channel and invalid clock', async () => {
    for (const cfg of [{ ...agenda(), cron: '* * * * *' }, agenda({ workerId: 'caixa' }), agenda({ delivery: 'email' }), agenda({delivery:null}),agenda({executionMode:null}),agenda({schedule:{timeZone:null,localTime:'08:00',weekdays:[1]}}),agenda({ schedule: { timeZone: 'UTC', localTime: '08:00', weekdays: [1] } }), agenda({ recipe: { recipeId: 'delete_event' } })]) await denied(() => propose(reader, cfg), '22023');
  });
  await check('proposed cannot be resumed as active; disabling proposal never creates an active routine', async () => {
    const p = await propose();
    await denied(() => rpc(reader, 'ai_workspace_set_routine_state', [org, p.id, 1, 'active']), '55000');
    const stopped = await rpc(reader, 'ai_workspace_set_routine_state', [org, p.id, 1, 'disabled']); assert.equal(stopped.state, 'disabled');
    await denied(() => rpc(reader, 'ai_workspace_confirm_routine', [org, p.id, stopped.version]), '55000');
  });
  await check('public RPCs reject NULL versions/fences instead of bypassing CAS through SQL unknown', async () => {
    const p=await propose();await denied(()=>rpc(reader,'ai_workspace_confirm_routine',[org,p.id,null]),'55000');
    const r=await rpc(reader,'ai_workspace_confirm_routine',[org,p.id,1]);
    await denied(()=>rpc(reader,'ai_workspace_set_routine_state',[org,r.id,null,'paused']),'55000');
    await denied(()=>rpc(reader,'ai_workspace_undo_routine',[org,r.id,null]),'55000');
    await forceDue(r);const claim=(await rpc(reader,'ai_workspace_claim_due',[org,uuid()])).claims[0];
    await denied(()=>rpc(reader,'ai_workspace_validate_run',[org,claim.run.id,null]),'55000');
    await denied(()=>rpc(reader,'ai_workspace_finish_run',[org,claim.run.id,null,false,'cancelled',null]),'55000');
    await denied(()=>rpc(reader,'ai_workspace_complete_run',[org,claim.run.id,null,'x',citations,['list_events'],null]),'55000');
    await finish(reader,claim);
  });
  await check('calendar uses Sao Paulo civil time, weekday/weekend and strictly future instants', async () => {
    const cfg = agenda({ schedule: { timeZone: 'America/Sao_Paulo', localTime: '08:00', weekdays: [1, 2, 3, 4, 5] } });
    const q = async at => (await owner.query('SELECT ai_workspace_next_schedule($1,$2)::text d', [cfg, at])).rows[0].d;
    assert.equal(Date.parse(await q('2026-10-16T11:00:00Z')), Date.parse('2026-10-19T11:00:00Z'));
    assert.equal(Date.parse(await q('2026-10-17T12:00:00Z')), Date.parse('2026-10-19T11:00:00Z'));
    assert.equal(Date.parse(await q('2026-10-16T10:59:59Z')), Date.parse('2026-10-16T11:00:00Z'));
    const dst = agenda({ schedule: { timeZone: 'America/Sao_Paulo', localTime: '08:00', weekdays: [1, 2, 3, 4, 5, 6, 7] } });
    assert.equal(Date.parse((await owner.query('SELECT ai_workspace_next_schedule($1,$2)::text d', [dst, '2018-11-03T12:00:00Z'])).rows[0].d), Date.parse('2018-11-04T10:00:00Z'));
  });
  await check('catch-up uses only latest occurrence of same local day; older occurrence is skipped', async () => {
    await resetUser(4); const r = await activate();
    await owner.query("UPDATE ai_routines SET next_scheduled_at=((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date-2)::timestamp AT TIME ZONE 'America/Sao_Paulo' WHERE id=$1", [r.id]);
    const req = uuid(); const batch = await rpc(reader, 'ai_workspace_claim_due', [org, req]); assert.equal(batch.claims.length, 1);
    const today = (await owner.query("SELECT (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date::text d")).rows[0].d;
    assert.equal(batch.claims[0].run.referenceDate, today); assert.equal(batch.claims[0].run.catchUp, true);
    assert.equal((await owner.query("SELECT count(*)::int n FROM ai_routine_runs WHERE routine_id=$1 AND state='skipped'", [r.id])).rows[0].n, 1);
    assert.deepEqual((await rpc(reader, 'ai_workspace_claim_due', [org, req])).claims, []);
    await finish(reader, batch.claims[0]);
  });
  await check('complete_run is atomic, idempotent, keeps rich body only in existing own messages, and cost is unknown', async () => {
    await resetUser(4); const r = await activate(); await forceDue(r);
    const claim = (await rpc(reader, 'ai_workspace_claim_due', [org, uuid()])).claims[0];
    await denied(() => rpc(reader, 'ai_workspace_complete_run', [org, claim.run.id, 1, 'Never committed', citations, ['list_events'], 'transportWeather']), '22023');
    assert.equal((await owner.query('SELECT state FROM ai_messages WHERE request_id=$1 AND role=\'assistant\'', [claim.run.requestId])).rows[0].state, 'pending');
    assert.equal((await owner.query('SELECT count(*)::int n FROM ai_usage WHERE request_id=$1', [claim.run.requestId])).rows[0].n, 0);
    const done = await finish(reader, claim); assert.equal(done.state, 'succeeded'); assert.equal(done.resultTrust, 'user_scoped_reported');
    await finish(reader, claim);
    const usage = (await owner.query('SELECT input_tokens,output_tokens,cost_usd,telemetry_trust,model FROM ai_usage WHERE request_id=$1', [claim.run.requestId])).rows;
    assert.equal(usage.length, 1); assert.equal(usage[0].input_tokens, 0); assert.equal(usage[0].output_tokens, 0); assert.equal(usage[0].cost_usd, null); assert.equal(usage[0].telemetry_trust, 'user_scoped'); assert.equal(usage[0].model, 'local/readonly-routine');
    assert(!JSON.stringify((await owner.query('SELECT to_jsonb(r) j FROM ai_routine_runs r WHERE id=$1', [done.id])).rows).includes('Resultado sintético'));
  });
  await check('real concurrent confirm returns one active routine and one creation event', async () => {
    const p = await propose(seller, agenda(), uuid(), conversations[7]);
    await seller.query('BEGIN'); const first = await rpc(seller, 'ai_workspace_confirm_routine', [org, p.id, 1]);
    let secondDone = false; const secondPromise = rpc(seller2, 'ai_workspace_confirm_routine', [org, p.id, 1]).then(value => { secondDone = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(secondDone, false); await seller.query('COMMIT');
    const second = await secondPromise; assert.equal(second.id, first.id); assert.equal(second.version, first.version);
    assert.equal((await owner.query("SELECT count(*)::int n FROM ai_system_events WHERE entity_id=$1 AND kind='routineCreated'", [p.id])).rows[0].n, 1);
  });
  await check('real concurrent claims produce one occurrence despite separate request IDs', async () => {
    await resetUser(7); const r = await activate(seller, agenda(), conversations[7]); await forceDue(r);
    await seller.query('BEGIN'); const a = await rpc(seller, 'ai_workspace_claim_due', [org, uuid()]);
    let done = false; const bPromise = rpc(seller2, 'ai_workspace_claim_due', [org, uuid()]).then(v => { done = true; return v; });
    await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(done, false); await seller.query('COMMIT');
    const b = await bPromise; assert.equal(a.claims.length + b.claims.length, 1);
    await finish(seller, a.claims[0]);
  });
  await check('expiration is evaluated after waiting for a real advisory lock', async () => {
    const p = await propose(seller, agenda(), uuid(), conversations[7]);
    await owner.query("UPDATE ai_routines SET expires_at=clock_timestamp()+interval '50 milliseconds' WHERE id=$1", [p.id]);
    await seller.query('BEGIN'); await seller.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16102026))', [uid(7)]);
    const blocked = rpc(seller2, 'ai_workspace_confirm_routine', [org, p.id, 1]);
    await new Promise(resolve => setTimeout(resolve, 100)); await seller.query('COMMIT');
    assert.equal((await blocked).state, 'expired');
  });
  await check('expired lease reclaims same logical run with new generation; old fence cannot complete', async () => {
    await resetUser(4); const r = await activate(); await forceDue(r);
    const first = (await rpc(reader, 'ai_workspace_claim_due', [org, uuid()])).claims[0];
    await owner.query("UPDATE ai_routine_runs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [first.run.id]);
    const available = (await rpc(reader, 'ai_workspace_snapshot', [org, null])).routines.find(x => x.id === r.id);
    assert.equal(available.canRunNow, true);assert.equal(available.waitingForSession, true);assert(new Date(available.nextScheduledAt)>new Date(available.serverNow));
    const next = (await rpc(reader, 'ai_workspace_claim_due', [org, uuid()])).claims[0];
    assert.equal(next.run.id, first.run.id); assert.equal(next.generation, first.generation + 1); assert.notEqual(next.run.requestId, first.run.requestId);
    await denied(() => finish(reader, first), '55000'); await finish(reader, next);
    assert.equal((await owner.query('SELECT count(*)::int n FROM ai_routine_runs WHERE routine_id=$1', [r.id])).rows[0].n, 1);
  });
  await check('pausing after claim fences success, preserves failed attempt and disallows stale Undo', async () => {
    await resetUser(4); const r = await activate(); await forceDue(r);
    const claim = (await rpc(reader, 'ai_workspace_claim_due', [org, uuid()])).claims[0];
    const paused = await rpc(reader, 'ai_workspace_set_routine_state', [org, r.id, r.version, 'paused']);
    await denied(() => finish(reader, claim), '55000');
    await denied(() => rpc(reader, 'ai_workspace_undo_routine', [org, r.id, r.version]), '55000');
    assert.equal((await rpc(reader, 'ai_workspace_finish_run', [org, claim.run.id, claim.generation, false, 'cancelled', null])).state, 'failed');
    const resumed = await rpc(reader, 'ai_workspace_set_routine_state', [org, r.id, paused.version, 'active']); assert(new Date(resumed.nextScheduledAt) > new Date(resumed.serverNow));
  });
  await check('real pause versus completion serializes under the same advisory lock before validating state', async () => {
    await resetUser(7);const r=await activate(seller,agenda(),conversations[7]);await forceDue(r);
    const claim=(await rpc(seller,'ai_workspace_claim_due',[org,uuid()])).claims[0];
    await seller.query('BEGIN');await rpc(seller,'ai_workspace_set_routine_state',[org,r.id,r.version,'paused']);
    let finished=false;const completion=finish(seller2,claim).then(()=>({ok:true}),error=>({ok:false,code:error.code})).finally(()=>{finished=true;});
    await new Promise(resolve=>setTimeout(resolve,80));assert.equal(finished,false);await seller.query('COMMIT');
    assert.deepEqual(await completion,{ok:false,code:'55000'});
    assert.equal((await owner.query("SELECT state FROM ai_messages WHERE request_id=$1 AND role='assistant'",[claim.run.requestId])).rows[0].state,'pending');
    await rpc(seller,'ai_workspace_finish_run',[org,claim.run.id,claim.generation,false,'cancelled',null]);
  });
  await check('business capability is rechecked after claim; removing grant blocks success and hides alerts', async () => {
    await resetUser(7);
    const cfg = agenda({ workerId: 'mapa', recipe: { recipeId: 'openSalesAge', projectId: '20000000-0000-4000-8000-000000000001', minimumAgeDays: 7 } });
    const r = await activate(seller, cfg, conversations[7]); await forceDue(r); const claim = (await rpc(seller, 'ai_workspace_claim_due', [org, uuid()])).claims[0];
    await owner.query("DELETE FROM user_capabilities WHERE user_id=$1 AND capability='map.manage_sales'", [uid(7)]);
    await denied(() => rpc(seller, 'ai_workspace_validate_run', [org, claim.run.id, claim.generation]));
    await rpc(seller, 'ai_workspace_finish_run', [org, claim.run.id, claim.generation, false, 'permissions_changed', null]);
    const snapshot = await rpc(seller, 'ai_workspace_snapshot', [org, null]); assert.equal(snapshot.alerts.filter(a=>a.routineId===r.id).length, 0); assert.equal(snapshot.routines.find(x => x.id === r.id).canRunNow, false);
    await owner.query("INSERT INTO user_capabilities VALUES($1,$2,'map.manage_sales')", [org, uid(7)]);
  });
  await check('claims share immutable chat admission budget and roll back when capped', async () => {
    const r = await activate(operator, agenda(), conversations[3]); await forceDue(r);
    for (let i = 0; i < 8; i++) {
      const req = uuid(); await operator.query('SELECT ai_workers_begin_turn($1,$2,$3,$4,$5)', [org, req, 'agenda', 'Admissão sintética', conversations[3]]);
      await operator.query('SELECT ai_workers_fail_turn($1,$2)', [org, req]);
    }
    await denied(() => rpc(operator, 'ai_workspace_claim_due', [org, uuid()]), '54000');
    assert.equal((await owner.query('SELECT count(*)::int n FROM ai_routine_runs WHERE routine_id=$1', [r.id])).rows[0].n, 0);
  });
  await check('quota admits at most 10 active routines, including concurrent resume/confirm serialization', async () => {
    for (let i = 0; i < 10; i++) await activate(manager, agenda(), conversations[2]);
    const p = await propose(manager, agenda(), uuid(), conversations[2]);
    await denied(() => rpc(manager, 'ai_workspace_confirm_routine', [org, p.id, 1]), '54000');
  });
  await check('at most two claims are admitted and running leases prevent extra concurrent runs', async () => {
    await owner.query("UPDATE ai_routines SET next_scheduled_at=clock_timestamp()-interval '1 minute' WHERE user_id=$1 AND status='active'",[uid(2)]);
    const batch=await rpc(manager,'ai_workspace_claim_due',[org,uuid()]);assert.equal(batch.claims.length,2);
    assert.equal((await rpc(manager,'ai_workspace_claim_due',[org,uuid()])).claims.length,0);
    for(const claim of batch.claims)await finish(manager,claim);
  });
  await check('explicit memory masks PII/URLs, supports CAS + disable, and never invents a conversation', async () => {
    const req = uuid(); const args = [org, req, null, null, null, 'E-mail ana@example.com CPF 123.456.789-00 CNPJ 12.345.678/0001-95 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature PIX: PIX_UNMASKED_SENTINEL https://evil.test', true];
    const m = await rpc(reader, 'ai_workspace_save_memory', args); assert(!/ana@example|123\.456|12\.345|eyJ|https:|PIX_UNMASKED_SENTINEL/.test(m.content));
    assert.equal((await rpc(reader, 'ai_workspace_save_memory', args)).id, m.id);
    await denied(() => rpc(reader, 'ai_workspace_save_memory', [org, req, null, null, null, 'Diferente', true]), '55000');
    const race = await Promise.allSettled([rpc(reader, 'ai_workspace_save_memory', [org, uuid(), m.id, 1, null, 'Prefiro texto curto', true]), rpc(reader2, 'ai_workspace_save_memory', [org, uuid(), m.id, 1, null, 'Prefiro tabela', true])]);
    assert.equal(race.filter(x => x.status === 'fulfilled').length, 1); assert.equal(race.find(x => x.status === 'rejected').reason.code, '55000');
    const disabled = await rpc(reader, 'ai_workspace_save_memory', [org, uuid(), m.id, 2, null, 'Nota explícita', false]); assert.equal(disabled.enabled, false);
    await denied(() => rpc(reader, 'ai_workspace_save_memory', [org, uuid(), null, null, null, 'x'.repeat(1001), true]), '22023');
    assert.equal((await owner.query("SELECT conversation_id FROM ai_system_events WHERE entity_id=$1 AND kind='memoryChanged' LIMIT 1", [m.id])).rows[0].conversation_id, null);
    await denied(() => rpc(seller, 'ai_workspace_save_memory', [org, uuid(), m.id, 3, null, 'Outro usuário', false]));
  });
  await check('snapshot and RLS bind owner/org; admin aggregates do not expose other users memory or messages', async () => {
    const snapshot = await rpc(reader, 'ai_workspace_snapshot', [org, conversations[4]]);
    assert(snapshot.routines.every(r => r.conversationId === conversations[4])); assert(snapshot.events.every(r => r.conversationId === conversations[4]));
    await denied(() => rpc(reader, 'ai_workspace_snapshot', [org, conversations[7]])); await denied(() => rpc(outsider, 'ai_workspace_snapshot', [org, null]));
    assert.equal((await admin.query('SELECT count(*)::int n FROM ai_memory')).rows[0].n, 0);
    await denied(() => reader.query("INSERT INTO ai_memory(org_id,user_id,content) VALUES($1,$2,'raw')", [org, uid(4)]));
    await denied(() => reader.query("SELECT ai_workspace_next_schedule($1,now())", [agenda()]));
    const from = new Date(Date.now() - 86400000).toISOString(), to = new Date(Date.now() + 86400000).toISOString();
    const usage = await rpc(admin, 'ai_workspace_usage', [org, from, to]); assert(usage.rows.length > 0);
    assert(usage.rows.every(r => r.costUsd === null && r.costSource === 'notReported' && r.telemetryTrust === 'user_scoped'));
    assert(!JSON.stringify(usage).includes('content')); assert(!JSON.stringify(usage).includes('memory'));
    await denied(() => rpc(manager, 'ai_workspace_usage', [org, from, to])); await denied(() => rpc(reader, 'ai_workspace_usage', [org, from, to]));
    await denied(() => rpc(outsider, 'ai_workspace_usage', [org, from, to]));
  });
  await check('inbox deduplicates own reported condition and marking seen has no business mutation', async () => {
    await resetUser(4); await owner.query("DELETE FROM ai_messages WHERE user_id=$1", [uid(4)]); // local fixture only, clear rate window
    const cfg = agenda({ recipe: { recipeId: 'agendaBriefing', commissionId: null, dayOffset: 1, includeRestaurantConflicts: true } });
    await owner.query("INSERT INTO user_capabilities VALUES($1,$2,'venue_events_access')", [org, uid(4)]);
    const r = await activate(reader, cfg); await forceDue(r); const claim = (await rpc(reader, 'ai_workspace_claim_due', [org, uuid()])).claims[0];
    const args = [org, claim.run.id, claim.generation, 'Alerta sintético.', citations, ['list_events', 'restaurant_alert'], 'restaurantConflict'];
    await rpc(reader, 'ai_workspace_complete_run', args); await rpc(reader, 'ai_workspace_complete_run', args);
    const alerts = (await rpc(reader, 'ai_workspace_snapshot', [org, null])).alerts; assert.equal(alerts.filter(a => a.runId === claim.run.id).length, 1);
    const alert = alerts.find(a => a.runId === claim.run.id); await rpc(reader, 'ai_workspace_mark_alert_seen', [org, alert.id]); await rpc(reader, 'ai_workspace_mark_alert_seen', [org, alert.id]);
    assert((await rpc(reader, 'ai_workspace_snapshot', [org, null])).alerts.find(a => a.id === alert.id).seenAt);
    await denied(() => rpc(seller, 'ai_workspace_mark_alert_seen', [org, alert.id]));
  });
  await check('anonymous/service-role-style claims cannot access workspace, and no token fields are persisted', async () => {
    const anon = await connect(); await anon.query('SET ROLE anon'); await denied(() => rpc(anon, 'ai_workspace_snapshot', [org, null]));
    const service = await connect(uid(4)); await service.query("SELECT set_config('request.jwt.claim.role','service_role',false)"); await denied(() => rpc(service, 'ai_workspace_snapshot', [org, null]));
    const tokens = await owner.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN('ai_routines','ai_routine_runs','ai_memory','ai_workspace_receipts','ai_system_events','ai_inbox_items') AND column_name~'(access_token|refresh_token|jwt|secret)' "); assert.equal(tokens.rowCount, 0);
    const policies = await owner.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('ai_routines','ai_routine_runs','ai_memory','ai_system_events','ai_inbox_items','ai_workspace_receipts')"); assert.equal(policies.rowCount, 6); assert(policies.rows.every(r => r.relrowsecurity));
  });
  await check('a NULL auth.role is denied, and the real redactor removes whole compact CNPJ/JWT values', async () => {
    const definition=(await owner.query("SELECT pg_get_functiondef('auth.role()'::regprocedure) d")).rows[0].d;
    await owner.query('CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$');
    try { await denied(()=>rpc(reader,'ai_workspace_snapshot',[org,null])); } finally { await owner.query(definition); }
    assert.equal((await owner.query("SELECT workers_private.redact_text('12345678000195') d")).rows[0].d,'[documento protegido]');
    assert.equal((await owner.query("SELECT workers_private.redact_text('12.345.678/0001-95') d")).rows[0].d,'[documento protegido]');
    assert.equal((await owner.query("SELECT workers_private.redact_text('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature') d")).rows[0].d,'[segredo protegido]');
  });
  await check('empty executeDue and memory receipts cannot grow without a server metadata quota', async () => {
    const limited=await connect(uid(5));
    await owner.query("INSERT INTO ai_workspace_receipts(org_id,user_id,request_id,kind,fingerprint) SELECT $1,$2,gen_random_uuid(),'executeDue','executeDue' FROM generate_series(1,100)",[org,uid(5)]);
    await denied(()=>rpc(limited,'ai_workspace_claim_due',[org,uuid()]),'54000');
    await denied(()=>rpc(limited,'ai_workspace_save_memory',[org,uuid(),null,null,null,'Nota',true]),'54000');
  });

  const migrationBytes=await fs.readFile(path.join(root,'supabase/migrations/20261016130100_workers_routines_memory.sql'));
  const report = { boundary: `Dedicated local PostgreSQL 16 on 127.0.0.1:${port}/routines_phase23, synthetic users/data; business helpers are fixture implementations, not a deployed-business RLS audit.`, version: (await owner.query('SELECT version() v')).rows[0].v, migrationSha256:crypto.createHash('sha256').update(migrationBytes).digest('hex'), passed: true, checks: proofs };
  await fs.writeFile('/tmp/fenasoja-routines-db-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Local routines QA failed:', error.message, error.code ?? ''); console.error('Passed:', proofs.map(p => p.name)); process.exitCode = 1;
} finally { await Promise.allSettled(clients.map(c => c.end())); }
