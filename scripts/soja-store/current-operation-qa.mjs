import { sojaMigrationSource } from './migration-envelope.mjs';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const socket = process.env.SOJA_STORE_TEST_PG_SOCKET;
if (!socket?.startsWith('/')) throw new Error('Use a disposable local PostgreSQL socket.');
const options = { host: socket, port: Number(process.env.SOJA_STORE_TEST_PG_PORT ?? 55442), username: 'postgres' };
const admin = postgres({ ...options, database: 'postgres' });
const db = 'soja_store_current_' + uuid().replaceAll('-', '');
await admin`CREATE DATABASE ${admin(db)}`;
const sql = postgres({ ...options, database: db, onnotice: () => {} });
const [org, store, first, second, outsider] = Array.from({ length: 5 }, () => uuid());

const migrationFiles = [
  '20261112120000_soja_store_catalog',
  '20261112120100_soja_store_directory',
  '20261112120200_soja_store_purchases_stock',
  '20261112120400_soja_store_overview',
  '20261112120500_soja_store_access_rollout',
  '20261112120550_soja_store_enable',
  '20261112120600_soja_store_inventory',
  '20261112120700_soja_store_customers',
  '20261112120800_soja_store_cash',
  '20261112120900_soja_store_transfers',
  '20261112121000_soja_store_finance',
  '20261112121200_soja_store_sales',
  '20261112121500_soja_store_current_overview',
  '20261112121600_soja_store_sale_fulfillment',
  '20261112121700_soja_store_customer_sales',
  '20261113120000_soja_store_dashboard_finance_access',
];

async function as(actor, callback) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE authenticated`;
    await tx`SELECT set_config('request.jwt.claim.sub', ${actor}, true)`;
    return callback(tx);
  });
}

const read = (actor, name) => as(actor, async (tx) => (await tx`
  SELECT public.${tx('soja_store_' + name)}(${org}, ${store}) AS result
`)[0].result);
const write = (actor, name, payload, version, request = uuid()) => as(actor, async (tx) => {
  const args = version === undefined ? tx`${tx.json(payload)}` : tx`${version}, ${tx.json(payload)}`;
  return (await tx`SELECT public.${tx('soja_store_' + name)}(${org}, ${store}, ${request}, ${args}) AS result`)[0].result;
});
const rejects = (promise, message) => assert.rejects(promise, (error) => error.message === message);

try {
  await sql.unsafe(await readFile(new URL('./schema-fixture.sql', import.meta.url), 'utf8'));
  await sql`INSERT INTO public.organizations VALUES (${org})`;
  await sql`INSERT INTO public.commissions(id,org_id,slug) VALUES (${store},${org},'soja-store')`;
  for (const user of [first, second, outsider]) {
    await sql`INSERT INTO auth.users VALUES (${user})`;
    await sql`INSERT INTO public.org_members VALUES (${org},${user},${user === outsider ? 'leitura' : 'admin'},true)`;
  }
  for (const version of migrationFiles) {
    const source = await readFile(sojaMigrationSource(version + ".sql"), 'utf8');
    const connection = await sql.reserve();
    try { await connection.unsafe(source); }
    catch (error) { await connection`ROLLBACK`; throw error; }
    finally { connection.release(); }
  }
  assert.deepEqual(await read(first, 'customers'), { total: 0, items: [] });
  await rejects(read(outsider, 'customers'), 'SOJA_STORE_FORBIDDEN');
  const request = uuid();
  const customer = { name: 'Cliente atual', kind: 'individual', email: 'cliente@example.invalid', city: 'Santa Rosa', status: 'active', communication_consent: false };
  const created = await write(first, 'save_customer', customer, null, request);
  assert.deepEqual(await write(first, 'save_customer', customer, null, request), created);
  await rejects(write(first, 'save_customer', { ...customer, name: 'Outra pessoa' }, null, request), 'SOJA_STORE_REQUEST_CONFLICT');
  const list = await read(second, 'customers');
  assert.equal(list.items[0].id, created.id);
  assert.equal(Object.hasOwn(list.items[0], 'email'), false);
  const product = await write(first, 'save_product', { name: 'Caneca', unit: 'un', status: 'active', variants: [{ sku: 'CAN-01' }] }, null);
  const products = await read(first, 'catalog');
  const variant = products.items.find((item) => item.id === product.id).variants[0].id;
  const interest = { customer_id: created.id, variant_id: variant, quantity: '2.5', status: 'open' };
  const firstInterest = await write(second, 'save_interest', interest, null);
  await rejects(write(first, 'save_interest', interest, null), 'SOJA_STORE_INTEREST_ALREADY_OPEN');
  await write(first, 'save_interest', { ...interest, id: firstInterest.id, status: 'closed' }, firstInterest.version);
  const detail = await as(second, async (tx) => (await tx`SELECT public.soja_store_customer(${org}, ${store}, ${created.id}) AS result`)[0].result);
  assert.equal(detail.email, customer.email);
  assert.equal(detail.interests[0].status, 'closed');
  assert.equal(detail.interests[0].quantity, '2.500000');
  assert.equal((await read(first, 'stock')).total, 0);
  console.log('PASS fresh customers, contact projection, replay, versioned interest and scope');

  assert.deepEqual(await read(first, 'pos_config'), { rule: null, points: [] });
  const rule = await write(first, 'save_pos_rule', { approval_reference: 'Referência do teste', active: true, methods: ['cash','pix'] }, null);
  await rejects(write(first, 'save_pos_rule', { approval_reference: 'Outra referência', active: true, methods: ['cash'] }, null), 'SOJA_STORE_STALE_VERSION');
  assert.equal((await read(first, 'pos_config')).rule.version, rule.version);
  const point = await write(first, 'save_location', { name: 'Ponto atual', kind: 'point', status: 'active' }, null);
  const open = { location_id: point.id, opening_cents: 10000 };
  const session = await write(first, 'open_cash', open);
  await rejects(write(second, 'open_cash', open), 'SOJA_STORE_CASH_ALREADY_OPEN');
  const supply = await write(first, 'adjust_cash', { session_id: session.id, kind: 'supply', amount_cents: 2000, reason: 'Suprimento teste' }, session.version);
  const out = await write(second, 'adjust_cash', { session_id: session.id, kind: 'withdrawal', amount_cents: 1000, reason: 'Sangria teste' }, supply.version);
  assert.equal((await read(first, 'cash_sessions')).items[0].expected_cents, 11000);
  await rejects(write(first, 'close_cash', { session_id: session.id, counted_cents: 10500 }, out.version), 'SOJA_STORE_CASH_DIFFERENCE_REASON_REQUIRED');
  await rejects(write(second, 'close_cash', { session_id: session.id, counted_cents: 11000 }, out.version), 'SOJA_STORE_CASH_DIFFERENCE_REASON_REQUIRED');
  const closed = await write(second, 'close_cash', { session_id: session.id, counted_cents: 10500, reason: 'Diferença conferida' }, out.version);
  assert.equal(closed.status, 'closed');
  assert.equal((await read(first, 'cash_sessions')).items[0].difference_cents, -500);
  await rejects(write(first, 'adjust_cash', { session_id: session.id, kind: 'supply', amount_cents: 10, reason: 'Teste' }, closed.version), 'SOJA_STORE_CASH_NOT_OPEN');
  await rejects(read(outsider, 'cash_sessions'), 'SOJA_STORE_FORBIDDEN');
  console.log('PASS approved rule versions, unique open cash, supply, withdrawal, difference, closed session and scope');

  const saleCash = await write(first, 'open_cash', open);
  const today = (await sql`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS day`)[0].day;
  await write(first, 'record_inventory', { variant_id: variant, location_id: point.id, quantity: '3', reason: 'Abertura teste', kind: 'opening_count' }, 0);
  const price = await write(first, 'save_sale_price', { variant_id: variant, price_cents: 1000, effective_on: today });
  const line = { variant_id: variant, quantity: '1', price_id: price.id };
  const stock = async () => (await read(first, 'stock')).items[0];
  const sale = (id) => as(first, async (tx) => (await tx`SELECT public.soja_store_sale(${org},${store},${id}) AS result`)[0].result);
  const held = await write(first, 'create_sale', { session_id: saleCash.id, lines: [line], pending: true });
  assert.equal((await stock()).quantity, '3.000000');
  assert.equal((await stock()).reserved_quantity, '1');
  assert.equal((await sale(held.id)).payments.length, 0);
  await rejects(write(first, 'finish_sale', { sale_id: held.id, action: 'confirm', session_id: saleCash.id,
    payments: [{ method: 'pix', amount_cents: 1000 }] }, held.version), 'SOJA_STORE_SALE_PAYMENT_INVALID');
  const checkout = { session_id: saleCash.id, lines: [{ ...line, quantity: '2' }],
    payments: [{ method: 'cash', amount_cents: 1000, tendered_cents: 1500 }, { method: 'pix', amount_cents: 1000, reference: 'PIX verificado' }] };
  const outcomes = await Promise.allSettled([write(first, 'create_sale', checkout), write(second, 'create_sale', checkout)]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((result) => result.status === 'rejected').reason.message, 'SOJA_STORE_STOCK_INSUFFICIENT');
  const bought = await sale(outcomes.find((result) => result.status === 'fulfilled').value.id);
  assert.equal(bought.receipts.length, 1);
  assert.equal(bought.payments.length, 2);
  assert.equal(Number((await stock()).available_quantity), 0);
  assert.equal((await read(first, 'cash_sessions')).items.find((item) => item.id === saleCash.id).expected_cents, 11000);

  const cashPayment = bought.payments.find((payment) => payment.method === 'cash');
  const back = { sale_id: bought.id, session_id: saleCash.id, lines: [{ line_id: bought.lines[0].id, quantity: '1' }],
    refunds: [{ payment_id: cashPayment.id, amount_cents: 1000 }], reason: 'Devolução teste' };
  const returnRequest = uuid();
  const returned = await write(first, 'return_sale', back, bought.version, returnRequest);
  assert.equal(returned.status, 'returned_partially');
  assert.deepEqual(await write(first, 'return_sale', back, bought.version, returnRequest), returned);
  assert.equal(Number((await stock()).quantity), 2);
  await rejects(write(first, 'return_sale', { ...back, lines: [{ line_id: bought.lines[0].id, quantity: '2' }] }, returned.version), 'SOJA_STORE_SALE_RETURN_LIMIT');
  const confirmed = await write(first, 'finish_sale', { sale_id: held.id, action: 'confirm', session_id: saleCash.id,
    payments: [{ method: 'pix', amount_cents: 1000, reference: 'PIX confirmado' }] }, held.version);
  assert.equal(confirmed.status, 'completed');
  assert.equal(Number((await stock()).quantity), 1);
  assert.equal(Number((await stock()).reserved_quantity), 0);
  const fiscal = await write(first, 'record_sale_fiscal', { sale_id: held.id, reference: 'NFC-e externa teste' }, confirmed.version);
  assert.equal((await sale(fiscal.id)).fiscal_reference, 'NFC-e externa teste');
  assert.equal((await sql`SELECT count(*)::int AS n FROM soja_store_private.finance_obligations WHERE operation_id IN (${bought.id},${held.id})`)[0].n, 2);
  console.log('PASS approved sale, reservation without payment, competing checkout, split cash/PIX, partial return replay, receipt and external fiscal reference');

  const otherPoint = await write(first, 'save_location', { name: 'Ponto alternativo', kind: 'point', status: 'active' }, null);
  const vendor = await write(first, 'save_supplier', { name: 'Fornecedor teste', kind: 'company', status: 'active' }, null);
  const purchase = (location, when) => write(first, 'create_purchase', {
    supplier_id: vendor.id, location_id: location, ordered_on: when,
    lines: [{ variant_id: variant, quantity: '1', unit_cost: '5.25' }],
  });
  const matchingPurchase = await purchase(point.id, today);
  await purchase(otherPoint.id, today);
  await purchase(point.id, '2020-01-01');
  const overview = (actor, where = point.id) => as(actor, async (tx) => (await tx`
    SELECT public.soja_store_current_dashboard(${org}, ${store}, ${today}, ${today}, ${where}) AS result
  `)[0].result);
  const dashboard = await overview(first);
  assert.equal(dashboard.confirmed_sales, 2);
  assert.equal(dashboard.confirmed_cents, '2000');
  assert.equal(dashboard.received_cents, '2000');
  assert.equal(dashboard.ordered_purchases, 1);
  assert.equal(dashboard.stock_positions, 1);
  assert.equal(dashboard.active_products, null);
  assert.equal((await overview(first, otherPoint.id)).confirmed_sales, 0);
  assert.equal(dashboard.locations.length, 2);
  const filteredSales = await as(first, async (tx) => (await tx`
    SELECT public.soja_store_sales_filtered(${org}, ${store}, ${today}, ${today}, ${point.id}, true, 1) AS result
  `)[0].result);
  assert.equal(filteredSales.items.length, 1);
  assert.equal(filteredSales.total, dashboard.confirmed_sales);
  const filteredPurchases = await as(first, async (tx) => (await tx`
    SELECT public.soja_store_purchases_filtered(${org}, ${store}, ${today}, ${today}, 'ordered', NULL, ${point.id}) AS result
  `)[0].result);
  assert.equal(filteredPurchases.items[0].id, matchingPurchase.id);
  assert.equal(filteredPurchases.total, dashboard.ordered_purchases);

  // A sales reader can see the count, but the dashboard must not return monetary values.
  await sql`DELETE FROM soja_store_private.operational_capability_registry WHERE capability = 'finance.view'`;
  const salesOnly = await overview(first);
  assert.equal(salesOnly.confirmed_sales, dashboard.confirmed_sales);
  assert.equal(salesOnly.confirmed_cents, null);
  assert.equal(salesOnly.received_cents, null);
  await rejects(as(first, (tx) => tx`SELECT public.soja_store_finance_summary(${org}, ${store}, 2026)`), 'SOJA_STORE_FORBIDDEN');
  await sql`INSERT INTO soja_store_private.operational_capability_registry VALUES ('finance.view')`;

  const buyerOptions = await read(second, 'sale_customers');
  assert.deepEqual(buyerOptions, [{ id: created.id, name: customer.name, city: customer.city }]);
  await rejects(read(outsider, 'sale_customers'), 'SOJA_STORE_FORBIDDEN');
  const reservation = await write(first, 'create_sale', { session_id: saleCash.id, customer_id: created.id, lines: [line], pending: true });
  assert.ok(Date.parse((await sale(reservation.id)).reservation_expires_at) > Date.now());
  assert.equal((await sale(reservation.id)).customer_id, created.id);
  const history = await as(second, async (tx) => (await tx`
    SELECT public.soja_store_customer_sales(${org},${store},${created.id}) AS result
  `)[0].result);
  assert.deepEqual(history.items.map((entry) => entry.id), [reservation.id]);
  await rejects(as(outsider, (tx) => tx`SELECT public.soja_store_customer_sales(${org},${store},${created.id})`), 'SOJA_STORE_FORBIDDEN');
  const finish = (actor, id, action, version, payload = {}, request) => write(actor, 'finish_sale', {
    sale_id: id, action, ...payload,
  }, version, request);
  const paidWith = (amount) => ({ session_id: saleCash.id, payments: [{ method: 'pix', amount_cents: amount, reference: 'PIX teste' }] });
  await rejects(finish(first, reservation.id, 'deliver', 1), 'SOJA_STORE_SALE_NOT_PAID');
  await rejects(finish(first, reservation.id, 'payment', 1, paidWith(1100)), 'SOJA_STORE_SALE_PAYMENT_LIMIT');
  const depositRequest = uuid();
  const deposit = await finish(second, reservation.id, 'payment', 1, paidWith(400), depositRequest);
  assert.deepEqual(await finish(second, reservation.id, 'payment', 1, paidWith(400), depositRequest), deposit);
  assert.equal(deposit.status, 'pending');
  assert.equal((await sale(reservation.id)).paid_cents, 400);
  assert.equal((await sale(reservation.id)).receipts[0].snapshot.received_cents, 400);
  assert.equal((await sale(reservation.id)).payments[0].session_id, saleCash.id);
  assert.equal(Number((await stock()).quantity), 1);
  assert.equal(Number((await stock()).reserved_quantity), 1);
  await rejects(finish(first, reservation.id, 'cancel', 2, { reason: 'Tentativa de cancelar' }), 'SOJA_STORE_RESERVATION_HAS_PAYMENT');
  await sql`UPDATE soja_store_private.sales SET reservation_expires_at = now() - interval '1 minute' WHERE id = ${reservation.id}`;
  assert.equal((await sql`SELECT soja_store_private.expire_unpaid_reservation() AS result`)[0].result, 0);
  const full = await finish(first, reservation.id, 'payment', 2, paidWith(600));
  assert.equal(full.status, 'pending');
  assert.equal(Number((await stock()).quantity), 1);
  const closedSession = (await read(first, 'cash_sessions')).items.find((item) => item.id === saleCash.id);
  await write(first, 'close_cash', { session_id: saleCash.id, counted_cents: closedSession.expected_cents }, closedSession.version);
  const delivered = await finish(second, reservation.id, 'deliver', 3);
  assert.equal(delivered.status, 'completed');
  assert.ok((await sale(reservation.id)).delivered_at);
  assert.equal((await sale(reservation.id)).payments.length, 2);
  assert.equal(Number((await stock()).quantity), 0);
  assert.equal(Number((await stock()).reserved_quantity), 0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM soja_store_private.finance_obligations WHERE operation_id = ${reservation.id}`)[0].n, 1);

  const reopened = await write(first, 'open_cash', open);
  await write(first, 'record_inventory', { location_id: point.id, variant_id: variant, kind: 'inventory_adjustment',
    quantity: '1', reason: 'Contagem para teste de expiração' }, (await as(first, async (tx) => (await tx`
      SELECT public.soja_store_inventory_position(${org},${store},${variant},${point.id}) AS result
    `)[0].result)).version);
  const expired = await write(first, 'create_sale', { session_id: reopened.id, lines: [line], pending: true });
  await rejects(finish(first, expired.id, 'expire', 1), 'SOJA_STORE_RESERVATION_NOT_EXPIRED');
  await sql`UPDATE soja_store_private.sales SET reservation_expires_at = now() - interval '1 minute' WHERE id = ${expired.id}`;
  await rejects(finish(first, expired.id, 'payment', 1, { ...paidWith(1000), session_id: reopened.id }),
    'SOJA_STORE_RESERVATION_EXPIRED');
  assert.equal((await sql`SELECT soja_store_private.expire_unpaid_reservation() AS result`)[0].result, 1);
  assert.equal((await sql`SELECT soja_store_private.expire_unpaid_reservation() AS result`)[0].result, 0);
  assert.equal((await sale(expired.id)).reservation_release, 'expired');
  assert.equal(Number((await stock()).quantity), 1);
  assert.equal(Number((await stock()).reserved_quantity), 0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM soja_store_private.finance_obligations WHERE operation_id = ${expired.id}`)[0].n, 0);
  console.log('PASS partial receipts, isolated delivery after closing cash, and unpaid idempotent expiry');
  await rejects(overview(outsider), 'SOJA_STORE_FORBIDDEN');
  await rejects(as(first, async (tx) => tx`SELECT public.soja_store_current_dashboard(${org}, ${store}, ${today}, '2020-01-01')`), 'SOJA_STORE_INVALID_FILTER');
  console.log('PASS dashboard date/location scope, confirmed and received totals, refunded amount, exact drilldown and pagination');
} finally {
  await sql.end();
  await admin`DROP DATABASE ${admin(db)} WITH (FORCE)`;
  await admin.end();
}
