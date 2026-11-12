import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const migrations = {
  '20261112120000': {
    name: 'soja_store_catalog',
    tables: ['scopes', 'access_grants', 'products', 'variants', 'requests', 'audit'],
    functions: ['soja_store_access', 'soja_store_request_status', 'soja_store_catalog', 'soja_store_product', 'soja_store_save_product'],
  },
  '20261112120100': {
    name: 'soja_store_directory',
    tables: ['locations', 'suppliers'],
    functions: ['soja_store_locations', 'soja_store_suppliers', 'soja_store_save_location', 'soja_store_save_supplier'],
  },
  '20261112120200': {
    name: 'soja_store_purchases_stock',
    tables: ['purchases', 'purchase_lines', 'purchase_receipts', 'purchase_receipt_lines', 'stock_movements'],
    functions: [
      'soja_store_create_purchase', 'soja_store_receive_purchase', 'soja_store_purchases', 'soja_store_purchase',
      'soja_store_purchase_options', 'soja_store_stock', 'soja_store_stock_movements', 'soja_store_stock_options',
    ],
  },
  '20261112120300': {
    name: 'soja_store_import_staging',
    tables: ['import_batches', 'import_lines', 'import_line_reviews'],
    functions: [
      'soja_store_stage_import', 'soja_store_import_batches', 'soja_store_import_preview',
      'soja_store_review_import_line', 'soja_store_review_import_batch',
    ],
  },
  '20261112120400': {
    name: 'soja_store_overview',
    tables: [],
    functions: ['soja_store_dashboard'],
  },
};

function sqlArray(values) {
  return `ARRAY[${values.map((value) => `'${value}'`).join(', ')}]::text[]`;
}

export async function buildMigrationEnvelope(version) {
  const entry = migrations[version];
  if (!entry) throw new Error('Versão de migração Soja Store desconhecida.');
  const file = new URL(`../../supabase/migrations/${version}_${entry.name}.sql`, import.meta.url);
  const source = await readFile(file, 'utf8');
  const prefix = 'BEGIN;';
  const suffix = source.match(/\nCOMMIT;\s*$/)?.[0];
  const delimiter = `$soja_store_source_${version}$`;
  if (!source.startsWith(prefix) || !suffix || source.includes(delimiter) || source.includes('$soja_store_deploy$')) {
    throw new Error('Formato da transação incompatível com o envio ao Lovable.');
  }
  const hash = createHash('sha256').update(source).digest('hex');
  const sql = `DO $soja_store_deploy$
DECLARE
  migration_source constant text := ${delimiter}${source}${delimiter};
  previous_source text[];
BEGIN
  PERFORM set_config('lock_timeout', '8s', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('soja-store-deploy', 0));
  SELECT statements INTO previous_source FROM supabase_migrations.schema_migrations WHERE version = '${version}';
  IF FOUND THEN
    IF previous_source IS DISTINCT FROM ARRAY[migration_source] THEN
      RAISE EXCEPTION 'SOJA_STORE_MIGRATION_SOURCE_CONFLICT';
    END IF;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commissions WHERE slug = 'soja-store' AND is_active AND unit_type = 'comissao'
  ) THEN
    RAISE EXCEPTION 'SOJA_STORE_COMMISSION_NOT_FOUND';
  END IF;
  EXECUTE left(substr(migration_source, ${prefix.length + 1}), -${suffix.length});
  IF EXISTS (
    SELECT 1 FROM unnest(${sqlArray(entry.tables)}) AS expected(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'soja_store_private' AND c.relname = expected.name AND c.relrowsecurity
        AND NOT has_table_privilege('anon', c.oid, 'SELECT')
        AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
    )
  ) OR EXISTS (
    SELECT 1 FROM unnest(${sqlArray(entry.functions)}) AS expected(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = expected.name AND p.prosecdef
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    )
  ) THEN
    RAISE EXCEPTION 'SOJA_STORE_MIGRATION_VERIFICATION_FAILED';
  END IF;
  INSERT INTO supabase_migrations.schema_migrations(version, name, statements, created_by, idempotency_key)
  VALUES ('${version}', '${entry.name}', ARRAY[migration_source],
    'Codex via Lovable; sha256=${hash}', 'soja-store-${version}');
END $soja_store_deploy$;`;
  return { sql, hash };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write((await buildMigrationEnvelope(process.argv[2])).sql);
}
