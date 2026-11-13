import { sojaMigrationSource } from './migration-envelope.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const socket = process.env.SOJA_STORE_TEST_PG_SOCKET;
if (!socket?.startsWith('/')) throw new Error('Use a disposable local PostgreSQL socket.');
const options = { host: socket, port: Number(process.env.SOJA_STORE_TEST_PG_PORT ?? 55442), username: 'postgres' };
const admin = postgres({ ...options, database: 'postgres' });
const database = 'soja_store_issue_' + randomUUID().replaceAll('-', '');
await admin`CREATE DATABASE ${admin(database)}`;
const sql = postgres({ ...options, database, onnotice: () => {} });
const [org, foreignOrg, store, target, foreignTarget, first, second, outsider] = Array.from({ length: 8 }, randomUUID);
const migrations = [
  '20261112120000_soja_store_catalog',
  '20261112120100_soja_store_directory',
  '20261112120200_soja_store_purchases_stock',
  '20261112120500_soja_store_access_rollout',
  '20261112120550_soja_store_enable',
  '20261112120600_soja_store_inventory',
  '20261112120700_soja_store_customers',
  '20261112120800_soja_store_cash',
  '20261112120900_soja_store_transfers',
  '20261112121000_soja_store_finance',
  '20261112121200_soja_store_sales',
  '20261112121300_soja_store_institutional_issue',
];

const as = (user, run) => sql.begin(async (tx) => {
  await tx`SET LOCAL ROLE authenticated`;
  await tx`SELECT set_config('request.jwt.claim.sub', ${user}, true)`;
  return run(tx);
});
const read = (user, name) => as(user, async (tx) => (await tx`
  SELECT public.${tx('soja_store_' + name)}(${org}, ${store}) AS result
`)[0].result);
const command = (user, name, payload, version, key = randomUUID()) => as(user, async (tx) => (await tx`
  SELECT public.${tx('soja_store_' + name)}(${org}, ${store}, ${key}, ${version}, ${tx.json(payload)}) AS result
`)[0].result);
const rejects = (promise, message) => assert.rejects(promise, (error) => error.message === message);

try {
  await sql.unsafe(await readFile(new URL('./schema-fixture.sql', import.meta.url), 'utf8'));
  await sql`INSERT INTO public.organizations VALUES (${org}), (${foreignOrg})`;
  await sql`
    INSERT INTO public.commissions(id, org_id, slug, nome) VALUES
      (${store}, ${org}, 'soja-store', 'Soja Store'),
      (${target}, ${org}, 'destino', 'Comissão de destino'),
      (${foreignTarget}, ${foreignOrg}, 'destino', 'Outra organização')
  `;
  for (const id of [first, second, outsider]) {
    await sql`INSERT INTO auth.users VALUES (${id})`;
    await sql`INSERT INTO public.org_members VALUES (${org}, ${id}, ${id === first ? 'admin' : 'operador'}, true)`;
  }
  const teamPerson = randomUUID();
  await sql`INSERT INTO public.commission_people (id, org_id, user_id) VALUES (${teamPerson}, ${org}, ${second})`;
  await sql`INSERT INTO public.commission_responsibles (commission_id, org_id, person_id) VALUES (${store}, ${org}, ${teamPerson})`;

  for (const version of migrations) {
    const source = await readFile(sojaMigrationSource(version + ".sql"), 'utf8');
    const connection = await sql.reserve();
    try { await connection.unsafe(source); }
    catch (error) { await connection`ROLLBACK`; throw error; }
    finally { connection.release(); }
  }
  const product = await command(first, 'save_product', { name: 'Caneca', unit: 'un', status: 'active', variants: [{ sku: 'CAN-01' }] }, null);
  const variantId = (await read(second, 'catalog')).items.find(({ id }) => id === product.id).variants[0].id;
  const location = await command(first, 'save_location', { name: 'Estoque', kind: 'warehouse', status: 'active' }, null);
  await command(second, 'record_inventory', {
    variant_id: variantId, location_id: location.id, kind: 'opening_count', quantity: '3', reason: 'Abertura de teste',
  }, 0);

  const destinations = await read(second, 'issue_destinations');
  assert.ok(destinations.some((item) => item.id === target));
  assert.ok(destinations.every((item) => item.id !== foreignTarget));
  await rejects(read(outsider, 'issue_destinations'), 'SOJA_STORE_FORBIDDEN');

  const issue = {
    variant_id: variantId, location_id: location.id, destination_commission_id: target,
    quantity: '2', reason: 'Entrega institucional de teste', recipient: 'Equipe de destino', reference: 'Comprovante de teste',
  };
  const release = (actor, payload, version, key) => command(actor, 'register_institutional_issue', payload, version, key);
  await rejects(release(outsider, issue, 1), 'SOJA_STORE_FORBIDDEN');
  await rejects(release(first, { ...issue, destination_commission_id: foreignTarget }, 1), 'SOJA_STORE_ISSUE_DESTINATION_UNAVAILABLE');
  await rejects(release(first, { ...issue, quantity: '4' }, 1), 'SOJA_STORE_STOCK_INSUFFICIENT');
  const request = randomUUID();
  const [firstRelease, duplicate] = await Promise.all([release(first, issue, 1, request), release(first, issue, 1, request)]);
  assert.deepEqual(firstRelease, duplicate);
  await rejects(release(first, { ...issue, quantity: '1' }, 1, request), 'SOJA_STORE_REQUEST_CONFLICT');
  assert.equal((await read(second, 'stock')).items[0].available_quantity, '1.000000');

  const final = await Promise.allSettled([
    release(first, { ...issue, quantity: '1' }, 2), release(second, { ...issue, quantity: '1' }, 2),
  ]);
  assert.equal(final.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(final.find((entry) => entry.status === 'rejected').reason.message, 'SOJA_STORE_STALE_VERSION');
  assert.equal((await read(first, 'stock')).items[0].available_quantity, '0.000000');
  const ledger = await read(first, 'stock_movements');
  const firstEvent = ledger.items.find((item) => item.id === firstRelease.movement_id);
  assert.equal(ledger.total, 3);
  assert.equal(firstEvent.quantity, '-2.000000');
  assert.equal(firstEvent.movement_type, 'institutional_issue');
  assert.equal(firstEvent.destination_commission_name, 'Comissão de destino');
  assert.equal(firstEvent.recipient, 'Equipe de destino');
  assert.equal(firstEvent.reference, 'Comprovante de teste');
  assert.equal(firstEvent.sale_id, null);
  assert.equal(firstEvent.purchase_id, null);
  assert.equal((await sql`SELECT count(*)::int AS n FROM soja_store_private.finance_obligations`)[0].n, 0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM soja_store_private.cash_movements`)[0].n, 0);
  await rejects(sql`DELETE FROM soja_store_private.stock_institutional_issues WHERE id = ${firstRelease.id}`, 'SOJA_STORE_STOCK_HISTORY_IMMUTABLE');
  console.log('PASS institutional issue of own stock, destination scope, replay, concurrency, immutable history and no cash effects');
} finally {
  await sql.end();
  await admin`DROP DATABASE ${admin(database)} WITH (FORCE)`;
  await admin.end();
}
