import { sojaMigrationSource } from './migration-envelope.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const socketPath = process.env.SOJA_STORE_TEST_PG_SOCKET;
const port = Number(process.env.SOJA_STORE_TEST_PG_PORT ?? 55442);
if (!socketPath?.startsWith('/') || !Number.isInteger(port)) {
  throw new Error('Set SOJA_STORE_TEST_PG_SOCKET to a disposable PostgreSQL socket directory.');
}
const connection = { host: socketPath, port, username: 'postgres', onnotice: () => {} };
const adminDb = postgres({ ...connection, database: 'postgres', max: 1 });
const database = 'soja_store_access_test_' + randomUUID().replaceAll('-', '');
await adminDb`CREATE DATABASE ${adminDb(database)}`;
const sql = postgres({ ...connection, database, max: 8 });
const ids = Object.fromEntries([
  'org', 'otherOrg', 'store', 'otherStore', 'otherTeam', 'admin', 'anotherAdmin', 'gestor', 'member',
  'unrelated', 'otherAdmin', 'otherMember', 'noOrg', 'inactiveOrg', 'inactiveTeam', 'institution',
  'legacyLink', 'newPerson', 'placeholder',
].map((key) => [key, randomUUID()]));

const as = (actor, fn, role = 'authenticated') => sql.begin(async (tx) => {
  await tx`SET LOCAL ROLE ${tx(role)}`;
  await tx`SELECT set_config('request.jwt.claim.sub', ${actor ?? ''}, true)`;
  return fn(tx);
});
const access = (actor, org = ids.org, commission = ids.store) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_access(${org}, ${commission}) AS result
`)[0].result);
const catalog = (actor) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_catalog(${ids.org}, ${ids.store}) AS result
`)[0].result);
const noAccess = (enabled) => ({ enabled, capabilities: [] });
const expectDenied = (result, message) => assert.rejects(result, (error) =>
  error.code === '42501' && (!message || error.message === message),
);
const operatingCapabilities = [
  'catalog.manage', 'catalog.view', 'purchases.costs', 'purchases.manage', 'purchases.receive',
  'purchases.view', 'settings.manage', 'settings.view', 'stock.view', 'suppliers.manage', 'suppliers.view',
];
const baseMigrations = [
  '20261112120000_soja_store_catalog.sql',
  '20261112120100_soja_store_directory.sql',
  '20261112120200_soja_store_purchases_stock.sql',
  '20261112120300_soja_store_import_staging.sql',
  '20261112120400_soja_store_overview.sql',
];
const hardening = '20261112120500_soja_store_access_rollout.sql';
const activation = '20261112120550_soja_store_enable.sql';

async function migrate(...files) {
  const migrationConnection = await sql.reserve();
  try {
    for (const file of files) {
      const source = await readFile(sojaMigrationSource(file), 'utf8');
      await migrationConnection.unsafe(source);
    }
  } catch (error) {
    await migrationConnection`ROLLBACK`;
    throw error;
  } finally {
    migrationConnection.release();
  }
}

async function link(user, commission, org, { active = true, type = 'pessoa', legacy = null } = {}) {
  const id = randomUUID();
  await sql`INSERT INTO public.commission_people (id, org_id, user_id) VALUES (${id}, ${org}, ${user})`;
  await sql`
    INSERT INTO public.commission_responsibles (org_id, commission_id, person_id, active, responsible_type, user_id)
    VALUES (${org}, ${commission}, ${id}, ${active}, ${type}, ${legacy})
  `;
  return id;
}

try {
  await sql.unsafe(await readFile(new URL('./schema-fixture.sql', import.meta.url), 'utf8'));
  // Model the permissive legacy policies from the main repository. They remain in place.
  await sql.unsafe(`
    ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.commission_responsibles ADD COLUMN user_id uuid;
    GRANT SELECT, INSERT, UPDATE ON public.org_members TO authenticated, service_role;
    CREATE FUNCTION public.get_user_org_role(_user_id uuid, _org_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
      SELECT role FROM public.org_members WHERE user_id = _user_id AND org_id = _org_id AND is_active
    $$;
    CREATE POLICY members_select ON public.org_members FOR SELECT USING (
      public.get_user_org_role(auth.uid(), org_id) IS NOT NULL
    );
    CREATE POLICY members_insert ON public.org_members FOR INSERT WITH CHECK (
      public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor') OR user_id = auth.uid()
    );
    CREATE POLICY members_update ON public.org_members FOR UPDATE USING (
      public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor')
    );
    GRANT USAGE ON SCHEMA auth TO authenticated;
  `);
  await migrate(...baseMigrations);

  await sql`INSERT INTO public.organizations VALUES (${ids.org}), (${ids.otherOrg})`;
  await sql`
    INSERT INTO public.commissions (id, org_id, slug) VALUES
      (${ids.store}, ${ids.org}, 'soja-store'), (${ids.otherTeam}, ${ids.org}, 'outra'),
      (${ids.otherStore}, ${ids.otherOrg}, 'sojastore')
  `;
  for (const key of Object.keys(ids).slice(5)) await sql`INSERT INTO auth.users VALUES (${ids[key]})`;
  for (const [key, role, active] of [
    ['admin', 'admin', true], ['anotherAdmin', 'admin', false], ['gestor', 'gestor', true], ['member', 'operador', true],
    ['unrelated', 'operador', true], ['otherMember', 'operador', true], ['inactiveOrg', 'operador', false],
    ['inactiveTeam', 'operador', true], ['institution', 'operador', true], ['legacyLink', 'operador', true],
    ['placeholder', 'operador', false],
  ]) {
    await sql`INSERT INTO public.org_members VALUES (${ids.org}, ${ids[key]}, ${role}, ${active})`;
  }
  await sql`INSERT INTO public.org_members VALUES (${ids.otherOrg}, ${ids.otherAdmin}, 'admin', true)`;
  await sql`INSERT INTO public.org_members VALUES (${ids.otherOrg}, ${ids.placeholder}, 'operador', true)`;
  const memberPerson = await link(ids.member, ids.store, ids.org);
  await link(ids.noOrg, ids.store, ids.org);
  await link(ids.inactiveOrg, ids.store, ids.org);
  await link(ids.inactiveTeam, ids.store, ids.org, { active: false });
  await link(ids.institution, ids.store, ids.org, { type: 'equipe' });
  await link(null, ids.store, ids.org, { legacy: ids.legacyLink });
  await link(ids.otherMember, ids.otherTeam, ids.org);
  // A second tenant's previously enabled alias and legacy grant must not open operational access.
  await sql`INSERT INTO soja_store_private.scopes (org_id, commission_id, enabled) VALUES (${ids.otherOrg}, ${ids.otherStore}, true)`;
  await migrate(hardening);

  assert.deepEqual(await access(ids.admin), noAccess(false));
  assert.deepEqual(await access(ids.member), noAccess(false));
  await expectDenied(catalog(ids.admin), 'SOJA_STORE_FORBIDDEN');
  const selected = (await sql`
    SELECT org_id, commission_id, enabled, institutional_access FROM soja_store_private.scopes WHERE institutional_access
  `)[0];
  assert.deepEqual(selected, { org_id: ids.org, commission_id: ids.store, enabled: false, institutional_access: true });
  await sql`ALTER TABLE public.org_members DISABLE TRIGGER soja_store_guard_org_member_access`;
  await assert.rejects(migrate(activation), /SOJA_STORE_MEMBERSHIP_GUARD_REQUIRED/);
  await sql`ALTER TABLE public.org_members ENABLE TRIGGER soja_store_guard_org_member_access`;
  await sql`GRANT UPDATE (user_id) ON public.commission_people TO authenticated`;
  await assert.rejects(migrate(activation), /SOJA_STORE_TEAM_DIRECT_WRITES_FORBIDDEN/);
  await sql`REVOKE UPDATE (user_id) ON public.commission_people FROM authenticated`;
  assert.deepEqual(await access(ids.admin), noAccess(false));
  console.log('PASS hardening keeps rollout disabled and enable refuses a disabled authorization guard');

  for (const role of ['admin', 'gestor', 'operador']) {
    await expectDenied(as(ids.noOrg, (tx) => tx`
      INSERT INTO public.org_members VALUES (${ids.org}, ${ids.noOrg}, ${role}, true)
    `), 'SOJA_STORE_ORG_MEMBER_INSERT_FORBIDDEN');
  }
  await expectDenied(as(ids.gestor, (tx) => tx`
    INSERT INTO public.org_members VALUES (${ids.org}, ${ids.newPerson}, 'admin', true)
  `), 'SOJA_STORE_ORG_MEMBER_INSERT_FORBIDDEN');
  await expectDenied(as(ids.gestor, (tx) => tx`
    UPDATE public.org_members SET role = 'admin' WHERE org_id = ${ids.org} AND user_id = ${ids.gestor}
  `), 'SOJA_STORE_ORG_MEMBER_ROLE_FORBIDDEN');
  await expectDenied(as(ids.gestor, (tx) => tx`
    UPDATE public.org_members SET is_active = true WHERE org_id = ${ids.org} AND user_id = ${ids.anotherAdmin}
  `), 'SOJA_STORE_ORG_MEMBER_ROLE_FORBIDDEN');
  await expectDenied(as(ids.gestor, (tx) => tx`
    UPDATE public.org_members SET user_id = ${ids.noOrg} WHERE org_id = ${ids.org} AND user_id = ${ids.unrelated}
  `), 'SOJA_STORE_ORG_MEMBER_IDENTITY_IMMUTABLE');
  await expectDenied(as(ids.otherAdmin, (tx) => tx`
    UPDATE public.org_members SET org_id = ${ids.org}
    WHERE org_id = ${ids.otherOrg} AND user_id = ${ids.otherAdmin}
  `), 'SOJA_STORE_ORG_MEMBER_IDENTITY_IMMUTABLE');
  await expectDenied(as(ids.admin, (tx) => tx`
    UPDATE public.org_members SET org_id = ${ids.otherOrg} WHERE org_id = ${ids.org} AND user_id = ${ids.placeholder}
  `), 'SOJA_STORE_ORG_MEMBER_IDENTITY_IMMUTABLE');
  await as(ids.gestor, (tx) => tx`INSERT INTO public.org_members VALUES (${ids.org}, ${ids.newPerson}, 'operador', true)`);
  await as(ids.admin, (tx) => tx`
    UPDATE public.org_members SET is_active = true WHERE org_id = ${ids.org} AND user_id = ${ids.anotherAdmin}
  `);
  await as(ids.otherAdmin, (tx) => tx`
    UPDATE public.org_members SET role = 'gestor' WHERE org_id = ${ids.otherOrg} AND user_id = ${ids.placeholder}
  `);
  await as(null, (tx) => tx`
    UPDATE public.org_members SET is_active = false WHERE org_id = ${ids.org} AND user_id = ${ids.anotherAdmin}
  `, 'service_role');
  console.log('PASS role escalation and identity transfer denied; admin, service, and other-org maintenance preserved');

  await migrate(activation);
  assert.deepEqual(await access(ids.admin), { enabled: true, capabilities: operatingCapabilities });
  assert.deepEqual(await access(ids.member), { enabled: true, capabilities: operatingCapabilities });
  for (const key of ['gestor', 'unrelated', 'otherMember', 'inactiveTeam', 'institution', 'legacyLink']) {
    assert.deepEqual(await access(ids[key]), noAccess(true));
    await expectDenied(catalog(ids[key]), 'SOJA_STORE_FORBIDDEN');
  }
  for (const key of ['anotherAdmin', 'otherAdmin', 'noOrg', 'inactiveOrg']) {
    assert.deepEqual(await access(ids[key]), noAccess(false));
  }
  assert.deepEqual(await access(ids.admin, ids.org, ids.otherTeam), noAccess(false));
  assert.deepEqual(await access(ids.otherAdmin, ids.otherOrg, ids.otherStore), noAccess(false));
  await expectDenied(as(null, (tx) => tx`SELECT public.soja_store_access(${ids.org}, ${ids.store})`, 'anon'));
  await expectDenied(as(ids.admin, (tx) => tx`SELECT * FROM soja_store_private.products`));
  await expectDenied(as(ids.admin, (tx) => tx`
    INSERT INTO soja_store_private.operational_capability_registry VALUES ('test.view')
  `));
  await assert.rejects(
    sql`INSERT INTO soja_store_private.operational_capability_registry VALUES ('imports.manage')`,
    (error) => error.code === '23514',
  );
  await sql`INSERT INTO soja_store_private.operational_capability_registry VALUES ('test.view')`;
  assert.ok((await access(ids.member)).capabilities.includes('test.view'));
  assert.deepEqual(await access(ids.unrelated), noAccess(true));

  const request = randomUUID();
  const result = await as(ids.member, async (tx) => (await tx`
    SELECT public.soja_store_save_product(${ids.org}, ${ids.store}, ${request}, NULL,
      ${tx.json({ name: 'Cuia', unit: 'un', status: 'active', variants: [{ sku: 'ROLLOUT-TEST' }] })}) AS result
  `)[0].result);
  assert.equal(result.status, 'active');
  assert.equal((await catalog(ids.admin)).total, 1);

  // Private explicit grants and historical staging remain stored; even a prior grant no longer confers imports access.
  await sql`
    INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
    VALUES (${ids.org}, ${ids.store}, ${memberPerson}, ${ids.member}, 'imports.manage', ${ids.admin})
  `;
  await expectDenied(as(ids.member, (tx) => tx`SELECT public.soja_store_import_batches(${ids.org}, ${ids.store})`), 'SOJA_STORE_FORBIDDEN');
  await expectDenied(as(ids.admin, (tx) => tx`SELECT public.soja_store_stage_import(${ids.org}, ${ids.store}, ${randomUUID()}, '{}'::jsonb)`), 'SOJA_STORE_FORBIDDEN');
  await sql`UPDATE public.commission_responsibles SET active = false WHERE commission_id = ${ids.store} AND person_id = ${memberPerson}`;
  await expectDenied(catalog(ids.member), 'SOJA_STORE_FORBIDDEN');
  await expectDenied(as(ids.member, (tx) => tx`SELECT public.soja_store_request_status(${ids.org}, ${ids.store}, ${request})`), 'SOJA_STORE_FORBIDDEN');
  assert.equal((await catalog(ids.admin)).total, 1);
  await sql`UPDATE soja_store_private.scopes SET enabled = false WHERE org_id = ${ids.org} AND commission_id = ${ids.store}`;
  assert.deepEqual(await access(ids.admin), noAccess(false));
  assert.equal((await sql`SELECT count(*)::integer AS count FROM soja_store_private.products`)[0].count, 1);
  console.log('PASS enabled admin and current team, exact scope, retained staging, revocation and suspension');
} finally {
  await sql.end();
  await adminDb`DROP DATABASE ${adminDb(database)}`;
  await adminDb.end();
}
