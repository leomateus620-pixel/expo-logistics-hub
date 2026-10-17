import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export const KB_DB_IDENTITIES = {
  org: '10000000-0000-4000-8000-000000000001',
  actor: '20000000-0000-4000-8000-000000000001',
  other: '20000000-0000-4000-8000-000000000002',
};

/** Fixed loopback only: never reads a database URL, project .env or PGHOST. */
export function localKbPgConfig(environment = process.env) {
  const port = Number(environment.WORKERS_QA_PG_PORT ?? 55438);
  const user = environment.WORKERS_QA_PG_USER ?? 'postgres';
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(user)) throw new Error('Invalid local PostgreSQL QA port/user.');
  return { host: '127.0.0.1', port, user, database: 'postgres', password: environment.PGPASSWORD, ssl: false, connectionTimeoutMillis: 10000, application_name: 'fenasoja-kb-local-qa' };
}

async function createNativeKbDb(modulePath) {
  if (!path.isAbsolute(modulePath)) throw new Error('Pass an absolute local pg/lib/index.js module path.');
  const imported = await import(pathToFileURL(modulePath).href);
  const { Client } = imported.default ?? imported;
  const config = localKbPgConfig();
  const database = `workers_kb_qa_${randomUUID().replaceAll('-', '')}`;
  if (config.host !== '127.0.0.1' || !/^workers_kb_qa_[a-f0-9]{32}$/.test(database)) throw new Error('Unsafe local QA target.');
  const admin = new Client(config);
  let owner, created = false, databaseOid, closing;
  const info = { engine: 'postgres', postgres: '', temporaryDatabase: database, cleanedUp: false };
  const close = () => closing ??= (async () => {
    try {
      if (owner) await owner.end();
    } finally {
      try {
        if (created) {
          const found = (await admin.query('SELECT oid::text AS oid FROM pg_database WHERE datname=$1', [database])).rows[0];
          if (!/^workers_kb_qa_[a-f0-9]{32}$/.test(database) || !databaseOid || found?.oid !== databaseOid) throw new Error('Refusing cleanup: temporary QA database ownership changed.');
          // The identifier is generated internally and checked again above; no
          // caller-provided name or SQL string can reach this destructive step.
          await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
          info.cleanedUp = true;
        }
      } finally { await admin.end(); }
    }
  })();
  try {
    await admin.connect();
    const version = (await admin.query('SELECT version() AS version, current_setting(\'server_version_num\')::int AS number')).rows[0];
    if (version.number < 160000 || version.number >= 170000) throw new Error('Native KB QA requires PostgreSQL 16, matching the project CI service.');
    info.postgres = version.version;
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    databaseOid = (await admin.query('SELECT oid::text AS oid FROM pg_database WHERE datname=$1', [database])).rows[0]?.oid;
    if (!databaseOid) throw new Error('Temporary QA database identity missing.');
    owner = new Client({ ...config, database });
    await owner.connect();
    if ((await owner.query('SELECT current_database() AS name')).rows[0].name !== database) throw new Error('Temporary QA database connection mismatch.');
    return { exec: sql => owner.query(sql), query: (sql, args) => owner.query(sql, args), close, qaInfo: info };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Isolated real PostgreSQL engine, roles and policies; auth claims are simulated. */
export async function createKbTestDb(runtimePath, options = {}) {
  let db;
  if (options.engine === 'postgres') db = await createNativeKbDb(runtimePath);
  else {
    const runtime = runtimePath.endsWith('index.js') ? path.dirname(runtimePath) : runtimePath;
    const { PGlite } = await import(pathToFileURL(path.join(runtime, 'index.js')).href);
    const { pg_trgm } = await import(pathToFileURL(path.join(runtime, 'contrib/pg_trgm.js')).href);
    const { unaccent } = await import(pathToFileURL(path.join(runtime, 'contrib/unaccent.js')).href);
    db = new PGlite({ extensions: { pg_trgm, unaccent } });
  }
  const { org, actor } = KB_DB_IDENTITIES;
  try {
  // Native roles belong to the local cluster and can already exist after the
  // actions/routines fixtures. Never alter or drop those shared roles.
  await db.exec(`DO $roles$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolcanlogin))
      THEN RAISE EXCEPTION 'Unsafe existing QA role'; END IF;
    END $roles$;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.org_members(org_id uuid,user_id uuid,is_active boolean);
    INSERT INTO public.organizations VALUES('${org}');
    INSERT INTO public.org_members VALUES('${org}','${actor}',true);
    CREATE SCHEMA workers_private;`);
  if (options.extensionSchema === 'public') await db.exec('CREATE EXTENSION unaccent WITH SCHEMA public; CREATE EXTENSION pg_trgm WITH SCHEMA public;');
  for (const file of ['20261016120000_workers_readonly_workspace.sql', '20261017030000_workers_response_persistence.sql', '20261017060000_workers_identity_responses.sql', '20261017070000_workers_knowledge_base.sql']) {
    await db.exec(await fs.readFile(path.join('supabase/migrations', file), 'utf8'));
  }
  if (options.seed !== false) {
    const seeds = (await fs.readdir('supabase/migrations')).filter(file=>/workers_kb_seed.*\.sql$/.test(file)).sort();
    if (seeds.length===0) throw new Error('KB seed migration not generated');
    for (const file of seeds) await db.exec(await fs.readFile(path.join('supabase/migrations',file),'utf8'));
  }
  return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function setKbTestIdentity(db, userId = KB_DB_IDENTITIES.actor, role = 'authenticated') {
  if (!['authenticated','anon'].includes(role)) throw new Error('Unsupported test role');
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.exec(`SET ROLE ${role}`);
}
