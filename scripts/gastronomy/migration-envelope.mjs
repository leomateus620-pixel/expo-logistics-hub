import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function buildMigrationEnvelope() {
  const version = '20261111190000';
  const name = 'commercial_gastronomy';
  const file = new URL(`../../supabase/migrations/${version}_${name}.sql`, import.meta.url);
  const source = await readFile(file, 'utf8');
  const prefix = 'BEGIN;';
  const suffix = source.match(/\nCOMMIT;\s*$/)?.[0];
  const delimiter = '$gastronomy_source_20261111190000$';
  if (!source.startsWith(prefix) || !suffix || source.includes(delimiter)) {
    throw new Error('Unexpected migration transaction format');
  }
  const hash = createHash('sha256').update(source).digest('hex');
  const sql = `DO $gastronomy_deploy$
DECLARE
  migration_source constant text := ${delimiter}${source}${delimiter};
  existing text[];
BEGIN
  PERFORM set_config('lock_timeout','8s',true);
  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-gastronomy-${version}',0));
  SELECT statements INTO existing FROM supabase_migrations.schema_migrations WHERE version='${version}';
  IF FOUND THEN
    IF existing IS DISTINCT FROM ARRAY[migration_source] THEN RAISE EXCEPTION 'MIGRATION_SOURCE_CONFLICT'; END IF;
    RETURN;
  END IF;
  EXECUTE left(substr(migration_source,${prefix.length + 1}),-${suffix.length});
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_lot_pricing_2028 p
    JOIN public.map_entities e ON e.id=p.entity_id AND e.project_id=p.project_id
    WHERE p.project_id='0538d132-34dd-4347-a33c-526edac7339c' AND p.commercial_unit='FOOD_POINT'
    HAVING count(*)=12 AND count(DISTINCT e.parent_entity_id)=6
      AND sum(p.renovacao_total)=386541 AND sum(p.segunda_total)=386541
  ) THEN RAISE EXCEPTION 'GASTRONOMY_INITIAL_TOTAL_MISMATCH'; END IF;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key)
  VALUES('${version}','${name}',ARRAY[migration_source],
    'Codex via Lovable; sha256=${hash}','commercial-gastronomy-${version}');
END $gastronomy_deploy$;`;
  return { sql, hash };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write((await buildMigrationEnvelope()).sql);
}
