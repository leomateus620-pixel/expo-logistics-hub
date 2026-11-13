import { sojaMigrationSource } from './migration-envelope.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const socketPath = process.env.SOJA_STORE_TEST_PG_SOCKET;
const port = Number(process.env.SOJA_STORE_TEST_PG_PORT ?? 55442);
if (!socketPath?.startsWith('/') || !Number.isInteger(port)) throw new Error('Set SOJA_STORE_TEST_PG_SOCKET to a disposable PostgreSQL socket directory.');
const connection = { host: socketPath, port, username: 'postgres', onnotice: () => {} };
const admin = postgres({ ...connection, database: 'postgres', max: 1 });
const database = 'soja_store_finance_test_' + randomUUID().replaceAll('-', '');
await admin`CREATE DATABASE ${admin(database)}`;
const sql = postgres({ ...connection, database, max: 8 });
const [org, unit, otherOrg, otherUnit, manager, member, outsider] = Array.from({ length: 7 }, randomUUID);

const as = (actor, fn, role = 'authenticated') => sql.begin(async (tx) => {
  await tx`SET LOCAL ROLE ${tx(role)}`;
  await tx`SELECT set_config('request.jwt.claim.sub', ${actor ?? ''}, true)`;
  return fn(tx);
});
const summary = (actor = manager, year = 2026) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_finance_summary(${org}, ${unit}, ${year}) AS result
`)[0].result);
const entries = (kind = null, status = null, limit = 25) => as(member, async (tx) => (await tx`
  SELECT public.soja_store_finance_entries(${org}, ${unit}, 2026, ${kind}, ${status}, ${limit}, 0) AS result
`)[0].result);
const recognize = (payload, actor = manager, key = randomUUID()) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_recognize_obligation(${org}, ${unit}, ${key}, ${tx.json(payload)}) AS result
`)[0].result);
const change = (name, version, payload, key = randomUUID(), actor = manager) => as(actor, async (tx) => (await tx`
  SELECT public.${tx('soja_store_' + name)}(${org}, ${unit}, ${key}, ${version}, ${tx.json(payload)}) AS result
`)[0].result);
const fails = (promise, code, message) => assert.rejects(promise, (e) => e.code === code && (!message || e.message === message));

try {
  await sql.unsafe(await readFile(new URL('./schema-fixture.sql', import.meta.url), 'utf8'));
  await sql`INSERT INTO public.organizations VALUES (${org}), (${otherOrg})`;
  await sql`INSERT INTO public.commissions (id, org_id, slug) VALUES (${unit}, ${org}, 'soja-store'), (${otherUnit}, ${otherOrg}, 'sojastore')`;
  for (const user of [manager, member, outsider]) await sql`INSERT INTO auth.users VALUES (${user})`;
  await sql`INSERT INTO public.org_members VALUES (${org}, ${manager}, 'admin', true), (${org}, ${member}, 'operador', true), (${org}, ${outsider}, 'gestor', true)`;
  const person = randomUUID();
  await sql`INSERT INTO public.commission_people (id, org_id, user_id) VALUES (${person}, ${org}, ${member})`;
  await sql`INSERT INTO public.commission_responsibles (commission_id, org_id, person_id) VALUES (${unit}, ${org}, ${person})`;
  const migrations = [
    '20261112120000_soja_store_catalog.sql',
    '20261112120100_soja_store_directory.sql',
    '20261112120200_soja_store_purchases_stock.sql',
    '20261112120500_soja_store_access_rollout.sql',
    '20261112120550_soja_store_enable.sql',
    '20261112121000_soja_store_finance.sql',
  ];
  const reserved = await sql.reserve();
  try {
    for (const migration of migrations) await reserved.unsafe(await readFile(sojaMigrationSource(migration), 'utf8'));
  } finally {
    reserved.release();
  }

  await fails(summary(outsider), '42501');
  await fails(summary(manager, 1999), '22023', 'SOJA_STORE_FINANCE_INVALID_YEAR');
  await fails(as(member, (tx) => tx`SELECT * FROM soja_store_private.finance_obligations`), '42501');
  assert.equal((await summary(member)).approved_cents, null);

  const budget = { year: 2026, category: 'Compras', approved_cents: 8000, reference: 'Ata da comissão' };
  const firstBudget = await change('save_budget', null, budget);
  await fails(change('save_budget', null, { ...budget, category: 'compras' }), 'PT409', 'SOJA_STORE_FINANCE_DUPLICATE_BUDGET');
  const revised = await change('save_budget', 1, { ...budget, id: firstBudget.id, approved_cents: 10000, reference: 'Revisão aprovada' });
  assert.equal(revised.version, 2);
  await fails(change('save_budget', 1, { ...budget, id: firstBudget.id }), 'PT409', 'SOJA_STORE_STALE_VERSION');

  const [supplier, location, purchase] = Array.from({ length: 3 }, randomUUID);
  await sql`
    INSERT INTO soja_store_private.suppliers (id, org_id, commission_id, name, kind, status, created_by, updated_by)
    VALUES (${supplier}, ${org}, ${unit}, 'Fornecedor teste', 'company', 'active', ${manager}, ${manager})
  `;
  await sql`
    INSERT INTO soja_store_private.locations (id, org_id, commission_id, name, kind, status, created_by, updated_by)
    VALUES (${location}, ${org}, ${unit}, 'Local teste', 'warehouse', 'active', ${manager}, ${manager})
  `;
  await sql`
    INSERT INTO soja_store_private.purchases (id, org_id, commission_id, supplier_id, location_id, supplier_name,
      location_name, ordered_on, freight_cents, charges_cents, total_cents, created_by, updated_by)
    VALUES (${purchase}, ${org}, ${unit}, ${supplier}, ${location}, 'Fornecedor teste', 'Local teste',
      '2026-01-01', 0, 0, 5000, ${manager}, ${manager})
  `;
  const before = await summary();
  assert.equal(before.committed_cents, '5000');
  assert.equal(before.realized_cents, '0');
  assert.equal(before.available_cents, '5000');
  const options = await as(member, async (tx) => (await tx`
    SELECT public.soja_store_finance_purchase_options(${org}, ${unit}, 2026, 'fornecedor') AS result
  `)[0].result);
  assert.equal(options[0].id, purchase);
  const payload = { purchase_id: purchase, occurred_on: '2026-01-01', due_on: '2026-01-03', amount_cents: 1, reference: 'Nota de fornecedor' };
  const recognized = await recognize(payload);
  assert.equal(recognized.amount_cents, 5000);
  await fails(recognize(payload), 'PT409', 'SOJA_STORE_FINANCE_PURCHASE_RECOGNIZED');
  const after = await summary();
  assert.equal(after.committed_cents, '0');
  assert.equal(after.realized_cents, '5000');
  assert.equal(after.available_cents, '5000');
  assert.equal(after.budgets[0].available_cents, '5000');
  assert.equal((await sql`SELECT count(*)::int AS count FROM soja_store_private.stock_movements`)[0].count, 0);
  console.log('PASS scoped authorization, versioned budget, authoritative purchase recognition and no duplicate commitments');

  const settle = { obligation_id: recognized.id, occurred_on: '2026-01-02', amount_cents: 3000, method: 'pix', reference: 'Comprovante A' };
  const key = randomUUID();
  const [paid, retry] = await Promise.all([
    change('settle_obligation', 1, settle, key),
    change('settle_obligation', 1, settle, key),
  ]);
  assert.deepEqual(retry, paid);
  assert.equal(paid.remaining_cents, 2000);
  await fails(change('settle_obligation', 2, { ...settle, amount_cents: 2001 }), 'PT409', 'SOJA_STORE_FINANCE_SETTLEMENT_LIMIT');
  const reverse = { obligation_id: recognized.id, settlement_id: paid.settlement_id, occurred_on: '2026-01-03', reference: 'Correção de baixa' };
  const reversal = await change('reverse_settlement', 2, reverse);
  assert.equal(reversal.remaining_cents, 5000);
  await fails(change('reverse_settlement', 3, reverse), 'PT409');
  const race = await Promise.allSettled([
    change('settle_obligation', 3, { ...settle, amount_cents: 3000 }),
    change('settle_obligation', 3, { ...settle, amount_cents: 3000 }),
  ]);
  assert.equal(race.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(race.find((item) => item.status === 'rejected').reason.message, 'SOJA_STORE_STALE_VERSION');
  const ledger = await as(member, async (tx) => (await tx`
    SELECT public.soja_store_finance_settlements(${org}, ${unit}, ${recognized.id}) AS result
  `)[0].result);
  assert.equal(ledger.total, 3);
  assert.equal(ledger.items.find((item) => item.id === paid.settlement_id).can_reverse, false);
  assert.equal((await summary()).paid_cents, '3000');
  assert.equal((await summary()).payable_remaining_cents, '2000');
  await fails(sql`UPDATE soja_store_private.finance_settlements SET method = 'other' WHERE id = ${paid.settlement_id}`, '55000', 'SOJA_STORE_FINANCE_HISTORY_IMMUTABLE');
  console.log('PASS partial payments, idempotent retry, concurrent version locking, immutable reversals and precise totals');

  const operation = randomUUID();
  const sale = await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claim.sub', ${manager}, true)`;
    return (await tx`
      SELECT soja_store_private.recognize_sale_obligation(${org}, ${unit}, ${operation}, 'Venda ao balcão',
        '2026-01-01', '2026-01-01', 1000, 'Operação no balcão') AS id
    `)[0].id;
  });
  await fails(change('settle_obligation', 1, { ...settle, obligation_id: sale, amount_cents: 1000 }), '42501', 'SOJA_STORE_FINANCE_USE_SALE_ORIGIN');
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claim.sub', ${manager}, true)`;
    await tx`SELECT soja_store_private.record_sale_payment(${org}, ${unit}, ${operation}, ${randomUUID()}, '2026-01-01', 1000, 'cash', 'Operação no balcão')`;
    await tx`SELECT soja_store_private.record_sale_payment(${org}, ${unit}, ${operation}, ${randomUUID()}, '2026-01-02', -400, 'cash', 'Retorno parcial')`;
    await tx`SELECT soja_store_private.adjust_sale_obligation(${org}, ${unit}, ${operation}, -400)`;
  });
  const saleEntry = (await entries('receivable', 'settled', 1)).items[0];
  assert.equal(saleEntry.original_cents, '1000');
  assert.equal(saleEntry.amount_cents, '600');
  assert.equal(saleEntry.settled_cents, '600');
  assert.equal((await summary()).received_cents, '600');
  assert.equal((await summary()).recognized_receivable_cents, '600');
  assert.equal((await entries(null, null, 1)).total, 2);
  console.log('PASS sales-origin linkage, manual-settlement denial, refund adjustments and unpaginated aggregation');

  const oldPurchase = randomUUID();
  await sql`
    INSERT INTO soja_store_private.purchases (id, org_id, commission_id, supplier_id, location_id, supplier_name,
      location_name, ordered_on, freight_cents, charges_cents, total_cents, created_by, updated_by)
    VALUES (${oldPurchase}, ${org}, ${unit}, ${supplier}, ${location}, 'Fornecedor teste', 'Local teste',
      '2025-12-31', 0, 0, 500, ${manager}, ${manager})
  `;
  const pending = await as(manager, async (tx) => (await tx`
    SELECT public.soja_store_finance_purchase_options(${org}, ${unit}, 2026) AS result
  `)[0].result);
  assert.ok(pending.some((item) => item.id === oldPurchase));
  await fails(recognize({ ...payload, purchase_id: oldPurchase, occurred_on: '2025-12-30' }), '22023', 'SOJA_STORE_FINANCE_PURCHASE_PERIOD');
  await recognize({ ...payload, purchase_id: oldPurchase });
  assert.equal((await summary(manager, 2025)).committed_cents, '500');
  assert.equal((await summary(manager, 2025)).realized_cents, '0');
  assert.equal((await summary()).realized_cents, '5500');
  console.log('PASS recognition in a later civil year preserves original commitment and shows realized amount in the correct year');
} finally {
  await sql.end();
  await admin`DROP DATABASE ${admin(database)}`;
  await admin.end();
}
