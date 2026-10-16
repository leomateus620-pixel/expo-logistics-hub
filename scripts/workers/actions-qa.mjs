/** Real concurrent PostgreSQL QA. Fixed local host; synthetic dedicated DB only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const moduleArgument=process.argv.indexOf('--pg-module');
const modulePath=moduleArgument>=0?process.argv[moduleArgument+1]:null;
if(!modulePath||!path.isAbsolute(modulePath))throw new Error('Pass --pg-module with the absolute path to an installed pg package.');
const { Client } = require(modulePath);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port=Number(process.env.WORKERS_QA_PG_PORT??55438);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('WORKERS_QA_PG_PORT must be a valid local port.');
const config = { host: '127.0.0.1', port, user: process.env.WORKERS_QA_PG_USER??'leonardo', database: 'actions_phase23' };
const ORG='10000000-0000-4000-8000-000000000001';
const org2='10000000-0000-4000-8000-000000000002';
const user = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const conversation = n => `70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const lot = n => `50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const event='60000000-0000-4000-8000-000000000001';
const report={boundary:'Dedicated local PostgreSQL 16 database; synthetic tables/identities with real native RPC bodies extracted unchanged. Existing live business RLS/FCM/Google were not exercised. Concurrent tests use two physical connections.',passed:false,checks:[],sources:[]};
const admin = new Client({...config,database:'template1'});
await admin.connect();
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[config.database])).rowCount) await admin.query('CREATE DATABASE actions_phase23');
await admin.end();
const owner=new Client(config); await owner.connect();
const read = async filename => { const sql=await fs.readFile(path.join(root,filename),'utf8'); report.sources.push({filename,sha256:createHash('sha256').update(sql).digest('hex')}); return sql; };
const clients=[];
async function connection(){const c=new Client(config);await c.connect();clients.push(c);return c;}
async function login(c,n=1){await c.query('BEGIN');await c.query('SET LOCAL ROLE authenticated');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[user(n)]);}
async function asUser(n,fn){const c=await connection();try{await login(c,n);const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();clients.splice(clients.indexOf(c),1);}}
async function rpc(c,name,args){const values=Object.values(args);const keys=Object.keys(args);const params=keys.map((k,i)=>`${k} => $${i+1}`).join(',');const r=await c.query(`SELECT public.${name}(${params}) AS value`,values);return r.rows[0].value;}
const propose=async(n,input,requestId=randomUUID())=>{await owner.query("UPDATE public.ai_actions SET created_at=clock_timestamp()-interval '2 minutes' WHERE user_id=$1",[user(n)]);return asUser(n,c=>rpc(c,'ai_workers_propose_action',{_org_id:n===6?org2:ORG,_conversation_id:conversation(n),_request_id:requestId,_input:input}));};
const note=body=>({kind:'arena_note',eventId:event,body});
const commercial=(kind,n)=>({kind,lotId:lot(n)});
const confirm=(c,a)=>rpc(c,'ai_workers_confirm_action',{_org_id:a.orgId,_action_id:a.id,_expected_revision:a.version});
const get=(c,a)=>rpc(c,'ai_workers_get_action',{_org_id:a.orgId,_action_id:a.id});
const manual=async(n,a)=>asUser(n,c=>rpc(c,'ai_workers_manual_action',{_org_id:a.orgId,_action_id:a.id,_expected_revision:a.version,_request_id:randomUUID(),_manual_input:a.kind==='commercial_reserve'?{kind:a.kind,companyName:'Empresa privada fixture',contactName:'Contato privado fixture',reservationExpiresAt:new Date(Date.now()+86400000).toISOString()}:{kind:a.kind,companyName:'Empresa privada fixture',contactName:null}}));
async function check(label,fn){await fn();report.checks.push({label,passed:true});console.log(`PASS ${label}`);}
async function denied(fn,pattern){await assert.rejects(fn,pattern);}
function extract(source,name){const start=source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);assert.ok(start>=0,name);const end=source.indexOf('\n$$;',start);assert.ok(end>start,name);return source.slice(start,end+4);}
async function scalar(sql,args=[]){return (await owner.query(sql,args)).rows[0].n;}
async function blocked(c){const until=Date.now()+2000;while(Date.now()<until){const r=await owner.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[c.processID]);if(r.rows[0]?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Second physical connection did not wait on a lock');}
try {
  report.version=(await owner.query('SELECT version() AS version')).rows[0].version;
  await owner.query('DROP SCHEMA public CASCADE;DROP SCHEMA IF EXISTS auth CASCADE;DROP SCHEMA IF EXISTS workers_private CASCADE;CREATE SCHEMA public');
  await owner.query(await read('scripts/workers/db-fixture.sql'));
  await owner.query(await read('supabase/migrations/20261016120000_workers_readonly_workspace.sql'));
  await owner.query(await read('scripts/workers/actions-fixture.sql'));
  const caps=await read('supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql');
  await owner.query(extract(caps,'venue_has_capability'));
  await owner.query(extract(caps,'venue_can_view_event'));
  const map=await read('supabase/migrations/20260805011308_bfacf637-b666-435a-88a4-8d9af2ba5f61.sql');
  await owner.query(extract(map,'can_view_commercial_map'));
  const native=await read('supabase/migrations/20260805012455_1844f1ca-ea09-4776-96f3-3d04eaf64ca6.sql');
  await owner.query(extract(native,'reserve_commercial_lot'));
  await owner.query(extract(native,'start_commercial_negotiation'));
  await owner.query(await read('supabase/migrations/20260911101225_b5a3559d-dd0c-4e24-9dc2-224ab8e2d4be.sql'));
  await owner.query(await read('supabase/migrations/20261016130000_workers_confirmed_actions.sql'));
  await check('private redactor removes whole compact/formatted identifiers and raw JWT before base phone masking',async()=>{
    for(const input of ['12.345.678/0001-95','12345678000195'])assert.equal((await owner.query('SELECT workers_private.redact_text($1) value',[input])).rows[0].value,'[documento protegido]');
    const jwt='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature';assert.equal((await owner.query('SELECT workers_private.redact_text($1) value',[jwt])).rows[0].value,'[segredo protegido]');
  });
  await check('private schema/helper/payload has no authenticated or anon privileges',async()=>{
    for(const role of ['authenticated','anon']) {
      assert.equal(await scalar('SELECT has_schema_privilege($1,\'workers_private\',\'USAGE\') n',[role]),false);
      assert.equal(await scalar("SELECT has_function_privilege($1,'workers_private.action_view(public.ai_actions,boolean)','EXECUTE') n",[role]),false);
      assert.equal(await scalar("SELECT has_table_privilege($1,'workers_private.ai_action_payloads','SELECT') n",[role]),false);
      assert.equal(await scalar("SELECT has_function_privilege($1,'public.ai_workers_confirm_action(uuid,uuid,integer)','EXECUTE') n",[role]),role==='authenticated');
    }
    await denied(()=>asUser(1,c=>c.query('SELECT workers_private.action_actor($1)',[ORG])),/permission denied/);
    await denied(()=>asUser(1,c=>c.query("INSERT INTO public.ai_actions(org_id) VALUES($1)",[ORG])),/permission denied/);
    await denied(()=>asUser(1,c=>c.query("UPDATE public.ai_actions SET receipt='{}',status='executed'")),/permission denied/);
    await denied(()=>asUser(1,c=>c.query('DELETE FROM public.ai_action_events')),/permission denied/);
  });
  await check('admin and gestor create notes, operator/read denied without manage; leitura with explicit venue grant works',async()=>{
    for(const n of [1,2]){const a=await propose(n,note(`Nota operacional papel ${n}`));const r=await asUser(n,c=>confirm(c,a));assert.equal(r.status,'executed');}
    for(const n of [3,4,5])await denied(()=>propose(n,note('Nota sem gestão')),/WORKERS_FORBIDDEN/);
    await owner.query('INSERT INTO public.user_capabilities VALUES($1,$2,$3),($1,$2,$4)',[ORG,user(5),'venue_events_access','venue_events_manage']);
    const a=await propose(5,note('Nota membro com grant explícito'));assert.equal((await asUser(5,c=>confirm(c,a))).status,'executed');
    assert.equal(await scalar('SELECT count(*)::int n FROM public.actions_test_external_effects'),0);
    assert.equal(await scalar('SELECT version n FROM public.venue_events WHERE id=$1',[event]),1);
  });
  await check('proposal is side-effect free; authorized exact note preview is absent in direct SELECT',async()=>{
    const before=await scalar('SELECT count(*)::int n FROM public.venue_event_notes');
    const a=await propose(1,note('Revisar equipamento às 18h'));
    assert.equal(a.diff[0].afterDisplay,'Revisar equipamento às 18h');
    const row=await asUser(1,c=>c.query('SELECT to_jsonb(a) value FROM public.ai_actions a WHERE id=$1',[a.id]));
    assert.ok(!JSON.stringify(row.rows).includes('Revisar equipamento'));
    assert.equal(await scalar('SELECT count(*)::int n FROM public.venue_event_notes'),before);
  });
  await check('known PII/secrets/token links, forbidden action kinds and client success/capability fields rejected by SQL',async()=>{
    for(const text of ['Email ana@example.com','CPF 123.456.789-00','CNPJ 12.345.678/0001-99','CNPJ 12345678000199','PIX: chaveprivada','Acesse /areas/p13/opaqueToken','Bearer abc.def.ghi','Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signatureFixture','Linha\ncom controle'])await denied(()=>propose(1,note(text)),/WORKERS_ACTION_SENSITIVE_TEXT/);
    for(const input of [{kind:'checklist',eventId:event},{kind:'delete',eventId:event},{...note('Nota'),receipt:{}},{...commercial('commercial_negotiate',1),companyName:'injetado'},{...note('Nota'),capabilities:['full_access']}])await denied(()=>propose(1,input),/WORKERS_(ACTION_NOT_ALLOWED|INVALID_REQUEST)/);
  });
  await check('proposal request replay is stable and mismatched reuse is rejected',async()=>{
    const key=randomUUID(),a=await propose(1,note('Nota idempotente'),key),b=await propose(1,note('Nota idempotente'),key);assert.equal(a.id,b.id);
    await denied(()=>propose(1,note('Nota diferente'),key),/WORKERS_IDEMPOTENCY_MISMATCH/);
  });
  await check('edit regenerates exact diff/revision and stale revision never executes',async()=>{
    const a=await propose(1,note('Antes da edição'));
    const b=await asUser(1,c=>rpc(c,'ai_workers_edit_action',{_org_id:ORG,_action_id:a.id,_expected_revision:a.version,_request_id:randomUUID(),_input:note('Depois da edição')}));
    assert.equal(b.version,2);assert.equal(b.diff[0].afterDisplay,'Depois da edição');
    await denied(()=>asUser(1,c=>confirm(c,a)),/WORKERS_ACTION_STALE/);
    assert.equal((await asUser(1,c=>confirm(c,b))).status,'executed');
  });
  await check('cancel and expiry are terminal, audited and wipe private plaintext',async()=>{
    const a=await propose(1,note('Nota cancelada'));
    const cancelled=await asUser(1,c=>rpc(c,'ai_workers_cancel_action',{_org_id:ORG,_action_id:a.id,_expected_revision:a.version}));assert.equal(cancelled.status,'cancelled');
    assert.equal((await asUser(1,c=>confirm(c,a))).status,'cancelled');
    const b=await propose(1,note('Nota expirada'));await owner.query("UPDATE public.ai_actions SET expires_at=clock_timestamp()-interval '1s' WHERE id=$1",[b.id]);
    assert.equal((await asUser(1,c=>confirm(c,b))).status,'expired');
    assert.equal(await scalar('SELECT count(*)::int n FROM workers_private.ai_action_payloads WHERE action_id=ANY($1::uuid[]) AND input IS NOT NULL',[[a.id,b.id]]),0);
    for(const [id,ev]of[[a.id,'cancelled'],[b.id,'expired']])assert.equal(await scalar('SELECT count(*)::int n FROM public.ai_action_events WHERE action_id=$1 AND event=$2',[id,ev]),1);
  });
  await check('cross-user/org and stale membership denied; raw RLS hides revoked target access',async()=>{
    const a=await propose(5,note('Nota para revogar grant'));
    await denied(()=>asUser(2,c=>get(c,a)),/WORKERS_FORBIDDEN/);
    await denied(()=>asUser(6,c=>get(c,{...a,orgId:org2})),/WORKERS_FORBIDDEN/);
    await denied(()=>propose(1,{kind:'arena_note',eventId:'60000000-0000-4000-8000-000000000002',body:'Outra org'}),/WORKERS_FORBIDDEN/);
    await denied(()=>propose(1,commercial('commercial_reserve',99)),/WORKERS_FORBIDDEN/);
    await owner.query("DELETE FROM public.user_capabilities WHERE user_id=$1 AND capability='venue_events_manage'",[user(5)]);
    await denied(()=>asUser(5,c=>confirm(c,a)),/WORKERS_FORBIDDEN/);
    await denied(()=>asUser(5,c=>get(c,a)),/WORKERS_FORBIDDEN/);
    assert.equal(await asUser(5,async c=>(await c.query('SELECT count(*)::int n FROM public.ai_actions WHERE id=$1',[a.id])).rows[0].n),0);
    const visible=await asUser(5,c=>rpc(c,'ai_workers_list_actions',{_org_id:ORG}));assert.ok(!visible.some(item=>item.id===a.id));
    const b=await propose(2,note('Nota associação desativada'));await owner.query('UPDATE public.org_members SET is_active=false WHERE user_id=$1',[user(2)]);
    await denied(()=>asUser(2,c=>confirm(c,b)),/WORKERS_FORBIDDEN/);await owner.query('UPDATE public.org_members SET is_active=true WHERE user_id=$1',[user(2)]);
    await denied(()=>asUser(1,async c=>{await c.query("SELECT set_config('request.jwt.claim.role','service_role',true)");return confirm(c,b);}),/WORKERS_FORBIDDEN/);
  });
  await check('snapshot change refuses effects and edit obtains a new valid snapshot',async()=>{
    const a=await propose(1,note('Nota versão do pai'));
    await owner.query('UPDATE public.venue_events SET version=version+1 WHERE id=$1',[event]);
    const changed=await asUser(1,c=>confirm(c,a));assert.equal(changed.failure.code,'snapshot_changed');assert.equal(changed.status,'proposed');assert.equal(changed.permissions.canConfirm,false);assert.equal(changed.permissions.canEdit,true);
    const b=await asUser(1,c=>rpc(c,'ai_workers_edit_action',{_org_id:ORG,_action_id:a.id,_expected_revision:a.version,_request_id:randomUUID(),_input:note('Nota atualizada para o novo contexto')}));
    assert.equal((await asUser(1,c=>confirm(c,b))).status,'executed');
  });
  await check('commercial manual form is mandatory/private; reserve and negotiate call native RPCs with optional fields NULL',async()=>{
    for(const [kind,n]of[['commercial_reserve',1],['commercial_negotiate',2]]){
      let a=await propose(1,commercial(kind,n));await denied(()=>asUser(1,c=>confirm(c,a)),/WORKERS_ACTION_MANUAL_REQUIRED/);
      a=await manual(1,a);const encoded=JSON.stringify(a);assert.ok(!encoded.includes('Empresa privada fixture'));assert.ok(!encoded.includes('Contato privado fixture'));
      const r=await asUser(1,c=>confirm(c,a));assert.equal(r.status,'executed');
      const table=kind==='commercial_reserve'?'lot_reservations':'lot_negotiations';const row=(await owner.query(`SELECT * FROM public.${table} WHERE id=$1`,[r.receipt.receiptId])).rows[0];
      assert.equal(row.company_name,'Empresa privada fixture');assert.equal(row.document_number,null);assert.equal(row.notes,null);if(kind==='commercial_reserve'){assert.equal(row.phone,null);assert.equal(row.email,null);}else assert.equal(row.proposed_value,null);
      const replay=await asUser(1,c=>confirm(c,a));assert.equal(replay.receipt.receiptId,r.receipt.receiptId);assert.equal(replay.receipt.replayed,true);
      assert.equal(await scalar(`SELECT count(*)::int n FROM public.${table} WHERE lot_id=$1`,[lot(n)]),1);
    }
    await denied(()=>propose(3,commercial('commercial_reserve',3)),/WORKERS_FORBIDDEN/);
    await owner.query('INSERT INTO public.user_capabilities VALUES($1,$2,$3)',[ORG,user(3),'map.manage_sales']);
    assert.equal((await propose(3,commercial('commercial_reserve',3))).kind,'commercial_reserve');
    await denied(()=>propose(7,commercial('commercial_reserve',4)),/WORKERS_FORBIDDEN/);
    await denied(()=>propose(4,commercial('commercial_reserve',4)),/WORKERS_FORBIDDEN/);
    await owner.query("INSERT INTO public.user_capabilities VALUES($1,$2,'map.view')",[ORG,user(5)]);
    const scoped=await manual(5,await propose(5,commercial('commercial_negotiate',13)));
    assert.equal((await asUser(5,c=>confirm(c,scoped))).status,'executed');
  });
  await check('AVAILABLE with active opposite operation, sale or order contract is refused without cancellation',async()=>{
    await owner.query("INSERT INTO public.lot_negotiations(lot_id,company_name,responsible_user_id) VALUES($1,'Negociação existente',$2)",[lot(5),user(1)]);
    await denied(()=>propose(1,commercial('commercial_reserve',5)),/WORKERS_ACTION_SNAPSHOT_CHANGED/);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.lot_negotiations WHERE lot_id=$1 AND status='ACTIVE'",[lot(5)]),1);
    await owner.query("INSERT INTO public.lot_reservations(lot_id,company_name,contact_name,responsible_user_id,expires_at) VALUES($1,'Reserva existente','Contato',$2,now()+interval '1 day')",[lot(6),user(1)]);
    await denied(()=>propose(1,commercial('commercial_negotiate',6)),/WORKERS_ACTION_SNAPSHOT_CHANGED/);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.lot_reservations WHERE lot_id=$1 AND status='ACTIVE'",[lot(6)]),1);
    await owner.query("INSERT INTO public.lot_sales(lot_id,status) VALUES($1,'OPEN')",[lot(7)]);await denied(()=>propose(1,commercial('commercial_reserve',7)),/WORKERS_ACTION_SNAPSHOT_CHANGED/);
    const id=randomUUID();await owner.query('INSERT INTO public.lot_contracts(id) VALUES($1)',[id]);await owner.query('INSERT INTO public.lot_contract_lots VALUES($1,$2)',[id,lot(8)]);
    await denied(()=>propose(1,commercial('commercial_reserve',8)),/WORKERS_ACTION_SNAPSHOT_CHANGED/);
  });
  await check('deep links use persisted venue type ancestry and exact lot UUID; target labels mask before truncation',async()=>{
    const a=await propose(1,note('Verificar endereço interno'));
    assert.equal(a.target.href,`/eventos-restaurante-arena/arena/agenda?evento=${event}&aba=historico`);
    assert.equal((await propose(1,commercial('commercial_negotiate',11))).target.href,`/mapa-comercial?lote=${lot(11)}`);
    const title='A'.repeat(150)+' private@example.com CNPJ 12.345.678/0001-99';await owner.query('UPDATE public.venue_events SET title=$1 WHERE id=$2',[title,event]);
    const masked=await propose(1,note('Nota com título protegido'));assert.ok(!masked.target.label.includes('private@'));assert.ok(!masked.target.label.includes('12.345.678'));
    await owner.query("UPDATE public.venue_events SET title='Evento operacional fixture' WHERE id=$1",[event]);
  });
  await check('manual request replay is idempotent; no private fields or secrets can escape its exact SQL schema',async()=>{
    const a=await propose(1,commercial('commercial_reserve',12));const key=randomUUID();const input={kind:a.kind,companyName:'Empresa privada fixture',contactName:'Contato privado fixture',reservationExpiresAt:new Date(Date.now()+86400000).toISOString()};
    const call=(_manual_input=input,_request_id=key)=>asUser(1,c=>rpc(c,'ai_workers_manual_action',{_org_id:ORG,_action_id:a.id,_expected_revision:a.version,_request_id,_manual_input}));
    const first=await call(),same=await call();assert.equal(first.version,2);assert.equal(same.version,2);assert.ok(!JSON.stringify(same).includes(input.contactName));
    await denied(()=>call({...input,email:'private@example.com'},randomUUID()),/WORKERS_INVALID_REQUEST/);
    await denied(()=>call({...input,companyName:'Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signatureFixture'},randomUUID()),/WORKERS_ACTION_SENSITIVE_TEXT/);
    await denied(()=>call({...input,companyName:'Outra empresa'},key),/WORKERS_IDEMPOTENCY_MISMATCH/);
  });
  await check('two physical connections confirming one note commit exactly one effect/receipt',async()=>{
    const a=await propose(1,note('Nota concorrente única'));
    const first=await connection(),second=await connection();await login(first);await login(second);
    const one=await confirm(first,a);const pending=confirm(second,a);await blocked(second);await first.query('COMMIT');const two=await pending;await second.query('COMMIT');
    assert.equal(one.receipt.receiptId,two.receipt.receiptId);assert.equal(two.receipt.replayed,true);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.venue_event_notes WHERE body='Nota concorrente única'"),1);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.ai_action_events WHERE action_id=$1 AND event='executed'",[a.id]),1);
  });
  await check('two distinct cards on one lot cannot create two commercial effects',async()=>{
    const a=await manual(1,await propose(1,commercial('commercial_reserve',10)));
    const b=await manual(2,await propose(2,commercial('commercial_negotiate',10)));
    const first=await connection(),second=await connection();await login(first);await login(second,2);
    assert.equal((await confirm(first,a)).status,'executed');const pending=confirm(second,b);await blocked(second);await first.query('COMMIT');const two=await pending;await second.query('COMMIT');assert.notEqual(two.status,'executed');
    assert.equal(await scalar('SELECT count(*)::int n FROM public.lot_reservations WHERE lot_id=$1',[lot(10)]),1);
    assert.equal(await scalar('SELECT count(*)::int n FROM public.lot_negotiations WHERE lot_id=$1',[lot(10)]),0);
  });
  await check('concurrent cancel wins before confirm without a business effect',async()=>{
    const a=await propose(1,note('Nota cancelada durante concorrência'));const first=await connection(),second=await connection();await login(first);await login(second);
    await rpc(first,'ai_workers_cancel_action',{_org_id:ORG,_action_id:a.id,_expected_revision:1});
    const pending=confirm(second,a);await blocked(second);await first.query('COMMIT');const result=await pending;await second.query('COMMIT');assert.equal(result.status,'cancelled');
    assert.equal(await scalar("SELECT count(*)::int n FROM public.venue_event_notes WHERE body='Nota cancelada durante concorrência'"),0);
  });
  await check('concurrent edit invalidates the waiting confirmation revision',async()=>{
    const a=await propose(1,note('Nota anterior concorrente'));const first=await connection(),second=await connection();await login(first);await login(second);
    const edited=await rpc(first,'ai_workers_edit_action',{_org_id:ORG,_action_id:a.id,_expected_revision:1,_request_id:randomUUID(),_input:note('Nota revisada concorrente')});
    const pending=confirm(second,a);const rejection=assert.rejects(pending,/WORKERS_ACTION_STALE/);await blocked(second);await first.query('COMMIT');await rejection;await second.query('ROLLBACK');
    assert.equal(edited.version,2);assert.equal(await scalar("SELECT count(*)::int n FROM public.venue_event_notes WHERE body='Nota anterior concorrente'"),0);
  });
  await check('capability revoked while confirm waits for card lock is revalidated and refused',async()=>{
    await owner.query("INSERT INTO public.user_capabilities VALUES($1,$2,'venue_events_manage')",[ORG,user(5)]);
    const a=await propose(5,note('Nota revogação durante espera'));const holder=await connection(),waiter=await connection();await holder.query('BEGIN');await holder.query('SELECT 1 FROM public.ai_actions WHERE id=$1 FOR UPDATE',[a.id]);await login(waiter,5);
    const pending=confirm(waiter,a);const rejection=assert.rejects(pending,/WORKERS_FORBIDDEN/);await blocked(waiter);
    await owner.query("DELETE FROM public.user_capabilities WHERE user_id=$1 AND capability='venue_events_manage'",[user(5)]);await holder.query('COMMIT');await rejection;await waiter.query('ROLLBACK');
    assert.equal(await scalar("SELECT count(*)::int n FROM public.venue_event_notes WHERE body='Nota revogação durante espera'"),0);
  });
  await check('expiry is checked after waiting on target locks, not transaction start',async()=>{
    const a=await propose(1,note('Nota expira durante lock'));
    await owner.query("UPDATE public.ai_actions SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE id=$1",[a.id]);
    const holder=await connection(),waiter=await connection();await holder.query('BEGIN');await holder.query('SELECT 1 FROM public.venue_events WHERE id=$1 FOR UPDATE',[event]);await login(waiter);
    const pending=confirm(waiter,a);await blocked(waiter);await new Promise(resolve=>setTimeout(resolve,300));await holder.query('COMMIT');const expired=await pending;await waiter.query('COMMIT');assert.equal(expired.status,'expired');
    assert.equal(await scalar("SELECT count(*)::int n FROM public.venue_event_notes WHERE body='Nota expira durante lock'"),0);
  });
  await check('an additional native trigger wait past expiry rolls back the late business effect',async()=>{
    await owner.query("CREATE FUNCTION public.actions_test_slow_note() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.body='Nota expira durante efeito' THEN PERFORM pg_sleep(0.3); END IF; RETURN NEW; END $$;CREATE TRIGGER actions_test_slow_note AFTER INSERT ON public.venue_event_notes FOR EACH ROW EXECUTE FUNCTION public.actions_test_slow_note()");
    const a=await propose(1,note('Nota expira durante efeito'));await owner.query("UPDATE public.ai_actions SET expires_at=clock_timestamp()+interval '200 milliseconds' WHERE id=$1",[a.id]);
    const result=await asUser(1,c=>confirm(c,a));assert.equal(result.status,'expired');assert.equal(result.receipt,null);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.venue_event_notes WHERE body='Nota expira durante efeito'"),0);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.audit_log WHERE after_data->>'body'='Nota expira durante efeito'"),0);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.ai_action_events WHERE action_id=$1 AND event='expired'",[a.id]),1);
    await owner.query('DROP TRIGGER actions_test_slow_note ON public.venue_event_notes;DROP FUNCTION public.actions_test_slow_note()');
  });
  await check('failure after native business RPC rolls back business/history and exposes no SQL secret',async()=>{
    await owner.query('CREATE TRIGGER actions_test_fail_receipt BEFORE INSERT ON public.ai_action_events FOR EACH ROW EXECUTE FUNCTION public.actions_test_force_audit_failure()');
    const a=await manual(1,await propose(1,commercial('commercial_reserve',19)));const r=await asUser(1,c=>confirm(c,a));assert.equal(r.status,'failed');assert.equal(r.failure.code,'execution_failed');assert.ok(!JSON.stringify(r).includes('secret-must-not-escape'));
    for(const table of ['lot_reservations','lot_status_history','map_activity_logs'])assert.equal(await scalar(`SELECT count(*)::int n FROM public.${table} WHERE lot_id=$1`,[lot(19)]),0);
    assert.equal(await scalar('SELECT status n FROM public.commercial_lots WHERE id=$1',[lot(19)]),'AVAILABLE');
    assert.equal(await scalar("SELECT count(*)::int n FROM public.ai_action_events WHERE action_id=$1 AND event='confirmed'",[a.id]),0);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.ai_action_events WHERE action_id=$1 AND event='failed'",[a.id]),1);
  });
  await check('lock wait is bounded and replay with the same proposal remains safe',async()=>{
    const a=await propose(1,note('Nota com lock ocupado'));const holder=await connection(),waiter=await connection();await holder.query('BEGIN');await holder.query('SELECT 1 FROM public.venue_events WHERE id=$1 FOR UPDATE',[event]);await login(waiter);
    const started=Date.now();await assert.rejects(confirm(waiter,a),error=>error.code==='55P03');assert.ok(Date.now()-started<7000);await waiter.query('ROLLBACK');await holder.query('COMMIT');
    assert.equal((await asUser(1,c=>get(c,a))).status,'proposed');assert.equal((await asUser(1,c=>confirm(c,a))).status,'executed');
  });
  await check('admission rate cap rejects excess proposals before business effects',async()=>{
    await owner.query("INSERT INTO public.user_capabilities VALUES($1,$2,'venue_events_access'),($1,$2,'venue_events_manage')",[ORG,user(4)]);
    for(let n=0;n<10;n++)await asUser(4,c=>rpc(c,'ai_workers_propose_action',{_org_id:ORG,_conversation_id:conversation(4),_request_id:randomUUID(),_input:note('Proposta limite '+n)}));
    await denied(()=>asUser(4,c=>rpc(c,'ai_workers_propose_action',{_org_id:ORG,_conversation_id:conversation(4),_request_id:randomUUID(),_input:note('Proposta excedente')})),/WORKERS_RATE_LIMITED/);
    assert.equal(await scalar("SELECT count(*)::int n FROM public.venue_event_notes WHERE body LIKE 'Proposta limite%'"),0);
  });
  report.passed=true;
} catch(error) {report.failure={message:error.message,code:error.code};console.error('Actions PostgreSQL QA failed:',error.message);process.exitCode=1;}
finally {
  for(const c of clients){try{await c.query('ROLLBACK');await c.end();}catch{/* cleanup */}}
  await owner.end();
  const output=path.join(root,'docs/workers/phase-2-3/actions-validation.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,output}));
}
