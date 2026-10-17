/** Isolated real PostgreSQL, synthetic questions/records only. No remote URLs,
 * .env, application auth session, or production writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const modulePath=process.argv[process.argv.indexOf('--pglite-module')+1];
if(!process.argv.includes('--pglite-module')||!path.isAbsolute(modulePath??''))throw new Error('Supply absolute --pglite-module path.');
const {PGlite}=await import(pathToFileURL(modulePath).href);const db=new PGlite();
const org='10000000-0000-4000-8000-000000000001',otherOrg='10000000-0000-4000-8000-000000000002';
const id=(prefix,n)=>`${prefix}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const project=id('2',1),checks=[],files=[],examples={};
const query=async(text,args=[]) =>(await db.query(text,args)).rows;
const value=async(text,args=[]) =>(await query(text,args))[0].value;
async function file(name){const body=await fs.readFile(path.join(root,name),'utf8');await db.exec(body);files.push({name,sha256:createHash('sha256').update(body).digest('hex')});}
async function as(n){await db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${user(n)}',false);`);}
async function check(name,fn){await fn();checks.push({name,passed:true});}
async function rejected(text,args=[],code='22023'){await assert.rejects(()=>query(text,args),error=>error.code===code);}
try{
  await file('scripts/workers/db-fixture.sql');
  await file('supabase/migrations/20261016120000_workers_readonly_workspace.sql');
  await db.exec(`
    ALTER TABLE org_members ADD COLUMN commission_id uuid,ADD COLUMN nome_exibicao text;
    CREATE TABLE commissions(id uuid PRIMARY KEY,org_id uuid,slug text,nome text);
    CREATE TABLE commission_responsibles(org_id uuid,user_id uuid,commission_id uuid,active boolean);
    INSERT INTO commissions VALUES('${id('a',1)}','${org}','central','Comissão Central'),('${id('a',2)}','${otherOrg}','central','Outra Central');
    UPDATE org_members SET commission_id='${id('a',1)}' WHERE user_id='${user(3)}';
    ALTER TABLE map_projects ADD COLUMN name text NOT NULL DEFAULT 'Referência geométrica 2026',ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
    CREATE TABLE commercial_price_rules(id uuid PRIMARY KEY,project_id uuid,exercise integer,is_active boolean);
    INSERT INTO commercial_price_rules VALUES('${id('b',1)}','${project}',2028,true);
    CREATE TABLE commercial_lots(id uuid PRIMARY KEY,project_id uuid,status text,archived_at timestamptz,display_name text,lot_number text,block text,
      official_area_sqm numeric,is_covered boolean,has_electricity boolean,has_water boolean,has_internet boolean);
    INSERT INTO commercial_lots SELECT ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${project}',
      CASE WHEN n%2=0 THEN 'AVAILABLE' ELSE 'SOLD' END,NULL,'Espaço comercial '||n,n::text,'Quadra '||lpad(((n-1)%25+1)::text,2,'0'),
      CASE WHEN n=200 THEN NULL ELSE 10 END,n%2=0,n%2=0,n%3=0,n%5=0 FROM generate_series(1,200)n;
    INSERT INTO commercial_lots VALUES('${id('5',201)}','${project}','AVAILABLE',now(),'Arquivado','201','Arquivo',999,false,false,false,false),
      ('${id('5',999)}','${id('2',2)}','AVAILABLE',NULL,'Outra organização','999','Outra',999,false,false,false,false);
    CREATE TABLE cronograma_eventos(id uuid PRIMARY KEY,org_id uuid,title text,status text,priority text,category text,location text,
      start_date date,end_date date,start_time time,end_time time,created_by_user_id uuid,
      has_exact_date boolean DEFAULT true,visible_to uuid);
    CREATE TABLE cronograma_evento_responsaveis(event_id uuid,org_id uuid,org_member_user_id uuid,name_snapshot text,is_primary boolean);
    CREATE TABLE cronograma_subeventos(id uuid PRIMARY KEY,parent_event_id uuid,status text,org_id uuid DEFAULT '${org}',commission_slug text);
    CREATE TABLE cronograma_subevento_responsaveis(subevent_id uuid,org_id uuid,org_member_user_id uuid,name_snapshot text,is_primary boolean);
    CREATE TABLE cronograma_evento_comissoes(org_id uuid,event_id uuid,commission_id uuid);
    INSERT INTO cronograma_eventos SELECT ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${org}',
      'Reunião operacional '||n,CASE WHEN n=125 THEN 'cancelado' WHEN n=4 THEN 'concluido' ELSE 'planejado' END,
      CASE WHEN n%2=0 THEN 'alta' ELSE 'media' END,'Operação','Sala '||((n-1)%25+1),
      CASE WHEN n=1 THEN date '2026-09-30' ELSE date '2026-10-15' END,
      CASE WHEN n=1 THEN date '2026-10-01' ELSE NULL END,
      CASE WHEN n=2 THEN NULL ELSE time '22:00' END,CASE WHEN n=2 THEN NULL ELSE time '01:00' END,
      '${user(1)}',true,CASE WHEN n=124 THEN '${user(1)}'::uuid ELSE NULL END FROM generate_series(1,125)n;
    INSERT INTO cronograma_eventos VALUES('${id('8',999)}','${otherOrg}','Evento de outra org','planejado','alta','Operação','Sala 1',
      '2026-10-15',NULL,'10:00','12:00','${user(6)}',true,NULL);
    INSERT INTO cronograma_evento_responsaveis SELECT id,'${org}','${user(1)}','Ana',true FROM cronograma_eventos WHERE org_id='${org}';
    INSERT INTO cronograma_evento_responsaveis SELECT id,'${org}','${user(1)}','Ana duplicada',false FROM cronograma_eventos WHERE org_id='${org}';
    INSERT INTO cronograma_subeventos VALUES('${id('d',1)}','${id('8',1)}','planejado');
    INSERT INTO cronograma_subevento_responsaveis VALUES('${id('d',1)}','${org}','${user(3)}','Operador vinculado',true);
    INSERT INTO cronograma_evento_comissoes SELECT '${org}',id,'${id('a',1)}' FROM cronograma_eventos WHERE org_id='${org}';
    GRANT SELECT ON org_members,commissions,commission_responsibles,map_projects,commercial_price_rules,commercial_lots,cronograma_eventos,
      cronograma_evento_responsaveis,cronograma_subeventos,cronograma_subevento_responsaveis,cronograma_evento_comissoes TO authenticated;
    ALTER TABLE cronograma_eventos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_events ON cronograma_eventos FOR SELECT TO authenticated USING(org_id IN(SELECT ai_workers_member_org_ids())
      AND (visible_to IS NULL OR visible_to=(SELECT auth.uid())));
    ALTER TABLE map_projects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_projects ON map_projects FOR SELECT TO authenticated USING(org_id IN(SELECT ai_workers_member_org_ids()));
    ALTER TABLE commercial_lots ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_lots ON commercial_lots FOR SELECT TO authenticated USING(project_id IN(SELECT id FROM map_projects));
  `);
  await file('drizzle/migrations/0009_migration.sql');
  await file('supabase/migrations/20261017020000_workers_verified_analytics.sql');
  await file('supabase/migrations/20261017040000_workers_question_analytics.sql');
  await db.exec(`ALTER TABLE cronograma_eventos ADD COLUMN linked_commissions jsonb DEFAULT '[]'::jsonb,ADD COLUMN commission_slug text;
    ALTER TABLE cronograma_evento_comissoes ADD COLUMN commission_slug text;
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
  const map=()=>value('SELECT workers_map_inventory_summary($1) value',[org]);
  const agenda=()=>value("SELECT workers_agenda_query($1,'2026-10-01','2026-10-31') value",[org]);
  await check('map totals and status groups cover all 200 active rows; list20 is only an illustration',async()=>{
    const data=await map();examples.inventory=data;assert.equal(data.metrics.total,200);assert.equal(data.rows.length,20);
    assert.equal(data.metrics.area_sqm,1990);assert.equal(data.metrics.missing_area,1);assert.equal(data.scope.edition_year,2028);
    assert.equal(data.groups.reduce((total,g)=>total+g.count,0),200);assert.deepEqual(data.groups.map(g=>g.label).sort(),['Disponível','Vendido']);
    assert.equal(data.scope.project_name,'Referência geométrica 2026');
  });
  await check('map filters apply before aggregation, including false booleans and zero area',async()=>{
    const data=await value("SELECT workers_map_inventory_summary(_org_id=>$1,_status=>'AVAILABLE',_covered=>true,_electricity=>true,_min_area=>0,_max_area=>10) value",[org]);
    assert.equal(data.metrics.total,99);assert.equal(data.metrics.area_sqm,990);assert.equal(data.scope.filters.covered,true);
    const falseFilter=await value('SELECT workers_map_inventory_summary(_org_id=>$1,_covered=>false) value',[org]);assert.equal(falseFilter.metrics.total,100);
  });
  await check('map block distribution aggregates 25 groups into 19 plus Others without losing or duplicating counts',async()=>{
    const data=await value("SELECT workers_map_inventory_summary(_org_id=>$1,_group_by=>'block') value",[org]);
    assert.equal(data.groups.length,20);assert.equal(data.groups.reduce((total,g)=>total+g.count,0),200);
    assert.equal(data.groups.find(g=>g.label==='Outros').count,48);
  });
  await check('map uses persisted commercial edition, clarifies wrong/ambiguous editions, never parses project name',async()=>{
    const data=await value('SELECT workers_map_inventory_summary(_org_id=>$1,_edition_year=>2026) value',[org]);assert.equal(data.needs_clarification,true);
    await db.exec('RESET ROLE');await query('INSERT INTO commercial_price_rules VALUES($1,$2,2030,true)',[id('b',2),project]);await as(1);
    assert.equal((await map()).needs_clarification,true);
    assert.equal((await value('SELECT workers_map_inventory_summary(_org_id=>$1,_edition_year=>2028) value',[org])).metrics.total,200);
    await db.exec('RESET ROLE');await query('DELETE FROM commercial_price_rules WHERE id=$1',[id('b',2)]);await as(1);
  });
  await check('Agenda complete count and valid scheduled duration do not depend on illustrative rows',async()=>{
    const data=await agenda();examples.agenda=data;assert.equal(data.metrics.total,124);assert.equal(data.rows.length,20);
    assert.equal(data.metrics.valid_duration_events,123);assert.equal(data.metrics.average_duration_minutes,180);
    assert.equal(data.groups.reduce((total,g)=>total+g.count,0),124);assert.match(data.rows[0].start_time,/22h00/);
  });
  await check('Agenda location distribution remains complete beyond chart and list limits',async()=>{
    const data=await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_group_by=>'location') value",[org]);
    assert.equal(data.groups.length,20);assert.equal(data.groups.reduce((total,g)=>total+g.count,0),124);
    assert.equal(new Set(data.groups.map(g=>g.label)).size,data.groups.length);
  });
  await check('Agenda explicit cancellation and combined category/priority/title/location/commission filters are exact',async()=>{
    assert.equal((await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_status=>'cancelado') value",[org])).metrics.total,1);
    const data=await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_category=>'Operação',_priority=>'alta',_search=>'operacional',_location=>'Sala 2',_commission_id=>$2) value",[org,id('a',1)]);
    assert.equal(data.metrics.total,3);assert.equal(data.scope.filters.priority,'alta');
    const wrong=await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_commission_id=>$2) value",[org,id('a',2)]);assert.equal(wrong.metrics.total,0);
  });
  await check('Agenda UUID relationship dedup and overlap weekday respect RLS, without matching names',async()=>{
    const linked=await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_relationship=>'linked') value",[org]);assert.equal(linked.metrics.total,124);
    await as(3);
    const own=await value("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_relationship=>'responsible',_weekday=>3) value",[org]);
    assert.equal(own.metrics.total,1);assert.equal((await agenda()).metrics.total,123);await as(1);
  });
  await check('wrong org/profile/access and invalid filters fail closed; queries remain invoker readers',async()=>{
    await rejected('SELECT workers_map_inventory_summary($1)',[otherOrg],'42501');
    await rejected("SELECT workers_agenda_query($1,'2026-10-31','2026-10-01')",[org]);
    await rejected("SELECT workers_map_inventory_summary(_org_id=>$1,_group_by=>'arbitrary_sql')",[org]);
    await rejected("SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',_weekday=>7)",[org]);
    await as(4);await rejected("SELECT workers_agenda_query($1,'2026-10-01','2026-10-31')",[org],'42501');
    await as(3);await rejected('SELECT workers_map_inventory_summary($1)',[org],'42501');await as(1);
    assert.deepEqual(await query("SELECT prosecdef FROM pg_proc WHERE proname IN('workers_map_inventory_summary','workers_agenda_query')"),[{prosecdef:false},{prosecdef:false}]);
  });
  await check('next authenticated read sees fixture status changes and a newly inserted event without cached totals',async()=>{
    const beforeMap=await map(),beforeAgenda=await agenda();await db.exec('RESET ROLE');
    await query("UPDATE commercial_lots SET status='AVAILABLE' WHERE id=$1",[id('5',1)]);
    await query("INSERT INTO cronograma_eventos(id,org_id,title,status,priority,category,location,start_date,start_time,end_time,created_by_user_id,has_exact_date) VALUES($1,$2,'Novo evento sintético','planejado','media','Operação','Sala 1','2026-10-20','10:00','12:00',$3,true)",[id('8',126),org,user(1)]);
    await as(1);const afterMap=await map(),afterAgenda=await agenda();
    assert.equal(afterMap.groups.find(g=>g.label==='Disponível').count,beforeMap.groups.find(g=>g.label==='Disponível').count+1);
    assert.equal(afterAgenda.metrics.total,beforeAgenda.metrics.total+1);
    await db.exec('RESET ROLE');await query("UPDATE commercial_lots SET status='SOLD' WHERE id=$1",[id('5',1)]);
    await query('DELETE FROM cronograma_eventos WHERE id=$1',[id('8',126)]);await as(1);
  });
  await check('an explicit zero area remains a value and passes inclusive zero filters',async()=>{
    await db.exec('RESET ROLE');await query('UPDATE commercial_lots SET official_area_sqm=0 WHERE id=$1',[id('5',2)]);await as(1);
    const data=await value('SELECT workers_map_inventory_summary(_org_id=>$1,_min_area=>0,_max_area=>0) value',[org]);
    assert.equal(data.metrics.total,1);assert.equal(data.metrics.area_sqm,0);assert.equal(data.metrics.missing_area,0);assert.equal(data.rows[0].area_sqm,0);
    await db.exec('RESET ROLE');await query('UPDATE commercial_lots SET official_area_sqm=10 WHERE id=$1',[id('5',2)]);await as(1);
  });
  await check('closed Agenda time and boundary filters partition the complete authorized set before aggregation',async()=>{
    const call=filter=>value(`SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',${filter}) value`,[org]);
    const missing=await call('_missing_time=>true'),valid=await call('_missing_time=>false');
    assert.equal(missing.metrics.total,1);assert.equal(valid.metrics.total,123);assert.equal(missing.metrics.valid_duration_events,0);
    assert.equal(missing.metrics.average_duration_minutes,null);assert.equal(missing.scope.filters.missing_time,true);
    assert.equal((await call('_cross_midnight=>true')).metrics.total,123);assert.equal((await call('_cross_midnight=>false')).metrics.total,1);
    assert.equal((await call('_cross_period=>true')).metrics.total,1);assert.equal((await call('_cross_period=>false')).metrics.total,123);
    assert.equal((await call('_start_in_period=>true')).metrics.total,123);assert.equal((await call('_start_in_period=>false')).metrics.total,1);
    assert.equal((await call('_start_in_period=>false')).scope.filters.start_in_period,false);
  });
  await check('Agenda missing fields, zero duration and outgoing overnight boundaries are honored together',async()=>{
    await db.exec('RESET ROLE');await query("UPDATE cronograma_eventos SET location='   ' WHERE id=$1",[id('8',2)]);
    await query("UPDATE cronograma_eventos SET category='   ',end_time=start_time WHERE id=$1",[id('8',4)]);
    await query("INSERT INTO cronograma_eventos(id,org_id,title,status,priority,category,location,start_date,start_time,end_time,created_by_user_id,has_exact_date) VALUES($1,$2,'Vigília sintética','planejado','media','Operação','Sala 1','2026-10-31','23:00','01:00',$3,true)",[id('8',127),org,user(1)]);
    await as(1);
    const call=filter=>value(`SELECT workers_agenda_query(_org_id=>$1,_from_date=>'2026-10-01',_to_date=>'2026-10-31',${filter}) value`,[org]);
    const missing=await call('_missing_time=>true');assert.equal(missing.metrics.total,2);assert.equal(missing.rows.length,2);
    assert.equal((await call('_missing_location=>true')).metrics.total,1);assert.equal((await call('_missing_category=>true')).metrics.total,1);
    assert.equal((await call('_missing_location=>false')).metrics.total,124);assert.equal((await call('_missing_category=>false')).metrics.total,124);
    const outgoing=await call('_cross_midnight=>true,_cross_period=>true,_start_in_period=>true');assert.equal(outgoing.metrics.total,1);
    assert.equal(outgoing.metrics.average_duration_minutes,120);assert.equal(outgoing.rows[0].title,'Vigília sintética');
    assert.equal(outgoing.scope.filters.cross_midnight,true);assert.equal(outgoing.scope.filters.start_in_period,true);
    await db.exec('RESET ROLE');await query("UPDATE cronograma_eventos SET location='Sala 2' WHERE id=$1",[id('8',2)]);
    await query("UPDATE cronograma_eventos SET category='Operação',end_time='01:00' WHERE id=$1",[id('8',4)]);
    await query('DELETE FROM cronograma_eventos WHERE id=$1',[id('8',127)]);await as(1);
  });
  await check('missing map identifiers and invalid or absent areas filter before totals, while false filters are retained',async()=>{
    await db.exec('RESET ROLE');await query('UPDATE commercial_lots SET lot_number=NULL WHERE id=$1',[id('5',1)]);
    await query("UPDATE commercial_lots SET lot_number='   ' WHERE id=$1",[id('5',2)]);
    await query('UPDATE commercial_lots SET official_area_sqm=-1 WHERE id=$1',[id('5',3)]);await as(1);
    const missingNumber=await value('SELECT workers_map_inventory_summary(_org_id=>$1,_missing_number=>true) value',[org]);
    assert.equal(missingNumber.metrics.total,2);assert.equal(missingNumber.rows.every(row=>row.number===null),true);
    assert.equal((await value('SELECT workers_map_inventory_summary(_org_id=>$1,_missing_number=>false) value',[org])).metrics.total,198);
    const missingArea=await value('SELECT workers_map_inventory_summary(_org_id=>$1,_missing_area=>true) value',[org]);
    assert.equal(missingArea.metrics.total,2);assert.equal(missingArea.metrics.missing_area,2);assert.equal(missingArea.metrics.area_sqm,0);
    assert.equal(missingArea.rows.every(row=>row.area_sqm===null),true);
    const known=await value('SELECT workers_map_inventory_summary(_org_id=>$1,_missing_area=>false) value',[org]);
    assert.equal(known.metrics.total,198);assert.equal(known.scope.filters.missing_area,false);
    const empty=await value('SELECT workers_map_inventory_summary(_org_id=>$1,_missing_number=>true,_missing_area=>true) value',[org]);
    assert.equal(empty.metrics.total,0);assert.deepEqual(empty.groups,[]);assert.deepEqual(empty.rows,[]);
    await db.exec('RESET ROLE');await query("UPDATE commercial_lots SET lot_number='1' WHERE id=$1",[id('5',1)]);
    await query("UPDATE commercial_lots SET lot_number='2' WHERE id=$1",[id('5',2)]);
    await query('UPDATE commercial_lots SET official_area_sqm=10 WHERE id=$1',[id('5',3)]);await as(1);
  });
  const report={boundary:'Fresh PostgreSQL WASM and synthetic identities/data only. Actual RPC bodies run under authenticated role and fixture business RLS. No deployed backend or real session is exercised.',passed:true,checks,files,examples};
  const out=path.join(root,'docs/workers/bot-fenasoja/question-analytics-validation.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:checks.length,report:out}));
}catch(error){console.error(error);process.exitCode=1;}finally{await db.close();}
