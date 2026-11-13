import { sojaMigrationSource } from './migration-envelope.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const host = process.env.SOJA_STORE_TEST_PG_SOCKET;
const port = Number(process.env.SOJA_STORE_TEST_PG_PORT ?? 55442);
if (!host?.startsWith('/') || !Number.isInteger(port)) throw new Error('Set SOJA_STORE_TEST_PG_SOCKET to an isolated PostgreSQL socket directory.');
const config = { host, port, username: 'postgres', onnotice: () => {} };
const admin = postgres({ ...config, database: 'postgres', max: 1 });
const database = 'soja_store_sourcing_test_' + randomUUID().replaceAll('-', '');
await admin`CREATE DATABASE ${admin(database)}`;
const db = postgres({ ...config, database, max: 6 });
const [org, unit, outsiderOrg, outsiderUnit, manager, member, outsider] = Array.from({ length: 7 }, randomUUID);
const as = (actor, fn) => db.begin(async (tx) => {
  await tx`SET LOCAL ROLE authenticated`;
  await tx`SELECT set_config('request.jwt.claim.sub', ${actor}, true)`;
  return fn(tx);
});
const scopedRead = (name, actor) => as(actor, async (tx) => (await tx`
  SELECT public.${tx('soja_store_' + name)}(${org}, ${unit}) AS result
`)[0].result);
const write = (name, version, payload, key = randomUUID()) => as(manager, async (tx) => (await tx`
  SELECT public.${tx('soja_store_' + name)}(${org}, ${unit}, ${key}, ${version}, ${tx.json(payload)}) AS result
`)[0].result);
const fails = (result, code, message) => assert.rejects(result, (e) => e.code === code && (!message || e.message === message));

try {
  await db.unsafe(await readFile(new URL('./schema-fixture.sql', import.meta.url), 'utf8'));
  await db`INSERT INTO public.organizations VALUES (${org}), (${outsiderOrg})`;
  await db`INSERT INTO public.commissions (id, org_id, slug) VALUES (${unit}, ${org}, 'soja-store'), (${outsiderUnit}, ${outsiderOrg}, 'sojastore')`;
  for (const user of [manager, member, outsider]) await db`INSERT INTO auth.users VALUES (${user})`;
  await db`INSERT INTO public.org_members VALUES (${org}, ${manager}, 'admin', true), (${org}, ${member}, 'operador', true), (${outsiderOrg}, ${outsider}, 'admin', true)`;
  const person = randomUUID();
  await db`INSERT INTO public.commission_people (id, org_id, user_id) VALUES (${person}, ${org}, ${member})`;
  await db`INSERT INTO public.commission_responsibles (commission_id, org_id, person_id) VALUES (${unit}, ${org}, ${person})`;
  const migrations = [
    '20261112120000_soja_store_catalog.sql', '20261112120100_soja_store_directory.sql', '20261112120200_soja_store_purchases_stock.sql',
    '20261112120500_soja_store_access_rollout.sql', '20261112120550_soja_store_enable.sql', '20261112121400_soja_store_sourcing.sql',
  ];
  const reserved = await db.reserve();
  try {
    for (const file of migrations) await reserved.unsafe(await readFile(sojaMigrationSource(file), 'utf8'));
  } finally {
    reserved.release();
  }

  await db`INSERT INTO soja_store_private.scopes (org_id, commission_id, enabled) VALUES (${outsiderOrg}, ${outsiderUnit}, true)`;
  const product = await write('save_product', null, { name: 'Cuia', unit: 'un', status: 'active', variants: [{ sku: 'CUIA' }] });
  const [s1, s2, s3] = Array.from({ length: 3 }, randomUUID);
  await db`
    INSERT INTO soja_store_private.suppliers (id, org_id, commission_id, name, kind, status, created_by, updated_by)
    VALUES (${s1}, ${org}, ${unit}, 'Fornecedor A', 'company', 'active', ${manager}, ${manager}),
      (${s2}, ${org}, ${unit}, 'Fornecedor B', 'company', 'active', ${manager}, ${manager}),
      (${s3}, ${outsiderOrg}, ${outsiderUnit}, 'Fornecedor C', 'company', 'active', ${manager}, ${manager})
  `;
  const links = () => as(member, async (tx) => (await tx`
    SELECT public.soja_store_product_suppliers(${org}, ${unit}, ${product.id}) AS result
  `)[0].result);
  const link = { product_id: product.id, supplier_id: s1, supplier_sku: 'ORIG-1', reference: 'Ficha técnica', active: true };
  const request = randomUUID();
  const saved = await write('save_product_supplier', null, link, request);
  assert.deepEqual(await write('save_product_supplier', null, link, request), saved);
  await fails(write('save_product_supplier', null, { ...link, supplier_id: s3 }), 'PT404', 'SOJA_STORE_SOURCING_UNAVAILABLE');
  assert.equal((await links())[0].supplier_sku, 'ORIG-1');
  await write('save_product_supplier', 1, { ...link, active: false });
  assert.equal((await links())[0].active, false);
  console.log('PASS scoped catalog supplier link, idempotency, archive and cross-tenant denial');

  await fails(scopedRead('purchase_needs', outsider), '42501');
  const writeNeed = (version, payload, key) => write('write_purchase_need', version, payload, key);
  const need = await writeNeed(null, { action: 'create', description: 'Comprar 20 cuias', quantity: '20', unit: 'un' });
  const quote = {
    action: 'quote', need_id: need.id, supplier_id: s1, quoted_on: '2026-01-02', items_cents: 3500,
    freight_cents: 1000, lead_days: 7, minimum_quantity: '10', terms: 'À vista', reference: 'Proposta 01',
  };
  await writeNeed(1, quote);
  await writeNeed(2, { ...quote, supplier_id: s2, items_cents: 2000, lead_days: 10, minimum_quantity: '21' });
  await fails(writeNeed(3, quote), 'PT409', 'SOJA_STORE_SOURCING_DUPLICATE');
  const compare = (await scopedRead('purchase_needs', member)).items[0];
  assert.deepEqual(compare.quotes.map((q) => q.total_cents), [3000, 4500]);
  assert.equal(compare.quotes[0].minimum_quantity, '21.000000');
  const choose = { action: 'select', need_id: need.id, quote_id: compare.quotes[1].id, reference: 'Melhor opção elegível' };
  await fails(writeNeed(3, { ...choose, quote_id: compare.quotes[0].id }), 'PT409', 'SOJA_STORE_SOURCING_QUOTE_INELIGIBLE');
  await writeNeed(3, choose);
  await fails(writeNeed(3, choose), 'PT409', 'SOJA_STORE_STALE_VERSION');

  const location = randomUUID();
  const [purchase, wrongPurchase] = Array.from({ length: 2 }, randomUUID);
  await db`
    INSERT INTO soja_store_private.locations (id, org_id, commission_id, name, kind, status, created_by, updated_by)
    VALUES (${location}, ${org}, ${unit}, 'Estoque teste', 'warehouse', 'active', ${manager}, ${manager})
  `;
  await db`
    INSERT INTO soja_store_private.purchases (id, org_id, commission_id, supplier_id, location_id, supplier_name,
      location_name, ordered_on, reference, freight_cents, charges_cents, total_cents, created_by, updated_by)
    VALUES (${purchase}, ${org}, ${unit}, ${s1}, ${location}, 'Fornecedor A', 'Estoque teste',
      '2026-01-03', 'Pedido X', 0, 0, 4500, ${manager}, ${manager}),
      (${wrongPurchase}, ${org}, ${unit}, ${s2}, ${location}, 'Fornecedor B', 'Estoque teste',
      '2026-01-03', 'Pedido Y', 0, 0, 4000, ${manager}, ${manager})
  `;
  const options = await as(manager, async (tx) => (await tx`
    SELECT public.soja_store_purchase_need_orders(${org}, ${unit}, ${need.id}, 'pedido') AS result
  `)[0].result);
  assert.deepEqual(options.map((p) => p.id), [purchase]);
  const bind = { action: 'link_order', need_id: need.id, purchase_id: purchase, reference: 'Pedido aceito' };
  await fails(writeNeed(4, { ...bind, purchase_id: wrongPurchase }), 'PT404', 'SOJA_STORE_SOURCING_UNAVAILABLE');
  const done = await writeNeed(4, bind);
  assert.equal(done.status, 'ordered');
  await fails(writeNeed(5, choose), 'PT409', 'SOJA_STORE_SOURCING_ORDER_LINKED');
  assert.equal((await scopedRead('purchase_needs', member)).items[0].purchase_id, purchase);
  await fails(db`DELETE FROM soja_store_private.purchase_quotes WHERE id = ${compare.quotes[0].id}`, '55000');
  console.log('PASS quote comparison, authoritative freight total, minimum validation, versioned selection and matched unique purchase linkage');
} finally {
  await db.end();
  await admin`DROP DATABASE ${admin(database)}`;
  await admin.end();
}
