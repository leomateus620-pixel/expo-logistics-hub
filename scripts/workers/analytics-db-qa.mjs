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
      start_time time,end_time time,created_by_user_id uuid,has_exact_date boolean DEFAULT true,visible_to uuid);
    CREATE TABLE cronograma_evento_responsaveis(event_id uuid,org_id uuid,org_member_user_id uuid,name_snapshot text,is_primary boolean);
    CREATE TABLE cronograma_subeventos(id uuid PRIMARY KEY,parent_event_id uuid,status text,org_id uuid DEFAULT '${org}',commission_slug text);
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
      '${user(1)}',true,CASE WHEN n=125 THEN '${user(1)}'::uuid ELSE NULL END FROM generate_series(1,125)n;
    INSERT INTO cronograma_eventos VALUES('${id('8',999)}','${otherOrg}','planejado','2026-10-10',NULL,'10:00','12:00','${user(6)}',true,NULL);
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
  await db.exec(`ALTER TABLE cronograma_eventos ADD COLUMN linked_commissions jsonb DEFAULT '[]'::jsonb,ADD COLUMN commission_slug text,ADD COLUMN title text DEFAULT 'Evento sintético',
      ADD COLUMN priority text DEFAULT 'media',ADD COLUMN category text DEFAULT 'Operação',ADD COLUMN location text DEFAULT 'Sala';
    CREATE TABLE cronograma_evento_comissoes(org_id uuid,event_id uuid,commission_id uuid,commission_slug text);
    CREATE TABLE cronograma_subevento_comissoes(org_id uuid,subevent_id uuid,commission_id uuid,commission_slug text);
    GRANT SELECT ON cronograma_evento_comissoes,cronograma_subevento_comissoes TO authenticated;`);
  await as(1);
  await check('observed schema excludes obsolete responsible column and reproduces previous reader failure',async()=>{
    assert.deepEqual(await query("SELECT column_name FROM information_schema.columns WHERE table_name='cronograma_eventos' AND column_name='responsible_user_id'"),[]);
    await assert.rejects(()=>value("SELECT workers_agenda_event_scope($1,'2026-10-01','2026-10-31') value",[org]),error=>error.code==='42703');
  });
  await db.exec('RESET ROLE');
  await file('supabase/migrations/20261017050000_workers_agenda_relationships.sql');
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
    assert.equal(data.people[0].events,124);assert.equal(data.people[0].person_id,user(1));assert.equal(data.people[0].name,'Ana da Silva');
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
  await check('nominal identity lookup keeps persisted homonyms separate and resolves an unambiguous person',async()=>{
    const homonyms=await value("SELECT workers_agenda_resolve_identity($1,'person','Ana da Silva') value",[org]);
    assert.equal(homonyms.complete,true);assert.equal(homonyms.identities.length,2);
    assert.deepEqual(homonyms.identities.map(p=>p.id),[user(1),user(2)]);
    await sql('RESET ROLE');await query('UPDATE org_members SET nome_exibicao=$1 WHERE org_id=$2 AND user_id=$3',['Fabiano Souza',org,user(3)]);await as(1);
    const found=await value("SELECT workers_agenda_resolve_identity($1,'person','fabiano souza') value",[org]);
    assert.deepEqual(found.identities,[{id:user(3),name:'Fabiano Souza',kind:'person'}]);examples.resolvedPerson=found;
    assert.deepEqual((await value("SELECT workers_agenda_resolve_identity($1,'person','Não existe') value",[org])).identities,[]);
    await denied("SELECT workers_agenda_resolve_identity($1,'person','Fabiano')",[otherOrg]);
  });
  await check('named person count uses that identity instead of authenticated caller and matches official relation selection',async()=>{
    await as(3);
    const named=await value("SELECT workers_agenda_person_events($1,$2,'2026-10-01','2026-10-31') value",[org,user(1)]);
    const manual=await value("SELECT count(DISTINCT e.id)::integer value FROM cronograma_eventos e JOIN cronograma_evento_responsaveis r ON r.event_id=e.id AND r.org_id=e.org_id WHERE e.org_id=$1 AND r.org_member_user_id=$2 AND e.status<>'cancelado' AND e.has_exact_date AND e.start_date<='2026-10-31' AND coalesce(e.end_date,e.start_date)>='2026-10-01'",[org,user(1)]);
    assert.equal(named.person.id,user(1));assert.equal(named.metrics.events,123);assert.equal(named.metrics.events,manual);examples.namedPerson=named;
    assert.equal((await value("SELECT workers_agenda_person_events($1,$2,'2026-10-01','2026-10-31') value",[org,user(3)])).metrics.events,0);
    await assert.rejects(()=>value("SELECT workers_agenda_person_events($1,$2,'2026-10-01','2026-10-31') value",[org,user(6)]),error=>error.code==='P0002');await as(1);
  });
  await check('authorized historical snapshot identity resolves when the current member display name is blank',async()=>{
    await sql('RESET ROLE');await query("UPDATE org_members SET nome_exibicao=' ' WHERE org_id=$1 AND user_id=$2",[org,user(2)]);await as(1);
    const found=await value("SELECT workers_agenda_resolve_identity($1,'person','Ana da Silva') value",[org]);
    assert.equal(found.identities.some(p=>p.id===user(2)),true);
    const named=await value("SELECT workers_agenda_person_events($1,$2,'2026-10-01','2026-10-31') value",[org,user(2)]);
    assert.equal(named.person.name,'Ana da Silva');assert.equal(named.metrics.events,124);
    await sql('RESET ROLE');await query('UPDATE org_members SET nome_exibicao=$1 WHERE org_id=$2 AND user_id=$3',['Ana da Silva',org,user(2)]);await as(1);
  });
  await check('creator-only events remain created metrics without becoming linked participation or ranked identities',async()=>{
    await sql('RESET ROLE');await query("INSERT INTO cronograma_eventos(id,org_id,status,start_date,start_time,end_time,created_by_user_id) VALUES($1,$2,'planejado','2026-10-20','10:00','12:00',$3)",[id('8',126),org,user(3)]);await as(3);
    const created=await value("SELECT workers_agenda_personal_summary($1,'2026-10-01','2026-10-31','created') value",[org]);
    const linked=await value("SELECT workers_agenda_personal_summary($1,'2026-10-01','2026-10-31','linked') value",[org]);
    assert.equal(created.metrics.events,1);assert.equal(created.metrics.created_events,1);assert.equal(created.metrics.linked_events,0);assert.equal(linked.metrics.events,0);
    const ranked=await value("SELECT workers_agenda_people_ranking($1,'2026-10-01','2026-10-31',30) value",[org]);
    assert.equal(ranked.people.some(p=>p.person_id===user(3)),false);assert.equal(ranked.metrics.event_count,124);
    await sql('RESET ROLE');await query('DELETE FROM cronograma_eventos WHERE id=$1',[id('8',126)]);await as(1);
  });
  await check('commission rankings use principal additional and subevent links once per event, preserve multi-commission totals',async()=>{
    await sql('RESET ROLE');
    await query("INSERT INTO commissions VALUES($1,$2,'expo-rural','Expo Rural'),($3,$2,'apoio','Apoio')",[id('a',2),org,id('a',3)]);
    await query('INSERT INTO cronograma_evento_comissoes(org_id,event_id,commission_id) SELECT $1,id,$2 FROM cronograma_eventos WHERE org_id=$1',[org,id('a',1)]);
    await query('INSERT INTO cronograma_evento_comissoes(org_id,event_id,commission_id) VALUES($1,$2,$3),($1,$2,$3),($1,$4,$3),($1,$5,$3)',[org,id('8',1),id('a',2),id('8',2),id('8',3)]);
    await query('INSERT INTO cronograma_subevento_comissoes(org_id,subevent_id,commission_id) VALUES($1,$2,$3),($1,$2,$4),($1,$2,$5)',[org,id('d',1),id('a',1),id('a',2),id('a',3)]);
    await query("INSERT INTO cronograma_subeventos(id,parent_event_id,status,org_id) VALUES($1,$2,'cancelado',$3)",[id('d',2),id('8',4),org]);
    await query('INSERT INTO cronograma_subevento_comissoes(org_id,subevent_id,commission_id) VALUES($1,$2,$3)',[org,id('d',2),id('a',2)]);await as(1);
    const data=await value("SELECT workers_agenda_commission_ranking($1,'2026-10-01','2026-10-31',30) value",[org]);examples.commissionRanking=data;
    assert.equal(data.metrics.event_count,124);assert.equal(data.metrics.commission_count,3);
    assert.deepEqual(data.commissions.map(c=>[c.slug,c.events]),[['central',124],['expo-rural',2],['apoio',1]]);
    assert.equal(data.commissions.reduce((n,c)=>n+c.events,0),127);
    const limited=await value("SELECT workers_agenda_commission_ranking($1,'2026-10-01','2026-10-31',1) value",[org]);
    assert.equal(limited.commissions.length,1);assert.equal(limited.commissions[0].events,124);assert.equal(limited.metrics.commission_count,3);
    const found=await value("SELECT workers_agenda_resolve_identity($1,'commission','Expo Rural') value",[org]);
    assert.deepEqual(found.identities,[{id:id('a',2),name:'Expo Rural',kind:'commission',visual_key:'expo-rural'}]);
    const filtered=await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_commission_id=>$2) value",[org,id('a',3)]);
    assert.equal(filtered.metrics.total,1);
    await sql('RESET ROLE');await query('UPDATE cronograma_eventos SET commission_slug=$1 WHERE id=$2',['expo-rural',id('8',5)]);
    await query('DELETE FROM cronograma_evento_comissoes WHERE org_id=$1 AND event_id=$2',[org,id('8',5)]);await as(1);
    const fallback=await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_commission_id=>$2) value",[org,id('a',2)]);
    assert.equal(fallback.metrics.total,3);
    await sql('RESET ROLE');await query('UPDATE cronograma_eventos SET linked_commissions=$1::jsonb WHERE id=$2',[
      JSON.stringify([{slug:'expo-rural'},{slug:'expo-rural'},{slug:'does-not-exist'}]),id('8',6)]);await as(1);
    const additional=await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_commission_id=>$2) value",[org,id('a',2)]);
    assert.equal(additional.metrics.total,4);
    const combined=await value("SELECT workers_agenda_commission_ranking($1,'2026-10-01','2026-10-31',30) value",[org]);
    assert.equal(combined.commissions.find(c=>c.slug==='expo-rural').events,4);
  });
  await check('all corrected and new Agenda readers preserve invoker execution and deny anonymous execution',async()=>{
    const names=['workers_agenda_event_scope','workers_agenda_personal_summary','workers_agenda_people_ranking','workers_agenda_query',
      'workers_agenda_person_links','workers_agenda_commission_links','workers_agenda_resolve_identity','workers_agenda_person_events','workers_agenda_commission_ranking'];
    const functions=await query("SELECT proname,prosecdef FROM pg_proc WHERE proname=ANY($1::text[]) ORDER BY proname",[names]);
    assert.equal(functions.length,9);assert.equal(functions.every(f=>f.prosecdef===false),true);
    await sql('RESET ROLE;SET ROLE anon');
    await denied("SELECT workers_agenda_commission_ranking($1,'2026-10-01','2026-10-31',10)",[org]);
    await denied("SELECT workers_agenda_resolve_identity($1,'person','Ana')",[org]);await as(1);
  });
  const report={boundary:'Fresh PostgreSQL WASM with synthetic identities and fixtures. Actual new SQL and workers persistence run as authenticated role. Fixture policies model existing business RLS; this is not deployed database, live data or physical device evidence.',passed:true,checks,files,examples};
  const out=path.join(root,'docs/workers/bot-fenasoja/analytics-validation.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:checks.length,report:out}));
}catch(error){console.error(error);process.exitCode=1;}finally{await db.close();}
