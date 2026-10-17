/** Real PostgreSQL WASM with synthetic records only; no .env, remote database,
 * service-role client, business mutations, or production credentials. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const modulePath=process.argv[process.argv.indexOf('--pglite-module')+1];
if(!process.argv.includes('--pglite-module')||!path.isAbsolute(modulePath??''))throw new Error('Supply absolute --pglite-module path.');
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
const org='10000000-0000-4000-8000-000000000001';
const otherOrg='10000000-0000-4000-8000-000000000002';
const user=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const id=(prefix,n)=>`${prefix}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const project=id('2',1),otherProject=id('2',2),conversation=id('9',1);
const checks=[],files=[],examples={};
const sql=async text=>db.exec(text);
async function file(name){const body=await fs.readFile(path.join(root,name),'utf8');await sql(body);files.push({name,sha256:createHash('sha256').update(body).digest('hex')});}
async function query(text,args=[]){return(await db.query(text,args)).rows;}
async function value(text,args=[]){return(await query(text,args))[0].value;}
async function as(n){await sql(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${user(n)}',false);`);}
async function check(name,fn){await fn();checks.push({name,passed:true});}
async function denied(text,args=[]){await assert.rejects(()=>query(text,args),error=>error.code==='42501');}
try{
  await file('scripts/workers/db-fixture.sql');
  await file('supabase/migrations/20261016120000_workers_readonly_workspace.sql');
  await sql(`
    ALTER TABLE org_members ADD COLUMN commission_id uuid,ADD COLUMN nome_exibicao text;
    UPDATE org_members SET nome_exibicao=CASE WHEN user_id IN ('${user(1)}','${user(2)}') THEN 'Ana da Silva' ELSE 'Pessoa '||right(user_id::text,1) END;
    CREATE TABLE commissions(id uuid PRIMARY KEY,org_id uuid,slug text,nome text);
    CREATE TABLE commission_responsibles(org_id uuid,user_id uuid,commission_id uuid,active boolean);
    INSERT INTO commissions VALUES('${id('a',1)}','${org}','central','Comissão Central');
    UPDATE org_members SET commission_id='${id('a',1)}' WHERE user_id='${user(3)}';
    ALTER TABLE map_projects ADD COLUMN name text NOT NULL DEFAULT 'Mapa sintético',ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
    CREATE TABLE commercial_price_rules(id uuid PRIMARY KEY,project_id uuid,exercise integer,is_active boolean);
    CREATE TABLE commercial_lots(id uuid PRIMARY KEY,project_id uuid,status text);
    CREATE TABLE lot_sale_orders(id uuid PRIMARY KEY,project_id uuid,status text,reverted_at timestamptz);
    CREATE TABLE lot_sales(id uuid PRIMARY KEY,lot_id uuid,status text,reverted_at timestamptz);
    CREATE TABLE lot_sale_order_items(id uuid PRIMARY KEY,order_id uuid,lot_id uuid,contract_state text,item_total numeric,pricing_rule_id uuid,sale_id uuid,
      created_at timestamptz DEFAULT '2026-10-15T12:00:00-03:00',signed_at timestamptz DEFAULT '2026-10-16T12:00:00-03:00',cancelled_at timestamptz DEFAULT '2026-10-17T12:00:00-03:00');
    CREATE TABLE cronograma_eventos(id uuid PRIMARY KEY,org_id uuid,status text,start_date date,end_date date,
      start_time time,end_time time,created_by_user_id uuid,responsible_user_id uuid,has_exact_date boolean DEFAULT true,visible_to uuid);
    CREATE TABLE cronograma_evento_responsaveis(event_id uuid,org_id uuid,org_member_user_id uuid,name_snapshot text,is_primary boolean);
    CREATE TABLE cronograma_subeventos(id uuid PRIMARY KEY,parent_event_id uuid,status text);
    CREATE TABLE cronograma_subevento_responsaveis(subevent_id uuid,org_id uuid,org_member_user_id uuid,name_snapshot text,is_primary boolean);
    GRANT SELECT ON org_members,commissions,commission_responsibles,map_projects,commercial_price_rules,commercial_lots,
      lot_sale_orders,lot_sales,lot_sale_order_items,cronograma_eventos,cronograma_evento_responsaveis,
      cronograma_subeventos,cronograma_subevento_responsaveis TO authenticated;
    ALTER TABLE cronograma_eventos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_visible ON cronograma_eventos FOR SELECT TO authenticated USING(
      org_id IN(SELECT ai_workers_member_org_ids()) AND (visible_to IS NULL OR visible_to=(SELECT auth.uid())));
    ALTER TABLE map_projects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_projects ON map_projects FOR SELECT TO authenticated USING(org_id IN(SELECT ai_workers_member_org_ids()));
    INSERT INTO commercial_price_rules VALUES('${id('b',1)}','${project}',2028,true),('${id('b',2)}','${project}',2026,false),('${id('b',3)}','${otherProject}',2028,true);
    INSERT INTO lot_sale_orders VALUES('${id('c',1)}','${project}','CONFIRMED',NULL),('${id('c',2)}','${otherProject}','CONFIRMED',NULL);
    INSERT INTO commercial_lots SELECT ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${project}','SOLD' FROM generate_series(1,155)n;
    INSERT INTO lot_sales SELECT ('60000000-0000-4000-8000-'||right(id::text,12))::uuid,id,CASE WHEN right(id::text,3)='151' THEN 'OPEN' ELSE 'CONFIRMED' END,NULL FROM commercial_lots;
    INSERT INTO lot_sale_order_items(id,order_id,lot_id,contract_state,item_total,pricing_rule_id,sale_id) SELECT ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id('c',1)}',
      ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      CASE WHEN n=151 THEN 'PENDING_SIGNATURE' WHEN n=152 THEN 'CANCELLED' WHEN n=153 THEN 'LEGACY_UNVERIFIED' ELSE 'SIGNED' END,
      CASE WHEN n=155 THEN NULL ELSE 100 END,
      CASE WHEN n=154 THEN '${id('b',2)}' ELSE '${id('b',1)}' END::uuid,
      ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,155)n;
    INSERT INTO commercial_lots VALUES('${id('5',999)}','${otherProject}','SOLD');
    INSERT INTO lot_sales VALUES('${id('6',999)}','${id('5',999)}','CONFIRMED',NULL);
    INSERT INTO lot_sale_order_items(id,order_id,lot_id,contract_state,item_total,pricing_rule_id,sale_id) VALUES('${id('7',999)}','${id('c',2)}','${id('5',999)}','SIGNED',999999,'${id('b',3)}','${id('6',999)}');
    INSERT INTO commercial_lots VALUES('${id('5',156)}','${project}','SOLD'),('${id('5',157)}','${project}','SOLD');
    INSERT INTO lot_sales VALUES('${id('6',156)}','${id('5',156)}','CONFIRMED',NULL),('${id('6',157)}','${id('5',157)}','CONFIRMED',NULL);
    INSERT INTO lot_sale_order_items(id,order_id,lot_id,contract_state,item_total,pricing_rule_id,sale_id) VALUES('${id('7',156)}','${id('c',1)}','${id('5',156)}','SIGNED',99999,NULL,'${id('6',156)}');
    INSERT INTO cronograma_eventos SELECT ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${org}',
      CASE WHEN n=3 THEN 'cancelado' WHEN n=4 THEN 'concluido' ELSE 'planejado' END,
      CASE WHEN n=1 THEN date '2026-09-30' ELSE date '2026-10-15' END,
      CASE WHEN n=1 THEN date '2026-10-01' ELSE NULL END,
      CASE WHEN n=2 THEN NULL ELSE time '22:00' END,
      CASE WHEN n=2 THEN NULL ELSE time '01:00' END,
      '${user(1)}','${user(1)}',true,CASE WHEN n=125 THEN '${user(1)}'::uuid ELSE NULL END FROM generate_series(1,125)n;
    INSERT INTO cronograma_eventos VALUES('${id('8',999)}','${otherOrg}','planejado','2026-10-10',NULL,'10:00','12:00','${user(6)}',NULL,true,NULL);
    INSERT INTO cronograma_evento_responsaveis SELECT id,'${org}','${user(1)}','Ana da Silva',true FROM cronograma_eventos WHERE org_id='${org}';
    INSERT INTO cronograma_evento_responsaveis SELECT id,'${org}','${user(2)}','Ana da Silva',false FROM cronograma_eventos WHERE org_id='${org}';
    INSERT INTO cronograma_evento_responsaveis SELECT id,'${org}','${user(1)}','Ana repetida',false FROM cronograma_eventos WHERE org_id='${org}';
    INSERT INTO cronograma_evento_responsaveis VALUES('${id('8',1)}','${org}',NULL,'Externo sem identidade',false);
    INSERT INTO cronograma_subeventos VALUES('${id('d',1)}','${id('8',1)}','planejado');
    INSERT INTO cronograma_subevento_responsaveis VALUES('${id('d',1)}','${org}','${user(1)}','Ana da Silva',true);
    INSERT INTO ai_conversations(id,org_id,user_id,title,worker_id) VALUES('${conversation}','${org}','${user(1)}','Histórico sintético','agenda');
    INSERT INTO ai_messages(id,org_id,user_id,conversation_id,request_id,role,worker_id,content,state,created_at) VALUES
      ('ffffffff-0000-4000-8000-000000000001','${org}','${user(1)}','${conversation}','${id('e',1)}','user','agenda','Pergunta 1','complete','2026-01-01'),
      ('00000000-0000-4000-8000-000000000100','${org}','${user(1)}','${conversation}','${id('e',1)}','assistant','agenda','Resposta 1','complete','2026-01-01'),
      ('ffffffff-0000-4000-8000-000000000002','${org}','${user(1)}','${conversation}','${id('e',2)}','user','agenda','Pergunta 2','complete','2026-01-01'),
      ('00000000-0000-4000-8000-000000000101','${org}','${user(1)}','${conversation}','${id('e',2)}','assistant','agenda','Resposta 2','complete','2026-01-01');
  `);
  await file('drizzle/migrations/0009_migration.sql');
  await file('supabase/migrations/20261017010000_workers_message_order.sql');
  await file('supabase/migrations/20261017020000_workers_verified_analytics.sql');
  await as(1);
  const map=()=>value('SELECT workers_map_sales_overview($1,NULL,2028) value',[org]);
  const personal=()=>value("SELECT workers_agenda_personal_summary($1,'2026-10-01','2026-10-31','linked') value",[org]);
  const ranking=()=>value("SELECT workers_agenda_people_ranking($1,'2026-10-01','2026-10-31',1) value",[org]);
  await check('complete commercial aggregation exceeds 100-row list, one multi-lot partial order, cancelled/legacy/other edition excluded',async()=>{
    const data=await map();examples.map=data;assert.equal(data.metrics.confirmed_value_cents,1500000);assert.equal(data.metrics.open_value_cents,10000);
    assert.equal(data.metrics.confirmed_orders,1);assert.equal(data.metrics.open_orders,1);assert.equal(data.metrics.confirmed_lots,151);
    assert.equal(data.metrics.cancelled_lots,1);assert.equal(data.metrics.legacy_lots,1);assert.equal(data.metrics.missing_value_lots,1);
    assert.equal(data.metrics.unallocated_lots,2);
    assert.equal(data.scope.edition_year,2028);assert.equal(data.scope.complete,true);
  });
  await check('Agenda identity and distinct parent events, cancel excluded, cross-month and missing duration handled',async()=>{
    const data=await personal();examples.agenda=data;assert.equal(data.metrics.events,124);assert.equal(data.metrics.created_events,124);
    assert.equal(data.metrics.responsible_events,124);assert.equal(data.metrics.valid_duration_events,123);
    assert.equal(data.metrics.average_duration_minutes,180);assert.equal(data.metrics.completed_events,1);
    assert.equal(data.metrics.weekday_counts.reduce((n,d)=>n+d.events,0),124);
  });
  await check('ranking aggregates before presentation limit, distinguishes homonyms, deterministic ties, does not add links',async()=>{
    const data=await ranking();examples.ranking=data;assert.equal(data.metrics.people_count,2);assert.equal(data.people.length,1);
    assert.equal(data.people[0].events,124);assert.equal(data.people[0].person_id,user(1));assert.match(data.people[0].name,/vínculo/);
    assert.equal(data.metrics.unidentified_links,1);
  });
  await check('persisted explicit edition beats current commercial configuration without mixing years',async()=>{
    const data=await value('SELECT workers_map_sales_overview($1,NULL,2026) value',[org]);
    assert.equal(data.scope.edition_year,2026);assert.equal(data.metrics.confirmed_value_cents,10000);assert.equal(data.metrics.confirmed_lots,1);
    assert.equal((await value('SELECT workers_map_sales_overview($1,NULL,2024) value',[org])).needs_clarification,true);
  });
  await check('sales period uses local signature dates and open-item creation without claiming historical status',async()=>{
    const during=await value("SELECT workers_map_sales_overview($1,NULL,2028,'2026-10-16','2026-10-16') value",[org]);
    assert.equal(during.metrics.confirmed_value_cents,1500000);assert.equal(during.metrics.open_value_cents,0);
    assert.deepEqual(during.scope.period,{from:'2026-10-16',to:'2026-10-16'});
    const prior=await value("SELECT workers_map_sales_overview($1,NULL,2028,'2026-10-15','2026-10-15') value",[org]);
    assert.equal(prior.metrics.confirmed_value_cents,0);assert.equal(prior.metrics.open_value_cents,10000);
    await assert.rejects(()=>value("SELECT workers_map_sales_overview($1,NULL,2028,'2026-10-15',NULL) value",[org]),error=>error.code==='22023');
  });
  await check('ambiguous configured editions require clarification and unsafe currency totals fail closed',async()=>{
    await sql('RESET ROLE');await query('UPDATE commercial_price_rules SET is_active=true WHERE id=$1',[id('b',2)]);await as(1);
    assert.equal((await value('SELECT workers_map_sales_overview($1,NULL,NULL) value',[org])).needs_clarification,true);
    await sql('RESET ROLE');await query('UPDATE commercial_price_rules SET is_active=false WHERE id=$1',[id('b',2)]);
    await query('UPDATE lot_sale_order_items SET item_total=999999999999999999 WHERE id=$1',[id('7',1)]);await as(1);
    await assert.rejects(()=>map(),error=>error.code==='22003');
    await sql('RESET ROLE');await query('UPDATE lot_sale_order_items SET item_total=100 WHERE id=$1',[id('7',1)]);await as(1);
  });
  await check('invalid Agenda periods fail before reading and anonymous sessions cannot aggregate',async()=>{
    await assert.rejects(()=>value("SELECT workers_agenda_people_ranking($1,'2026-10-31','2026-10-01',10) value",[org]),error=>error.code==='22023');
    await sql("SELECT set_config('request.jwt.claim.sub','',false)");await denied("SELECT workers_agenda_people_ranking($1,'2026-10-01','2026-10-31',10)",[org]);await as(1);
  });
  await check('wrong organization, unapproved profile and missing sales capability denied',async()=>{
    await denied('SELECT workers_map_sales_overview($1,NULL,2028)',[otherOrg]);await as(4);
    await denied("SELECT workers_agenda_personal_summary($1,'2026-10-01','2026-10-31','linked')",[org]);
    await as(3);await denied('SELECT workers_map_sales_overview($1,NULL,2028)',[org]);
  });
  await check('authorized Agenda profile receives only caller-visible events even when aggregate exceeds a page',async()=>{
    const data=await ranking();assert.equal(data.metrics.event_count,123);assert.equal(data.people[0].events,123);await as(1);
  });
  await check('legacy equal timestamp backfill and whole-turn keyset pagination',async()=>{
    const latest=await query('SELECT role,content,message_seq FROM ai_workers_read_history($1,$2,NULL,1)',[org,conversation]);
    assert.deepEqual(latest.map(r=>r.content),['Pergunta 2','Resposta 2']);
    const previous=await query('SELECT role,content FROM ai_workers_read_history($1,$2,$3,1)',[org,conversation,latest[0].message_seq]);
    assert.deepEqual(previous.map(r=>r.content),['Pergunta 1','Resposta 1']);
  });
  await check('pending response has a fixed sequence; completion/replay does not move or duplicate a turn',async()=>{
    const request=id('e',3);await query("SELECT ai_workers_begin_turn($1,$2,'agenda','Próxima pergunta',$3)",[org,request,conversation]);
    const before=await query('SELECT role,message_seq FROM ai_messages WHERE request_id=$1 ORDER BY message_seq',[request]);
    assert.deepEqual(before.map(r=>r.role),['user','assistant']);
    const reopenedPending=await query('SELECT role,state FROM ai_workers_read_history($1,$2,NULL,1)',[org,conversation]);
    assert.deepEqual(reopenedPending,[{role:'user',state:'complete'},{role:'assistant',state:'pending'}]);
    await query("SELECT ai_workers_finish_turn($1,$2,'Resposta verificada','[]','google/gemini-2.5-flash',1,1)",[org,request]);
    const replay=await value("SELECT ai_workers_begin_turn($1,$2,'agenda','Próxima pergunta',$3) value",[org,request,conversation]);
    assert.equal(replay.replayed,true);assert.deepEqual(await query('SELECT role,message_seq FROM ai_messages WHERE request_id=$1 ORDER BY message_seq',[request]),before);
  });
  await check('reopening failed turns retains question and response slot; null page limits cannot become unbounded',async()=>{
    const request=id('e',4);await query("SELECT ai_workers_begin_turn($1,$2,'agenda','Pergunta interrompida',$3)",[org,request,conversation]);
    await query('SELECT ai_workers_fail_turn($1,$2)',[org,request]);
    const reopened=await query('SELECT role,state FROM ai_workers_read_history($1,$2,NULL,1)',[org,conversation]);
    assert.deepEqual(reopened,[{role:'user',state:'complete'},{role:'assistant',state:'failed'}]);
    await assert.rejects(()=>query('SELECT * FROM ai_workers_read_history($1,$2,NULL,NULL)',[org,conversation]),error=>error.code==='22023');
  });
  const report={boundary:'Fresh PostgreSQL WASM with synthetic identities and fixtures. Actual new SQL and workers persistence run as authenticated role. Fixture policies model existing business RLS; this is not deployed database, live data or physical device evidence.',passed:true,checks,files,examples};
  const out=path.join(root,'docs/workers/bot-fenasoja/analytics-validation.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:checks.length,report:out}));
}catch(error){console.error(error);process.exitCode=1;}finally{await db.close();}
