import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

// Require an isolated, passwordless local socket. This runner provisions a fresh fixture database.
const socketPath = process.env.SOJA_STORE_TEST_PG_SOCKET;
const port = Number(process.env.SOJA_STORE_TEST_PG_PORT ?? 55442);
if (!socketPath?.startsWith('/') || !Number.isInteger(port)) {
  throw new Error('Set SOJA_STORE_TEST_PG_SOCKET to a disposable PostgreSQL socket directory.');
}
const connection = { host: socketPath, port, username: 'postgres', onnotice: () => {} };
const admin = postgres({ ...connection, database: 'postgres', max: 1 });
const database = 'soja_store_test_' + randomUUID().replaceAll('-', '');
await admin`CREATE DATABASE ${admin(database)}`;
const sql = postgres({ ...connection, database, max: 8 });
const ids = Object.fromEntries(
  ['org', 'foreignOrg', 'store', 'otherCommission', 'foreignStore',
    'manager', 'reader', 'secondManager', 'operator', 'inactive', 'replacement']
    .map((key) => [key, randomUUID()]),
);
const person = Object.fromEntries(
  ['manager', 'reader', 'secondManager', 'inactive'].map((key) => [key, randomUUID()]),
);
const as = (actor, fn, role = 'authenticated') => sql.begin(async (tx) => {
  await tx`SET LOCAL ROLE ${tx(role)}`;
  await tx`SELECT set_config('request.jwt.claim.sub', ${actor ?? ''}, true)`;
  return fn(tx);
});
const access = (actor, org = ids.org, store = ids.store) =>
  as(actor, async (tx) => (await tx`SELECT public.soja_store_access(${org}, ${store}) AS result`)[0].result);
const save = (actor, payload, request = randomUUID(), version = null, store = ids.store) =>
  as(actor, async (tx) => (await tx`
    SELECT public.soja_store_save_product(${ids.org}, ${store}, ${request}, ${version}, ${tx.json(payload)}) AS result
  `)[0].result);
const status = (actor, request) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_request_status(${ids.org}, ${ids.store}, ${request}) AS result
`)[0].result);
const catalog = (actor, search = null, productStatus = null, limit = 30, offset = 0) =>
  as(actor, async (tx) => (await tx`
    SELECT public.soja_store_catalog(${ids.org}, ${ids.store}, ${search}, ${productStatus}, ${limit}, ${offset}) AS result
  `)[0].result);
const detail = (actor, productId) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_product(${ids.org}, ${ids.store}, ${productId}) AS result
`)[0].result);
const dashboard = (actor, org = ids.org, store = ids.store) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_dashboard(${org}, ${store}) AS result
`)[0].result);
const saveDirectory = (actor, resource, payload, request = randomUUID(), version = null) =>
  as(actor, async (tx) => (await tx`
    SELECT public.${tx('soja_store_save_' + resource)}(${ids.org}, ${ids.store}, ${request}, ${version}, ${tx.json(payload)}) AS result
  `)[0].result);
const directory = (actor, resource, limit = 30, offset = 0) =>
  as(actor, async (tx) => (await tx`
    SELECT public.${tx('soja_store_' + resource)}(${ids.org}, ${ids.store}, ${limit}, ${offset}) AS result
  `)[0].result);
const fails = (promise, code, message) => assert.rejects(
  promise, (error) => error.code === code && (message === undefined || error.message === message),
);
const base = { name: 'Cuia', category: 'Chimarrão', unit: 'un', status: 'active', variants: [{ sku: ' cuia-001 ' }] };

try {
  await sql.unsafe(await readFile(new URL('./schema-fixture.sql', import.meta.url), 'utf8'));
  const migrationConnection = await sql.reserve();
  try {
    for (const file of [
      '20261112120000_soja_store_catalog.sql',
      '20261112120100_soja_store_directory.sql',
      '20261112120200_soja_store_purchases_stock.sql',
      '20261112120400_soja_store_overview.sql',
    ]) {
      await migrationConnection.unsafe(await readFile(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8'));
    }
  } finally {
    await migrationConnection.release();
  }
  await sql`INSERT INTO public.organizations VALUES (${ids.org}), (${ids.foreignOrg})`;
  await sql`
    INSERT INTO public.commissions (id, org_id, slug) VALUES
      (${ids.store}, ${ids.org}, 'soja-store'),
      (${ids.otherCommission}, ${ids.org}, 'hortigranjeiros'),
      (${ids.foreignStore}, ${ids.foreignOrg}, 'sojastore')
  `;
  for (const key of ['manager', 'reader', 'secondManager', 'operator', 'inactive', 'replacement']) {
    await sql`INSERT INTO auth.users VALUES (${ids[key]})`;
    await sql`INSERT INTO public.org_members VALUES (${ids.org}, ${ids[key]}, ${key === 'operator' ? 'admin' : 'operador'}, ${key !== 'inactive'})`;
  }

  assert.deepEqual(await access(ids.manager), { enabled: false, capabilities: [] });
  assert.equal((await sql`SELECT count(*)::int AS count FROM soja_store_private.scopes`)[0].count, 0);
  await sql`INSERT INTO soja_store_private.scopes (org_id, commission_id, enabled) VALUES (${ids.org}, ${ids.store}, true), (${ids.foreignOrg}, ${ids.foreignStore}, true)`;
  for (const key of ['manager', 'reader', 'secondManager', 'inactive']) {
    await sql`INSERT INTO public.commission_people (id, org_id, user_id) VALUES (${person[key]}, ${ids.org}, ${ids[key]})`;
    await sql`INSERT INTO public.commission_responsibles (commission_id, org_id, person_id) VALUES (${ids.store}, ${ids.org}, ${person[key]})`;
    await sql`
      INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
      VALUES (${ids.org}, ${ids.store}, ${person[key]}, ${ids[key]}, ${key === 'reader' ? 'catalog.view' : 'catalog.manage'}, ${ids.operator})
    `;
  }

  assert.deepEqual(await access(ids.manager), { enabled: true, capabilities: ['catalog.manage', 'catalog.view'] });
  assert.deepEqual(await access(ids.reader), { enabled: true, capabilities: ['catalog.view'] });
  assert.deepEqual(await access(ids.operator), { enabled: true, capabilities: [] });
  assert.deepEqual(await access(ids.inactive), { enabled: false, capabilities: [] });
  assert.deepEqual(await access(ids.manager, ids.foreignOrg, ids.foreignStore), { enabled: false, capabilities: [] });
  await fails(save(ids.manager, base, randomUUID(), null, ids.otherCommission), '42501');
  await fails(save(ids.reader, base), '42501');
  await fails(catalog(ids.operator), '42501');
  await fails(as(null, (tx) => tx`SELECT public.soja_store_access(${ids.org}, ${ids.store})`, 'anon'), '42501');
  await fails(as(ids.manager, (tx) => tx`SELECT * FROM soja_store_private.products`), '42501');
  await fails(as(ids.manager, (tx) => tx`SELECT * FROM soja_store_private.products`, 'service_role'), '42501');
  console.log('PASS scoped access, disabled rollout and direct privilege denial');

  const request = randomUUID();
  const replays = await Promise.all(Array.from({ length: 4 }, () => save(ids.manager, base, request)));
  assert.deepEqual(replays, Array(4).fill(replays[0]));
  assert.deepEqual(await status(ids.manager, request), replays[0]);
  assert.equal(await status(ids.secondManager, request), null);
  await fails(save(ids.manager, { ...base, name: 'Copo' }, request), 'PT409', 'SOJA_STORE_REQUEST_CONFLICT');
  assert.equal((await sql`SELECT count(*)::int AS count FROM soja_store_private.audit`)[0].count, 1);
  const productId = replays[0].id;
  const product = await detail(ids.reader, productId);
  assert.equal(product.variants[0].sku, 'CUIA-001');
  assert.equal(product.variants[0].is_default, true);
  assert.equal((await catalog(ids.reader, 'cuia-001')).total, 1);
  assert.equal((await catalog(ids.reader, 'chimarrão')).total, 1);
  assert.equal((await catalog(ids.reader, '%')).total, 0);
  await fails(save(ids.manager, { ...base, variants: [] }), '22023', 'SOJA_STORE_INVALID_VARIANTS');
  console.log('PASS concurrent replay, original response, default variant, and literal search');

  const competingSku = await Promise.allSettled([
    save(ids.manager, { ...base, name: 'Cuia lisa', variants: [{ sku: 'SKU-X' }] }),
    save(ids.secondManager, { ...base, name: 'Cuia estampada', variants: [{ sku: 'sku-x' }] }),
  ]);
  assert.equal(competingSku.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(competingSku.find((r) => r.status === 'rejected').reason.message, 'SOJA_STORE_DUPLICATE_SKU');
  const page = await catalog(ids.reader, null, 'active', 1);
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.notEqual((await catalog(ids.reader, null, 'active', 1, 1)).items[0].id, page.items[0].id);
  const catalogOverview = await dashboard(ids.reader);
  assert.equal(catalogOverview.active_products, page.total);
  assert.equal(catalogOverview.ordered_purchases, null);
  assert.equal(catalogOverview.partial_purchases, null);
  assert.equal(catalogOverview.stock_positions, null);
  assert.ok(Number.isFinite(Date.parse(catalogOverview.generated_at)));
  await fails(dashboard(ids.operator), '42501');
  await fails(dashboard(ids.manager, ids.foreignOrg, ids.foreignStore), '42501');

  const variant = product.variants[0];
  await fails(save(ids.manager, { ...base, id: productId, variants: [variant] }, randomUUID(), 0), 'PT409', 'SOJA_STORE_STALE_VERSION');
  await fails(save(ids.manager, { ...base, id: productId, variants: [{ ...variant, active: false }] }, randomUUID(), 1), '22023', 'SOJA_STORE_ACTIVE_VARIANT_REQUIRED');
  const edited = await save(ids.manager, {
    ...base,
    id: productId,
    variants: [
      { ...variant, label: 'M', attributes: { tamanho: 'M' } },
      { sku: 'CUIA-G', label: 'G', attributes: { tamanho: 'Grande' } },
    ],
  }, randomUUID(), 1);
  assert.equal(edited.version, 2);
  assert.equal((await catalog(ids.reader, 'grande')).total, 1);
  const large = (await detail(ids.reader, productId)).variants.find((item) => item.sku === 'CUIA-G');
  const otherId = competingSku.find((r) => r.status === 'fulfilled').value.id;
  await fails(save(ids.manager, { ...base, id: otherId, variants: [large] }, randomUUID(), 1), '22023', 'SOJA_STORE_VARIANT_NOT_IN_PRODUCT');
  const archived = await save(ids.manager, { ...base, id: productId, status: 'archived', variants: [{ ...variant, active: false }] }, randomUUID(), 2);
  assert.equal(archived.status, 'archived');
  const historical = await detail(ids.reader, productId);
  assert.equal(historical.variants.length, 2);
  assert.ok(historical.variants.every((item) => !item.active));
  assert.equal((await catalog(ids.reader, null, 'active')).total, 1);
  assert.equal((await sql`SELECT count(*)::int AS count FROM soja_store_private.audit`)[0].count, 4);
  console.log('PASS concurrent SKU uniqueness, pagination, version conflicts, and historical variants');

  const location = { name: 'Estoque central', kind: 'warehouse', status: 'active', notes: '  Recepção  ' };
  const supplier = { name: 'Cerâmica', kind: 'company', status: 'active', lead_days: 7,
    categories: [' Cerâmica ', 'Artesanato', 'cerâmica'], email: ' COMERCIAL@EXAMPLE.TEST ' };
  await fails(directory(ids.reader, 'suppliers'), '42501');
  await fails(saveDirectory(ids.manager, 'location', location), '42501');
  await sql`
    INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
    VALUES (${ids.org}, ${ids.store}, ${person.manager}, ${ids.manager}, 'settings.manage', ${ids.operator}),
      (${ids.org}, ${ids.store}, ${person.manager}, ${ids.manager}, 'suppliers.manage', ${ids.operator}),
      (${ids.org}, ${ids.store}, ${person.reader}, ${ids.reader}, 'settings.view', ${ids.operator})
  `;
  const locationRequest = randomUUID();
  const storedLocation = await saveDirectory(ids.manager, 'location', location, locationRequest);
  assert.deepEqual(await status(ids.manager, locationRequest), storedLocation);
  assert.deepEqual(await saveDirectory(ids.manager, 'location', location, locationRequest), storedLocation);
  await fails(saveDirectory(ids.reader, 'location', location), '42501');
  await fails(saveDirectory(ids.manager, 'location', { ...location, name: 'ESTOQUE CENTRAL' }), 'PT409', 'SOJA_STORE_DUPLICATE_LOCATION');
  const locations = await directory(ids.reader, 'locations');
  assert.equal(locations.total, 1);
  assert.equal(locations.items[0].notes, 'Recepção');
  assert.ok(!Object.hasOwn(locations.items[0], 'org_id'));
  const locationEdits = await Promise.allSettled([
    saveDirectory(ids.manager, 'location', { ...location, id: storedLocation.id, status: 'archived' }, randomUUID(), 1),
    saveDirectory(ids.manager, 'location', { ...location, id: storedLocation.id, notes: 'Novo texto' }, randomUUID(), 1),
  ]);
  assert.equal(locationEdits.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(locationEdits.find((result) => result.status === 'rejected').reason.message, 'SOJA_STORE_STALE_VERSION');

  const storedSupplier = await saveDirectory(ids.manager, 'supplier', supplier);
  const suppliers = await directory(ids.manager, 'suppliers');
  assert.equal(suppliers.total, 1);
  assert.equal(suppliers.items[0].email, 'comercial@example.test');
  assert.deepEqual(suppliers.items[0].categories, ['Artesanato', 'Cerâmica']);
  await fails(directory(ids.reader, 'suppliers'), '42501');
  await fails(saveDirectory(ids.manager, 'supplier', { ...supplier, email: 'inválido' }), '22023', 'SOJA_STORE_INVALID_SUPPLIER');
  await fails(saveDirectory(ids.manager, 'supplier', { ...supplier, categories: [5] }), '22023', 'SOJA_STORE_INVALID_SUPPLIER_CATEGORIES');
  const editedSupplier = await saveDirectory(ids.manager, 'supplier', { ...supplier, id: storedSupplier.id, status: 'archived', lead_days: null }, randomUUID(), 1);
  assert.equal(editedSupplier.version, 2);
  assert.equal(editedSupplier.status, 'archived');
  assert.equal((await directory(ids.manager, 'suppliers')).items[0].lead_days, null);
  console.log('PASS locations and suppliers with scoped contact visibility, deduplication, audit, and concurrent edit conflict');

  await sql`
    INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
    VALUES
      (${ids.org}, ${ids.store}, ${person.manager}, ${ids.manager}, 'purchases.manage', ${ids.operator}),
      (${ids.org}, ${ids.store}, ${person.secondManager}, ${ids.secondManager}, 'purchases.manage', ${ids.operator}),
      (${ids.org}, ${ids.store}, ${person.reader}, ${ids.reader}, 'stock.view', ${ids.operator})
  `;
  const buyingLocation = await saveDirectory(ids.manager, 'location', { ...location, name: 'Recebimento' });
  const buyingSupplier = await saveDirectory(ids.manager, 'supplier', { ...supplier, name: 'Compra de teste' });
  const foreignLocation = (await sql`
    INSERT INTO soja_store_private.locations (org_id, commission_id, name, kind, status, created_by, updated_by)
    VALUES (${ids.foreignOrg}, ${ids.foreignStore}, 'Outro estoque', 'warehouse', 'active', ${ids.manager}, ${ids.manager})
    RETURNING id
  `)[0].id;
  const purchasable = await detail(ids.reader, otherId);
  const purchaseVariant = purchasable.variants[0];
  const purchasePayload = {
    supplier_id: buyingSupplier.id, location_id: buyingLocation.id,
    ordered_on: '2025-01-31', expected_on: '2025-02-12', reference: 'Pedido de teste',
    freight_cents: 99, charges_cents: 1,
    lines: [{ variant_id: purchaseVariant.id, quantity: '20', unit_cost: '2.500250' }],
  };
  const buy = (actor, payload, requestId = randomUUID()) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_create_purchase(${ids.org}, ${ids.store}, ${requestId}, ${tx.json(payload)}) AS result
  `)[0].result);
  const receive = (actor, payload, version, requestId = randomUUID()) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_receive_purchase(${ids.org}, ${ids.store}, ${requestId}, ${version}, ${tx.json(payload)}) AS result
  `)[0].result);
  const orderDetail = (actor, orderId) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_purchase(${ids.org}, ${ids.store}, ${orderId}) AS result
  `)[0].result);
  const stock = (variantId = null) => as(ids.reader, async (tx) => (await tx`
    SELECT public.soja_store_stock(${ids.org}, ${ids.store}, NULL, ${variantId}) AS result
  `)[0].result);
  const buyOptions = (actor) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_purchase_options(${ids.org}, ${ids.store}) AS result
  `)[0].result);
  await fails(buy(ids.reader, purchasePayload), '42501');
  await fails(buy(ids.manager, { ...purchasePayload, location_id: foreignLocation }), '22023', 'SOJA_STORE_PURCHASE_LOCATION_UNAVAILABLE');
  await fails(buy(ids.manager, { ...purchasePayload, lines: [...purchasePayload.lines, ...purchasePayload.lines] }),
    '22023', 'SOJA_STORE_PURCHASE_DUPLICATE_LINE');
  await fails(buy(ids.manager, { ...purchasePayload, lines: [{ ...purchasePayload.lines[0], quantity: '1.0000001' }] }),
    '22023', 'SOJA_STORE_INVALID_PURCHASE_AMOUNT');
  await fails(buyOptions(ids.reader), '42501');
  assert.deepEqual((await buyOptions(ids.secondManager)).suppliers, [{ id: buyingSupplier.id, name: 'Compra de teste' }]);
  assert.deepEqual(await stock(), { total: 0, items: [] });

  const orderRequest = randomUUID();
  const orders = await Promise.all([
    buy(ids.manager, purchasePayload, orderRequest), buy(ids.manager, purchasePayload, orderRequest),
  ]);
  assert.deepEqual(orders[0], orders[1]);
  assert.deepEqual(await status(ids.manager, orderRequest), orders[0]);
  const order = orders[0];
  assert.equal(order.total_cents, 5101);
  assert.equal(order.status, 'ordered');
  assert.deepEqual(await stock(), { total: 0, items: [] });
  await fails(orderDetail(ids.reader, order.id), '42501');
  const ordered = await orderDetail(ids.manager, order.id);
  assert.equal(ordered.lines[0].unit_cost, '2.500250');
  assert.equal(Number(ordered.lines[0].pending_quantity), 20);
  await fails(saveDirectory(ids.manager, 'location', { ...location, id: buyingLocation.id, status: 'archived' }, randomUUID(), 1),
    'PT409', 'SOJA_STORE_LOCATION_HAS_PENDING_PURCHASES');
  await fails(save(ids.manager, { ...purchasable, unit: 'kg' }, randomUUID(), purchasable.version),
    'PT409', 'SOJA_STORE_PRODUCT_UNIT_IN_USE');
  const purchasePage = await as(ids.manager, async (tx) => (await tx`
    SELECT public.soja_store_purchases(${ids.org}, ${ids.store}, 'ordered', 1, 0, NULL, NULL, ${purchaseVariant.id}) AS result
  `)[0].result);
  assert.equal(purchasePage.total, 1);
  assert.equal(purchasePage.items[0].id, order.id);
  assert.equal((await dashboard(ids.manager)).ordered_purchases, purchasePage.total);
  assert.equal((await dashboard(ids.manager)).stock_positions, null);
  assert.equal((await dashboard(ids.reader)).stock_positions, 0);

  const receiptRequest = randomUUID();
  const receiptPayload = {
    purchase_id: order.id, received_on: '2025-02-03', reference: 'Conferência de teste',
    lines: [{ purchase_line_id: ordered.lines[0].id, quantity: '8' }],
  };
  await sql`
    INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
    VALUES (${ids.org}, ${ids.store}, ${person.reader}, ${ids.reader}, 'purchases.receive', ${ids.operator})
  `;
  await fails(receive(ids.reader, receiptPayload, 1), '42501');
  await sql`
    INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
    VALUES (${ids.org}, ${ids.store}, ${person.reader}, ${ids.reader}, 'purchases.view', ${ids.operator})
  `;
  const redactedOrder = await orderDetail(ids.reader, order.id);
  assert.equal(redactedOrder.total_cents, null);
  assert.equal(redactedOrder.freight_cents, null);
  assert.equal(redactedOrder.charges_cents, null);
  assert.equal(redactedOrder.lines[0].unit_cost, null);
  assert.equal(redactedOrder.lines[0].line_total_cents, null);
  const redactedPage = await as(ids.reader, async (tx) => (await tx`
    SELECT public.soja_store_purchases(${ids.org}, ${ids.store}) AS result
  `)[0].result);
  assert.equal(redactedPage.items[0].total_cents, null);
  await sql`
    INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
    VALUES (${ids.org}, ${ids.store}, ${person.reader}, ${ids.reader}, 'purchases.costs', ${ids.operator})
  `;
  assert.equal((await orderDetail(ids.reader, order.id)).total_cents, 5101);
  await sql`
    UPDATE soja_store_private.access_grants SET revoked_at = now()
    WHERE org_id = ${ids.org} AND commission_id = ${ids.store} AND person_id = ${person.reader} AND capability = 'purchases.costs'
  `;
  await fails(receive(ids.manager, { ...receiptPayload, location_id: foreignLocation }, 1), '22023', 'SOJA_STORE_INVALID_PURCHASE');
  await fails(receive(ids.manager, { ...receiptPayload, lines: [{ ...receiptPayload.lines[0], purchase_line_id: randomUUID() }] }, 1),
    '22023', 'SOJA_STORE_PURCHASE_LINE_MISMATCH');
  await fails(receive(ids.manager, { ...receiptPayload, lines: [...receiptPayload.lines, ...receiptPayload.lines] }, 1),
    '22023', 'SOJA_STORE_PURCHASE_DUPLICATE_LINE');
  assert.deepEqual(await stock(), { total: 0, items: [] });
  const partial = await Promise.all([
    receive(ids.reader, receiptPayload, 1, receiptRequest), receive(ids.reader, receiptPayload, 1, receiptRequest),
  ]);
  assert.deepEqual(partial[0], partial[1]);
  assert.deepEqual(await status(ids.reader, receiptRequest), partial[0]);
  assert.equal(partial[0].total_cents, null);
  assert.equal(partial[0].status, 'partially_received');
  const partialDetail = await orderDetail(ids.manager, order.id);
  assert.equal(Number(partialDetail.lines[0].received_quantity), 8);
  assert.equal(Number(partialDetail.lines[0].pending_quantity), 12);
  assert.equal(partialDetail.receipts.length, 1);
  assert.equal(Number((await stock()).items[0].quantity), 8);
  const partialOverview = await dashboard(ids.reader);
  assert.equal(partialOverview.ordered_purchases, 0);
  assert.equal(partialOverview.partial_purchases, 1);
  assert.equal(partialOverview.stock_positions, 1);
  await fails(receive(ids.reader, { ...receiptPayload, reference: 'Outra referência' }, 1, receiptRequest),
    'PT409', 'SOJA_STORE_REQUEST_CONFLICT');
  await fails(receive(ids.manager, { ...receiptPayload, lines: [{ ...receiptPayload.lines[0], quantity: '13' }] }, 2),
    'PT409', 'SOJA_STORE_PURCHASE_RECEIPT_EXCEEDS_PENDING');

  const rest = { ...receiptPayload, lines: [{ ...receiptPayload.lines[0], quantity: '12' }] };
  const competingReceipts = await Promise.allSettled([
    receive(ids.manager, rest, 2), receive(ids.secondManager, rest, 2),
  ]);
  assert.equal(competingReceipts.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(competingReceipts.find((entry) => entry.status === 'rejected').reason.message, 'SOJA_STORE_STALE_VERSION');
  assert.equal((await orderDetail(ids.manager, order.id)).status, 'received');
  await fails(receive(ids.manager, rest, 3), 'PT409', 'SOJA_STORE_PURCHASE_ALREADY_RECEIVED');
  const finalStock = await stock(purchaseVariant.id);
  assert.equal(finalStock.total, 1);
  assert.equal(Number(finalStock.items[0].quantity), 20);
  assert.equal(finalStock.items[0].ownership, 'own');
  assert.ok(!Object.hasOwn(finalStock.items[0], 'unit_cost'));
  assert.equal((await stock(randomUUID())).total, 0);
  await fails(as(ids.reader, (tx) => tx`SELECT * FROM soja_store_private.stock_movements`), '42501');
  await fails(sql`UPDATE soja_store_private.stock_movements SET quantity = 99`, '55000', 'SOJA_STORE_STOCK_HISTORY_IMMUTABLE');

  await save(ids.manager, {
    ...purchasable, name: 'Nome atualizado', variants: [{ ...purchaseVariant, sku: 'SKU-NOVO' }],
  }, randomUUID(), purchasable.version);
  assert.equal((await stock()).items[0].product_name, 'Nome atualizado');
  const movements = await as(ids.reader, async (tx) => (await tx`
    SELECT public.soja_store_stock_movements(${ids.org}, ${ids.store}, NULL, ${purchaseVariant.id}, 1, 0) AS result
  `)[0].result);
  assert.equal(movements.total, 2);
  assert.equal(movements.items.length, 1);
  assert.equal(movements.items[0].sku, purchaseVariant.sku);
  assert.ok(!Object.hasOwn(movements.items[0], 'unit_cost'));
  const stockOptions = await as(ids.reader, async (tx) => (await tx`
    SELECT public.soja_store_stock_options(${ids.org}, ${ids.store}, 'não corresponde', 1,
      ${buyingLocation.id}, ${purchaseVariant.id}) AS result
  `)[0].result);
  assert.equal(stockOptions.locations[0].id, buyingLocation.id);
  assert.equal(stockOptions.variants[0].id, purchaseVariant.id);
  console.log('PASS purchase rounding, 8 of 20 partial receipt, idempotency, concurrency, cost segregation and immutable stock');
  const receivedOverview = await dashboard(ids.reader);
  assert.equal(receivedOverview.ordered_purchases, 0);
  assert.equal(receivedOverview.partial_purchases, 0);
  assert.equal(receivedOverview.stock_positions, finalStock.total);
  console.log('PASS overview totals beyond one page, capability redaction, and matching stock and purchase filters');

  // Exercise migration over a populated native ledger and keep the existing receipt IDs.
  // The rollout's role behavior is covered separately, so keep explicit grants in this fixture.
  await sql`CREATE TABLE soja_store_private.operational_capability_registry (capability text PRIMARY KEY)`;
  const inventoryMigration = await sql.reserve();
  try {
    await inventoryMigration.unsafe(await readFile(new URL('../../supabase/migrations/20261112120600_soja_store_inventory.sql', import.meta.url), 'utf8'));
  } finally {
    await inventoryMigration.release();
  }
  assert.equal((await stock(purchaseVariant.id)).items[0].quantity, '20.000000');
  assert.equal((await stock(purchaseVariant.id)).items[0].available_quantity, '20.000000');
  assert.equal((await stock(purchaseVariant.id)).items[0].reserved_quantity, '0');
  const oldMovement = (await as(ids.reader, async (tx) => (await tx`
    SELECT public.soja_store_stock_movements(${ids.org}, ${ids.store}, NULL, ${purchaseVariant.id}) AS result
  `)[0].result)).items[0];
  assert.equal(oldMovement.id, movements.items[0].id);
  assert.equal(oldMovement.sku, purchaseVariant.sku);
  assert.equal(oldMovement.inventory_count_id, null);

  await sql`
    INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
    VALUES (${ids.org}, ${ids.store}, ${person.manager}, ${ids.manager}, 'stock.manage', ${ids.operator}),
      (${ids.org}, ${ids.store}, ${person.secondManager}, ${ids.secondManager}, 'stock.manage', ${ids.operator})
  `;
  const openedProduct = await save(ids.manager, { ...base, name: 'Produto de contagem', variants: [{ sku: 'CONTA-1' }] });
  const openedVariant = (await detail(ids.reader, openedProduct.id)).variants[0];
  const countedAt = await saveDirectory(ids.manager, 'location', { ...location, name: 'Posição contada' });
  const pos = (actor, variantId, locationId = countedAt.id) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_inventory_position(${ids.org}, ${ids.store}, ${variantId}, ${locationId}) AS result
  `)[0].result);
  const record = (actor, payload, version, requestId = randomUUID()) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_record_inventory(${ids.org}, ${ids.store}, ${requestId}, ${version}, ${tx.json(payload)}) AS result
  `)[0].result);
  const opening = {
    variant_id: openedVariant.id, location_id: countedAt.id,
    kind: 'opening_count', quantity: '7.250000', reason: 'Conferência física da posição', reference: 'Contagem 1',
  };
  await fails(pos(ids.reader, openedVariant.id), '42501');
  await fails(record(ids.reader, opening, 0), '42501');
  await fails(record(ids.manager, { ...opening, location_id: foreignLocation }, 0), 'PT404');
  await fails(record(ids.manager, { ...opening, quantity: '-1' }, 0), '22023');
  await fails(record(ids.manager, { ...opening, reason: '' }, 0), '22023');
  await fails(record(ids.manager, { ...opening, kind: 'inventory_adjustment' }, 0), 'PT409', 'SOJA_STORE_OPENING_REQUIRED');
  assert.deepEqual(await pos(ids.manager, openedVariant.id), {
    quantity: '0', available_quantity: '0', version: 0, has_movement: false,
  });
  const inventoryOptions = await as(ids.manager, async (tx) => (await tx`
    SELECT public.soja_store_inventory_options(${ids.org}, ${ids.store}, 'sem correspondência', 1,
      ${countedAt.id}, ${openedVariant.id}) AS result
  `)[0].result);
  assert.equal(inventoryOptions.locations[0].id, countedAt.id);
  assert.equal(inventoryOptions.variants[0].id, openedVariant.id);

  const countRequest = randomUUID();
  const openingResults = await Promise.all([
    record(ids.manager, opening, 0, countRequest), record(ids.manager, opening, 0, countRequest),
  ]);
  assert.deepEqual(openingResults[0], openingResults[1]);
  assert.deepEqual(await status(ids.manager, countRequest), openingResults[0]);
  await fails(record(ids.manager, { ...opening, quantity: '8' }, 0, countRequest), 'PT409', 'SOJA_STORE_REQUEST_CONFLICT');
  await fails(record(ids.manager, opening, 1), 'PT409', 'SOJA_STORE_OPENING_ALREADY_RECORDED');
  assert.deepEqual(await pos(ids.manager, openedVariant.id), {
    quantity: '7.250000', available_quantity: '7.250000', version: 1, has_movement: true,
  });
  await fails(saveDirectory(ids.manager, 'location', { ...location, id: countedAt.id, status: 'archived' }, randomUUID(), 1),
    'PT409', 'SOJA_STORE_LOCATION_HAS_STOCK');

  const adjustment = { ...opening, kind: 'inventory_adjustment', quantity: '4.500000', reason: 'Recontagem da posição' };
  const adjustmentRace = await Promise.allSettled([
    record(ids.manager, adjustment, 1), record(ids.secondManager, adjustment, 1),
  ]);
  assert.equal(adjustmentRace.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(adjustmentRace.find((entry) => entry.status === 'rejected').reason.message, 'SOJA_STORE_STALE_VERSION');
  const countHistory = await as(ids.reader, async (tx) => (await tx`
    SELECT public.soja_store_stock_movements(${ids.org}, ${ids.store}, ${countedAt.id}, ${openedVariant.id}) AS result
  `)[0].result);
  const adjustedMovement = countHistory.items.find((entry) => entry.movement_type === 'inventory_adjustment');
  assert.equal(adjustedMovement.quantity, '-2.750000');
  assert.equal(adjustedMovement.previous_quantity, '7.250000');
  assert.equal(adjustedMovement.counted_quantity, '4.500000');
  assert.equal(adjustedMovement.reason, adjustment.reason);
  assert.equal(adjustedMovement.purchase_id, null);
  assert.ok(!Object.hasOwn(adjustedMovement, 'unit_cost'));
  await fails(sql`DELETE FROM soja_store_private.inventory_counts WHERE id = ${adjustedMovement.inventory_count_id}`,
    '55000', 'SOJA_STORE_STOCK_HISTORY_IMMUTABLE');

  const openAfterZero = await record(ids.manager, { ...adjustment, quantity: '0' }, 2);
  assert.equal(openAfterZero.quantity, '0.000000');
  await record(ids.manager, { ...adjustment, quantity: '0' }, 3);
  assert.equal((await pos(ids.manager, openedVariant.id)).version, 4);
  assert.equal((await stock(openedVariant.id)).items[0].available_quantity, '0.000000');

  const concurrentBuy = await buy(ids.manager, {
    ...purchasePayload, location_id: countedAt.id,
    lines: [{ variant_id: openedVariant.id, quantity: '3', unit_cost: '1.000000' }],
  });
  const concurrentLine = (await orderDetail(ids.manager, concurrentBuy.id)).lines[0];
  const change = await Promise.allSettled([
    receive(ids.manager, { ...receiptPayload, purchase_id: concurrentBuy.id, lines: [{ purchase_line_id: concurrentLine.id, quantity: '3' }] }, 1),
    record(ids.secondManager, { ...adjustment, quantity: '2' }, 4),
  ]);
  assert.equal(change[0].status, 'fulfilled');
  const quantityAfterRace = Number((await pos(ids.manager, openedVariant.id)).quantity);
  if (change[1].status === 'fulfilled') assert.equal(quantityAfterRace, 5);
  else {
    assert.equal(change[1].reason.message, 'SOJA_STORE_STALE_VERSION');
    assert.equal(quantityAfterRace, 3);
  }
  assert.equal((await sql`
    WITH ledger AS (
      SELECT org_id, commission_id, variant_id, location_id, ownership, owner_supplier_id, destination, sum(quantity) AS quantity
      FROM soja_store_private.stock_movements
      GROUP BY org_id, commission_id, variant_id, location_id, ownership, owner_supplier_id, destination
    )
    SELECT count(*)::int AS mismatch FROM soja_store_private.stock_positions s
    LEFT JOIN ledger m ON m.org_id = s.org_id AND m.commission_id = s.commission_id AND m.variant_id = s.variant_id
      AND m.location_id = s.location_id AND m.ownership = s.ownership
      AND m.owner_supplier_id IS NOT DISTINCT FROM s.owner_supplier_id AND m.destination = s.destination
    WHERE m.quantity IS DISTINCT FROM s.quantity
  `)[0].mismatch, 0);
  console.log('PASS immutable opening count, inventory deltas, native receipt preservation, scoped grants, receipt race and stock reconciliation');

  const transferMigration = await sql.reserve();
  try {
    await transferMigration.unsafe(await readFile(new URL('../../supabase/migrations/20261112120900_soja_store_transfers.sql', import.meta.url), 'utf8'));
  } finally {
    await transferMigration.release();
  }
  const transferAt = await saveDirectory(ids.manager, 'location', { ...location, name: 'Destino de teste' });
  const transferPayload = {
    origin_id: countedAt.id, destination_id: transferAt.id, variant_id: openedVariant.id,
    quantity: '2.250000', reason: 'Reposição entre pontos',
  };
  const makeTransfer = (actor, payload, requestId = randomUUID()) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_create_transfer(${ids.org}, ${ids.store}, ${requestId}, ${tx.json(payload)}) AS result
  `)[0].result);
  const transferCommand = (command, actor, version, payload, requestId = randomUUID()) => as(actor, async (tx) => (await tx`
    SELECT public.${tx('soja_store_' + command + '_transfer')}(${ids.org}, ${ids.store}, ${requestId}, ${version}, ${tx.json(payload)}) AS result
  `)[0].result);
  const getTransfer = (actor, id) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_transfer(${ids.org}, ${ids.store}, ${id}) AS result
  `)[0].result);
  await fails(makeTransfer(ids.reader, transferPayload), '42501');
  await fails(makeTransfer(ids.manager, { ...transferPayload, destination_id: countedAt.id }), '22023');
  await fails(makeTransfer(ids.manager, { ...transferPayload, destination_id: foreignLocation }), 'PT404');
  await fails(makeTransfer(ids.manager, { ...transferPayload, quantity: '-1' }), '22023');
  const transferRequest = randomUUID();
  const transfer = await makeTransfer(ids.manager, transferPayload, transferRequest);
  assert.deepEqual(await makeTransfer(ids.manager, transferPayload, transferRequest), transfer);
  assert.equal(transfer.status, 'requested');
  assert.equal(Number((await pos(ids.manager, openedVariant.id)).quantity), quantityAfterRace);
  assert.equal(Number((await pos(ids.manager, openedVariant.id, transferAt.id)).quantity), 0);
  await fails(saveDirectory(ids.manager, 'location', { ...location, id: transferAt.id, status: 'archived' }, randomUUID(), 1),
    'PT409', 'SOJA_STORE_LOCATION_HAS_PENDING_TRANSFERS');

  const overTransfer = await makeTransfer(ids.manager, { ...transferPayload, quantity: '30' });
  await fails(transferCommand('dispatch', ids.manager, 1, { transfer_id: overTransfer.id }),
    'PT409', 'SOJA_STORE_TRANSFER_INSUFFICIENT');
  await transferCommand('cancel', ids.manager, 1, { transfer_id: overTransfer.id });
  await fails(transferCommand('receive', ids.manager, 1, { transfer_id: transfer.id, quantity: '1' }),
    'PT409', 'SOJA_STORE_TRANSFER_INVALID_STATUS');

  const dispatchRequest = randomUUID();
  const dispatch = await transferCommand('dispatch', ids.manager, 1, { transfer_id: transfer.id }, dispatchRequest);
  assert.deepEqual(await transferCommand('dispatch', ids.manager, 1, { transfer_id: transfer.id }, dispatchRequest), dispatch);
  assert.deepEqual(await status(ids.manager, dispatchRequest), dispatch);
  assert.equal(dispatch.status, 'in_transit');
  assert.equal(Number((await pos(ids.manager, openedVariant.id)).quantity), quantityAfterRace - 2.25);
  assert.equal(Number((await pos(ids.manager, openedVariant.id, transferAt.id)).quantity), 0);
  assert.equal(Number((await getTransfer(ids.reader, transfer.id)).in_transit_quantity), 2.25);
  await fails(transferCommand('cancel', ids.manager, 2, { transfer_id: transfer.id }),
    'PT409', 'SOJA_STORE_TRANSFER_INVALID_STATUS');
  await fails(transferCommand('receive', ids.manager, 2, { transfer_id: transfer.id, quantity: '3' }),
    'PT409', 'SOJA_STORE_TRANSFER_EXCEEDS_TRANSIT');

  const partialTransfer = await transferCommand('receive', ids.secondManager, 2, {
    transfer_id: transfer.id, quantity: '1', reference: 'Conferência 1',
  });
  assert.equal(partialTransfer.status, 'partially_received');
  assert.equal(Number((await getTransfer(ids.reader, transfer.id)).in_transit_quantity), 1.25);
  assert.equal(Number((await pos(ids.manager, openedVariant.id, transferAt.id)).quantity), 1);
  const completion = { transfer_id: transfer.id, quantity: '1.250000' };
  const competingTransfers = await Promise.allSettled([
    transferCommand('receive', ids.manager, 3, completion), transferCommand('receive', ids.secondManager, 3, completion),
  ]);
  assert.equal(competingTransfers.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(competingTransfers.find((entry) => entry.status === 'rejected').reason.message, 'SOJA_STORE_STALE_VERSION');
  const completedTransfer = await getTransfer(ids.reader, transfer.id);
  assert.equal(completedTransfer.status, 'received');
  assert.equal(Number(completedTransfer.in_transit_quantity), 0);
  assert.equal(Number((await pos(ids.manager, openedVariant.id, transferAt.id)).quantity), 2.25);
  assert.equal(completedTransfer.events.length, 3);
  const destinationHistory = await as(ids.reader, async (tx) => (await tx`
    SELECT public.soja_store_stock_movements(${ids.org}, ${ids.store}, ${transferAt.id}, ${openedVariant.id}) AS result
  `)[0].result);
  assert.equal(destinationHistory.total, 2);
  assert.ok(destinationHistory.items.every((entry) => entry.transfer_id === transfer.id && entry.sku === openedVariant.sku));
  const transferPage = await as(ids.reader, async (tx) => (await tx`
    SELECT public.soja_store_transfers(${ids.org}, ${ids.store}, 'received', 1, 0) AS result
  `)[0].result);
  assert.equal(transferPage.total, 1);
  assert.equal(transferPage.items[0].id, transfer.id);
  await fails(sql`DELETE FROM soja_store_private.stock_transfer_events WHERE id = ${completedTransfer.events[0].id}`,
    '55000', 'SOJA_STORE_STOCK_HISTORY_IMMUTABLE');
  console.log('PASS requested transfer, dispatch, partial receipts, races, immutable events and conserved quantities');

  await sql`UPDATE public.commission_people SET user_id = ${ids.replacement} WHERE id = ${person.manager}`;
  assert.deepEqual(await access(ids.manager), { enabled: true, capabilities: [] });
  assert.deepEqual(await access(ids.replacement), { enabled: true, capabilities: [] });
  await fails(status(ids.manager, request), '42501');
  await sql`UPDATE public.commission_responsibles SET active = false WHERE person_id = ${person.reader}`;
  await fails(detail(ids.reader, productId), '42501');
  console.log('PASS deactivated membership and relinked-account revocation');
} finally {
  await sql.end();
  await admin`DROP DATABASE ${admin(database)}`;
  await admin.end();
}
