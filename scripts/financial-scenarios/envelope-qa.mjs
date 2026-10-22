import { createRequire } from "node:module";
import fs from "node:fs/promises";
const require = createRequire(import.meta.url),
  postgres = require("/tmp/financial-postgres/node_modules/postgres");
const { migrationEnvelope } = await import("./migration-envelope.mjs");
const db = postgres({
  host: "127.0.0.1",
  port: 55438,
  user: "postgres",
  password: "local-financial-tests",
  database: "financial_composer_test",
  max: 1,
  onnotice: () => {},
});
try {
  await db.unsafe(
    "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[],created_by text,idempotency_key text)",
  );
  for (const [version, name] of [
    ["20261022090000", "financial_live_scenarios"],
    ["20261022093000", "financial_scenario_projection_hardening"],
    ["20261022100000", "financial_scenario_cash_contract"],
  ]) {
    const source = await fs.readFile(
      `supabase/migrations/${version}_${name}.sql`,
      "utf8",
    );
    await db.unsafe(migrationEnvelope(source, version, name));
    await db.unsafe(migrationEnvelope(source, version, name));
    const r =
      await db`select statements[1]=${source} exact_source from supabase_migrations.schema_migrations where version=${version}`;
    if (r[0].exact_source !== true) throw Error("Source mismatch");
  }
  console.log(
    "Exact transactional Lovable envelope: applied, recorded and replayed once without duplicate versions",
  );
} finally {
  await db.end();
}
