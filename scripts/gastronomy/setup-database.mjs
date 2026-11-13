import fs from 'node:fs/promises';
import postgres from 'postgres';
import { buildMigrationEnvelope } from './migration-envelope.mjs';

const read = (file) => fs.readFile(new URL(file, import.meta.url), 'utf8');
const migration = (name) => read('../../supabase/migrations/' + name);

function functionDefinition(sql, name) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
  const body = sql.slice(start);
  const tag = body.match(/\bAS\s+(\$[a-z_]*\$)/i)?.[1];
  if (start < 0 || !tag) throw new Error('Fixture definition missing: ' + name);
  const opening = body.indexOf(tag);
  const end = body.indexOf(tag, opening + tag.length);
  if (end < 0) throw new Error('Fixture definition is incomplete: ' + name);
  return body.slice(0, end + tag.length) + ';';
}

const dbName = 'gastronomy_qa';
const config = {host:'127.0.0.1',port:55438,user:'postgres',onnotice:()=>{}};
const admin = postgres({...config,database:'postgres'});
await admin.unsafe('DROP DATABASE IF EXISTS gastronomy_qa WITH (FORCE)');
await admin.unsafe('CREATE DATABASE gastronomy_qa');
await admin.end();
const db = postgres({...config,database:dbName,max:1});
try {
  await db.unsafe(await read('./schema-fixture.sql'));
  await db.unsafe(`
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,full_name text);
CREATE TABLE public.user_capabilities(user_id uuid,org_id uuid,capability text);
CREATE TABLE storage.objects(bucket_id text,name text,owner_id text,PRIMARY KEY(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(
  version text PRIMARY KEY, name text, statements text[], created_by text, idempotency_key text
);
CREATE FUNCTION public.is_org_member(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=$1 AND org_id=$2) $$;
CREATE FUNCTION public.get_user_org_role(uuid,uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'member'::text $$;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.map_has_explicit_capability(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=auth.uid() AND org_id=$1 AND capability=$2) $$;
CREATE FUNCTION public.map_capable_org_ids(text) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT org_id FROM public.user_capabilities WHERE user_id=auth.uid() AND capability=$1
$$;
CREATE POLICY fixture_contract_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='map-contracts' AND owner_id=auth.uid()::text
  AND split_part(name,'/',1)='00000000-0000-4000-a000-000000000001'
  AND public.map_has_explicit_capability('00000000-0000-4000-a000-000000000001','map.manage_contracts')
);
CREATE FUNCTION public.can_view_commercial_map(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.map_has_explicit_capability($1,'map.view') $$;
CREATE FUNCTION public.commercial_buyer_display_name(text,text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(nullif($1,''),$2) $$;
CREATE FUNCTION public.resolve_commission_map_segment_slug(text,jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $2->>'segmentId' $$;
CREATE FUNCTION public.resolve_commission_map_segment_slug_v2(text,jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $2->>'segmentId' $$;
CREATE FUNCTION public.ensure_commission_map_segments(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FIXTURE_MISSING_SEGMENTS'; END $$;
CREATE UNIQUE INDEX lot_sale_order_items_order_lot_uidx ON lot_sale_order_items(order_id,lot_id);
CREATE UNIQUE INDEX fixture_orders_idempotency ON lot_sale_orders(idempotency_key);
`);
  const definitions = [
    ['20260929212323_92cbb10a-72dc-44bf-9b26-d0971b346b92.sql', 'map_can_access_segment'],
    ['20261006205836_58212db1-66a0-421c-930c-6bb298530d78.sql', 'map_accessible_segment_ids'],
    ['20260805024054_f6ec5234-96e6-4205-92a1-57e4cad25639.sql', 'set_map_entity_canonical_segment'],
    ['20261005160542_2682ef9a-0db6-4548-a154-387b5cf213e1.sql', 'revise_sale_order_items'],
    ['20261005181153_de12d933-0d3d-4492-beca-78cec1c047fc.sql', 'get_sale_order_revisions'],
    ['20261021223000_commercial_sales_analytics.sql', 'confirm_sale_order_items'],
    ['20260929211814_22ba0d96-330c-4d85-9a35-9a1a69a78698.sql', 'get_commission_map_segment_inventory'],
    ['20261006202148_0eb20308-f82c-413a-b0fb-5a9695916bae.sql', 'commercial_map_lot_buyers'],
    ['20261023140000_workers_commercial_report_query.sql', 'workers_commercial_report_authorize'],
  ];
  for (const [file, name] of definitions) {
    await db.unsafe(functionDefinition(await migration(file), name));
  }
  await db.unsafe(await migration('20261001193000_commercial_dashboard_financial_embed.sql'));
  const eligibility = await migration('20260926072729_6daace25-33f1-4668-b879-04b5c306be7f.sql');
  await db.unsafe(eligibility.slice(eligibility.indexOf('CREATE OR REPLACE VIEW public.commercial_sale_eligibility'),
    eligibility.indexOf('CREATE OR REPLACE FUNCTION public.set_lot_price_override')));
  const wrapper = (await migration('20261002150426_ce99eb35-02d6-4db4-bcbe-1e79c564c06d.sql'))
    .split('-- Registro de pedido:')[1].split('-- Caminho legado.')[0];
  await db.unsafe(wrapper.slice(wrapper.indexOf('CREATE FUNCTION')));
  await db.unsafe(`
CREATE OR REPLACE FUNCTION public.map_segment_entities()
 RETURNS TABLE(id uuid, project_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.project_id FROM public.map_entities e
  WHERE e.is_archived = false AND e.segment_id IN (SELECT public.map_accessible_segment_ids());
$function$;

CREATE OR REPLACE FUNCTION public.map_segment_lot_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lot.id
  FROM public.commercial_lots lot
  JOIN public.map_entities entity ON entity.id = lot.entity_id AND entity.project_id = lot.project_id
  WHERE lot.archived_at IS NULL
    AND entity.is_archived = false
    AND entity.segment_id IN (SELECT public.map_accessible_segment_ids());
$function$;
CREATE TRIGGER map_entity_canonical_segment BEFORE INSERT OR UPDATE OF project_id,public_identifier,metadata,segment_id ON map_entities FOR EACH ROW EXECUTE FUNCTION set_map_entity_canonical_segment();
CREATE FUNCTION public.workers_require_read_scope(uuid) RETURNS void LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT public.is_org_member(auth.uid(),$1) THEN RAISE EXCEPTION 'FIXTURE_ACCESS_DENIED'; END IF;
END $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated,anon;
CREATE FUNCTION map_viewable_project_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT id FROM map_projects WHERE can_view_commercial_map(org_id) $$;
ALTER TABLE map_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_entity_geometries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY map_entities_select ON map_entities FOR SELECT TO authenticated USING(project_id IN (SELECT map_viewable_project_ids()));
CREATE POLICY map_entities_commission_segment_select ON map_entities FOR SELECT TO authenticated USING(NOT is_archived AND segment_id IN (SELECT map_accessible_segment_ids()));
CREATE POLICY commercial_lots_select ON commercial_lots FOR SELECT TO authenticated USING(project_id IN (SELECT map_viewable_project_ids()));
CREATE POLICY commercial_lots_commission_segment_select ON commercial_lots FOR SELECT TO authenticated USING(id IN (SELECT map_segment_lot_ids()));
CREATE POLICY map_geometries_select ON map_entity_geometries FOR SELECT TO authenticated USING(project_id IN (SELECT map_viewable_project_ids()));
CREATE POLICY map_geometries_commission_segment_select ON map_entity_geometries FOR SELECT TO authenticated USING(is_current AND (entity_id,project_id) IN (SELECT * FROM map_segment_entities()));
CREATE POLICY lot_prices_select ON lot_prices FOR SELECT TO authenticated USING(lot_id IN(SELECT id FROM commercial_lots));
CREATE POLICY lot_sales_test_policy ON lot_sales FOR SELECT TO authenticated USING(lot_id IN(SELECT id FROM commercial_lots WHERE map_has_explicit_capability((SELECT org_id FROM map_projects WHERE id=project_id),'map.manage_sales')));
INSERT INTO map_projects(id,org_id,name) VALUES('0538d132-34dd-4347-a33c-526edac7339c','00000000-0000-4000-a000-000000000001','Fenasoja 2028 QA');
INSERT INTO map_layers(project_id,layer_key,name) SELECT id,'structures','Estruturas' FROM map_projects;
INSERT INTO map_segments(project_id,slug,name,display_name,source_reference,required_capability)
SELECT id,s,s,s,'QA',replace(s,'-','_')||'_access' FROM map_projects CROSS JOIN unnest(ARRAY['exporural','industria-comercio-servicos','espaco-automovel']) s;
INSERT INTO map_entities(project_id,layer_id,public_identifier,name,classification,metadata)
SELECT l.project_id,l.id,v.code,v.name,v.kind,jsonb_strip_nulls(jsonb_build_object('segmentId',v.segment)) FROM map_layers l CROSS JOIN (VALUES
 ('C1','Centro de Eventos Fenasoja','EVENT_VENUE',NULL),('C2','Restaurante Central','RESTAURANT','industria-comercio-servicos'),('C3','Pizzaria','RESTAURANT','industria-comercio-servicos'),
 ('C4','Churrascaria Exporural','RESTAURANT','exporural'),('D1','Alameda Gastronômica','FOOD_AREA','industria-comercio-servicos'),
 ('D3','Espaço Mirante','ATTRACTION','industria-comercio-servicos'),('D4','Tenda da Pecuária','LIVESTOCK_AREA',NULL),
 ('B1','Pavilhão 1','PAVILION','industria-comercio-servicos')) v(code,name,kind,segment);
INSERT INTO map_entity_geometries(project_id,entity_id,geometry,change_reason)
SELECT project_id,id,'{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}','QA' FROM map_entities;
INSERT INTO map_entities(project_id,layer_id,public_identifier,name,classification,is_sellable,metadata,parent_entity_id)
SELECT l.project_id,l.id,v.code,v.code,v.kind,true,jsonb_build_object('segmentId',v.segment),p.id FROM map_layers l CROSS JOIN (VALUES
 ('B1-M001','INTERNAL_STAND','industria-comercio-servicos','B1'),
 ('Q-E-01','SELLABLE_LOT','industria-comercio-servicos',NULL),('Q-R-01','SELLABLE_LOT','exporural',NULL),
 ('Q-U-01','SELLABLE_LOT','espaco-automovel',NULL)) v(code,kind,segment,parent)
LEFT JOIN map_entities p ON p.public_identifier=v.parent;
INSERT INTO map_entity_geometries(project_id,entity_id,geometry,change_reason)
SELECT project_id,id,'{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}','QA' FROM map_entities WHERE is_sellable;
INSERT INTO commercial_lots(project_id,entity_id,public_identifier,display_name,block,lot_number,official_area_sqm,area_validation_status)
SELECT project_id,id,public_identifier,name,CASE WHEN classification='INTERNAL_STAND' THEN 'P1' ELSE split_part(public_identifier,'-',2) END,'1',20,'VALIDATED'
FROM map_entities WHERE is_sellable;
INSERT INTO commercial_price_rules(project_id,stage,scope_type,pavilion_identifier,block,price_per_sqm,priority,label)
SELECT p.id,s,CASE WHEN b='P1' THEN 'PAVILION' ELSE 'BLOCK' END,CASE WHEN b='P1' THEN b END,
 CASE WHEN b<>'P1' THEN b END,100,10,'QA' FROM map_projects p CROSS JOIN unnest(ARRAY['RENOVACAO','SEGUNDA_ETAPA']) s CROSS JOIN unnest(ARRAY['P1','E','R','U']) b;
INSERT INTO user_capabilities SELECT '00000000-0000-4000-a000-000000000010',org_id,cap FROM map_projects CROSS JOIN unnest(ARRAY['map.view','map.manage_sales','map.manage_contracts']) cap;
INSERT INTO user_capabilities SELECT '00000000-0000-4000-a000-000000000014',org_id,cap FROM map_projects CROSS JOIN unnest(ARRAY['map.view','map.manage_sales']) cap;
INSERT INTO profiles(user_id,full_name) VALUES ('00000000-0000-4000-a000-000000000010','Operador de teste');
INSERT INTO user_capabilities SELECT '00000000-0000-4000-a000-000000000011',org_id,'gastronomia_access' FROM map_projects;
INSERT INTO user_capabilities SELECT '00000000-0000-4000-a000-000000000012',org_id,'map.view' FROM map_projects;
INSERT INTO user_capabilities SELECT '00000000-0000-4000-a000-000000000013',org_id,'exporural_access' FROM map_projects;
`);
  await db.unsafe(await migration('20261023200000_workers_commercial_report_current_inventory.sql'));
  const { sql } = await buildMigrationEnvelope();
  await db.unsafe(sql);
  await db.unsafe(sql);
  await db.unsafe(await migration('20261112190000_commercial_contract_history.sql'));
  console.log('Banco descartável gastronomy_qa preparado em 127.0.0.1:55438.');
} catch(e) {
  console.error(e.message, e.code, e.where ?? '', e.detail ?? '', e.position ?? '');
  if(e.position && e.query) console.error(e.query.slice(+e.position-180,+e.position+100));
  process.exitCode=1;
} finally { await db.end(); }
