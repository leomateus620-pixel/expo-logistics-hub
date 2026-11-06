import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const versions = {
  20261106090000: "commission_volunteers",
  20261106091000: "commission_people_agenda",
  20261106092000: "team_reconciliation_cleanup",
  20261106103000: "team_conflict_response",
};
export const preservedTables = [
  "commissions",
  "commission_responsibles",
  "cronograma_eventos",
  "cronograma_evento_responsaveis",
  "cronograma_subeventos",
  "cronograma_subevento_responsaveis",
  "cronograma_evento_comissoes",
  "cronograma_subevento_comissoes",
  "cronograma_subevento_convidados",
];
export function fingerprintSql() {
  return preservedTables
    .map(
      (table) => `SELECT '${table}' AS relation, count(*)::int AS rows,
    md5(coalesce(string_agg((to_jsonb(t)-'person_id'-'version')::text, '|' ORDER BY id),'empty')) AS checksum
    FROM public.${table} t`,
    )
    .join("\nUNION ALL\n");
}
export async function migrationEnvelope() {
  const sources = await Promise.all(
    Object.entries(versions).map(async ([version, name]) => {
      const source = await readFile(
        `supabase/migrations/${version}_${name}.sql`,
        "utf8",
      );
      const sha256 = createHash("sha256").update(source).digest("hex");
      const delimiter = `$team_source_${version}$`;
      if (source.includes(delimiter)) throw new Error("Unexpected delimiter");
      return { version, name, source, sha256, delimiter };
    }),
  );
  const sql = `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $lock$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('commission-volunteers-20261106',0)); END $lock$;
DO $scope$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id='985888b8-155f-4bbe-b6b9-6bef2893d99b')
 THEN RAISE EXCEPTION 'WRONG_ENVIRONMENT'; END IF;
END $scope$;
CREATE TEMP TABLE team_before ON COMMIT DROP AS ${fingerprintSql()};
${sources
  .map(
    ({ version, name, source, sha256, delimiter }) => `DO $team_runner$
DECLARE source text:=${delimiter}${source}${delimiter}; existing text[];
BEGIN
 SELECT statements INTO existing FROM supabase_migrations.schema_migrations WHERE version='${version}';
 IF FOUND THEN
  IF existing IS DISTINCT FROM ARRAY[source] THEN RAISE EXCEPTION 'MIGRATION_SOURCE_CONFLICT'; END IF;
 ELSE
  EXECUTE source;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key)
  VALUES('${version}','${name}',ARRAY[source],'Codex via Lovable; sha256=${sha256}','team-${version}');
 END IF;
END $team_runner$;`,
  )
  .join("\n")}
DO $preservation$ BEGIN
 IF EXISTS(SELECT * FROM team_before EXCEPT SELECT * FROM (${fingerprintSql()}) current_facts)
 THEN RAISE EXCEPTION 'LEGACY_FACTS_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM public.commission_responsibles WHERE person_id IS NULL)
 THEN RAISE EXCEPTION 'INCOMPLETE_BACKFILL'; END IF;
END $preservation$;
COMMIT;
SELECT version,name,created_by AS source_hash, array_length(statements,1) AS statements
FROM supabase_migrations.schema_migrations WHERE version IN (${sources.map((s) => `'${s.version}'`).join(",")}) ORDER BY version;`;
  return {
    sql,
    manifest: sources.map(({ version, name, sha256 }) => ({
      version,
      name,
      sha256,
    })),
  };
}
if (process.argv[1]?.endsWith("migration-envelope.mjs")) {
  process.stdout.write(JSON.stringify(await migrationEnvelope()));
}
