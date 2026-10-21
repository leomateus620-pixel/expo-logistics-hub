// Local PostgreSQL only. Rebuilds a disposable database; never accepts a remote URL.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const database =
  process.env.FINANCIAL_TEST_DATABASE || "financial_composer_test";
if (!/^financial_composer_(test|acceptance)$/.test(database))
  throw Error("Only named disposable local financial databases are allowed");
const require = createRequire(import.meta.url);
const postgres = require(
  process.env.FINANCIAL_TEST_POSTGRES_MODULE ||
    "/tmp/financial-postgres/node_modules/postgres",
);
const sql = postgres({
  host: "127.0.0.1",
  port: 55438,
  user: "postgres",
  password: "local-financial-tests",
  database: "postgres",
  max: 1,
});
const root = process.cwd();
await sql.unsafe(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
await sql.unsafe(`CREATE DATABASE ${database}`);
await sql.end();
const db = postgres({
  host: "127.0.0.1",
  port: 55438,
  user: "postgres",
  password: "local-financial-tests",
  database,
  max: 1,
});
await db.unsafe(`DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.org_members(org_id uuid,user_id uuid,is_active boolean,role text);
CREATE TABLE public.user_capabilities(org_id uuid,user_id uuid,capability text);
CREATE TABLE public.commissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid,nome text,UNIQUE(id,org_id));
CREATE FUNCTION public.is_org_member(_user uuid,_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=_org AND user_id=_user AND is_active) $$;
CREATE TABLE public.expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,title text NOT NULL,description text,amount numeric NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'rascunho',created_by_user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),cycle_year integer NOT NULL DEFAULT 2028,expense_date timestamptz NOT NULL DEFAULT now(),origem_lancamento text NOT NULL DEFAULT 'manual');
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.expenses TO authenticated;`);
for (const file of [
  "supabase/migrations/20261006200356_8633880e-2e4d-4354-bc01-53a604dfe92d.sql",
  "drizzle/migrations/0004_financial_expenses_2028_stage1.sql",
  "drizzle/migrations/0005_financial_category_audit_entity_fix.sql",
]) {
  await db.unsafe(await fs.readFile(path.join(root, file), "utf8"));
}
// Optional read-only export of active financial definitions: no application records.
const defs = process.env.FINANCIAL_BASE_DEFINITIONS;
if (defs)
  for (const f of (await fs.readdir(defs)).filter((f) => f.endsWith(".sql")))
    await db.unsafe(await fs.readFile(path.join(defs, f), "utf8"));
if (process.env.FINANCIAL_APPLY_COMPOSER === "1")
  await db.begin(async (tx) =>
    tx.unsafe(
      await fs.readFile(
        path.join(
          root,
          "supabase/migrations/20261021210000_financial_entry_composer.sql",
        ),
        "utf8",
      ),
    ),
  );
console.log("Isolated PostgreSQL financial baseline ready:", database);
await db.end();
