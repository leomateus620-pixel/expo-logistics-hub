"""Generate an isolated-schema rehearsal; roll back the entire schema afterwards."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];S=ROOT/'scripts/exporural/official-2026-10-20'
schema='exporural_qa_20261021'
state=(S/'state.sql').read_text()
apply=(ROOT/'supabase/migrations/20261021120000_exporural_official_october.sql').read_text()
rollback=(S/'rollback-body.sql').read_text()
tables=sorted(set(re.findall(r'public\.(\w+)',state+apply+rollback))-{'map_has_explicit_capability','commercial_lot_pricing_2028'})
sql='BEGIN;\nCREATE SCHEMA '+schema+';\n'
for t in tables:
 sql+=f'CREATE TABLE {schema}.{t} (LIKE public.{t} INCLUDING ALL);\n'
 sql+=f'''DO $copy$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position) INTO cols
 FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}' AND is_generated='NEVER';
 EXECUTE 'INSERT INTO {schema}.{t} ('||cols||') SELECT '||cols||' FROM public.{t}';
 END $copy$;\n'''
# Copy update/history triggers only. Canonical segment/RLS are tested separately
# in the production dry-run; never let a clone trigger mutate public tables.
live=json.load(open('/tmp/exporural-live-schema.json'))
archive=next(x['function'] for x in live['triggers'] if 'archive_map_geometry_revision()' in x['function'])
sql+=archive.replace('public.',schema+'.')+';\n'
sql+=f'CREATE TRIGGER archive_geometry BEFORE UPDATE ON {schema}.map_entity_geometries FOR EACH ROW EXECUTE FUNCTION {schema}.archive_map_geometry_revision();\n'
for t in ['map_entities','commercial_lots']:
 sql+=f'CREATE TRIGGER updated BEFORE UPDATE ON {schema}.{t} FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();\n'
# The pricing view needs the same rules, lots and overrides in the clone.
# The view definition is exported separately from the live database.
view=Path('/tmp/exporural-pricing-view.sql').read_text()
for t in tables:view=view.replace('public.'+t,schema+'.'+t)
sql+=f'CREATE VIEW {schema}.commercial_lot_pricing_2028 AS '+view+';\n'
def isolated(s):
 for t in tables+['commercial_lot_pricing_2028']:s=s.replace('public.'+t,schema+'.'+t)
 return s
sql+=isolated(apply)+'\n'+isolated(apply)+'\n'+isolated(rollback)+'\n'
sql+=f'''DO $qa$ DECLARE s uuid; r jsonb; BEGIN
 SELECT id INTO STRICT s FROM {schema}.map_reference_migration_snapshots
 WHERE source_revision='2028-exporural-2026-10-20.1' AND status='APPLIED';
 IF (SELECT count(*) FROM {schema}.commercial_lots WHERE project_id='0538d132-34dd-4347-a33c-526edac7339c' AND block IN ('R','S') AND lot_number IS NOT NULL AND archived_at IS NULL)<>107 THEN RAISE EXCEPTION 'QA_COUNT'; END IF;
 -- A later commercial write must block rollback, even with unchanged counts.
 UPDATE {schema}.lot_sales SET negotiated_value=negotiated_value+1 WHERE id='6b93b2ed-52ad-4bcb-9ef7-667c1a8b1b87';
 BEGIN
  PERFORM pg_temp.rollback_exporural_official(s,'Deve bloquear negócio posterior');
  RAISE EXCEPTION 'QA_EXPECTED_ROLLBACK_BLOCK';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'SUBSEQUENT_CHANGE_BLOCKS_ROLLBACK' THEN RAISE; END IF;
 END;
 UPDATE {schema}.lot_sales SET negotiated_value=negotiated_value-1 WHERE id='6b93b2ed-52ad-4bcb-9ef7-667c1a8b1b87';
 r:=pg_temp.rollback_exporural_official(s,'Ensaio isolado de rollback oficial');
 IF NOT (r->>'businessPreserved')::boolean THEN RAISE EXCEPTION 'QA_ROLLBACK_BUSINESS'; END IF;
 IF (SELECT count(*) FROM {schema}.commercial_lots WHERE project_id='0538d132-34dd-4347-a33c-526edac7339c' AND block IN ('R','S') AND lot_number IS NOT NULL AND archived_at IS NULL)<>100 THEN RAISE EXCEPTION 'QA_ROLLBACK_COUNT'; END IF;
 END $qa$;
 ROLLBACK;
 SELECT 'isolated_apply_replay_rollback_passed' result;
'''
Path('/tmp/exporural-isolated-qa.sql').write_text(sql)
