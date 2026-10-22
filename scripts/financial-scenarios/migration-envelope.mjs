import fs from "node:fs/promises";
import { createHash } from "node:crypto";
export function migrationEnvelope(
  source,
  version = "20261022090000",
  name = "financial_live_scenarios",
) {
  if (
    !/^20261022(090000|093000|100000)$/.test(version) ||
    !/^financial_[a-z_]+$/.test(name)
  )
    throw Error("Unexpected migration identity");
  const delimiter = `$financial_scenarios_source_${version}$`;
  if (source.includes(delimiter)) throw Error("Unexpected migration delimiter");
  const hash = createHash("sha256").update(source).digest("hex");
  return `BEGIN;
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('financial-scenarios-migration-${version}',0));
DO $financial_scenarios_runner$
DECLARE migration_source text:=${delimiter}${source}${delimiter}; existing text[];
BEGIN
 SELECT statements INTO existing FROM supabase_migrations.schema_migrations WHERE version='${version}';
 IF FOUND THEN
  IF existing IS DISTINCT FROM ARRAY[migration_source] THEN RAISE EXCEPTION 'MIGRATION_SOURCE_CONFLICT'; END IF;
 ELSE
  EXECUTE migration_source;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key)
  VALUES('${version}','${name}',ARRAY[migration_source],
   'Codex via Lovable connector; sha256=${hash}','${version === "20261022090000" ? "financial-scenarios-2028-v1" : "financial-scenarios-" + version}');
 END IF;
END $financial_scenarios_runner$;
COMMIT;`;
}
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop())
) {
  const version = process.argv[2] || "20261022090000";
  const name = {
    20261022090000: "financial_live_scenarios",
    20261022093000: "financial_scenario_projection_hardening",
    20261022100000: "financial_scenario_cash_contract",
  }[version];
  if (!name) throw Error("Unexpected migration identity");
  process.stdout.write(
    migrationEnvelope(
      await fs.readFile(`supabase/migrations/${version}_${name}.sql`, "utf8"),
      version,
      name,
    ),
  );
}
