import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const socketPath = process.env.SOJA_STORE_TEST_PG_SOCKET;
const port = Number(process.env.SOJA_STORE_TEST_PG_PORT ?? 55442);
if (!socketPath?.startsWith('/') || !Number.isInteger(port)) {
  throw new Error('Set SOJA_STORE_TEST_PG_SOCKET to a disposable PostgreSQL socket directory.');
}
const connection = { host: socketPath, port, username: 'postgres', onnotice: () => {} };
const admin = postgres({ ...connection, database: 'postgres', max: 1 });
const database = 'soja_store_import_test_' + randomUUID().replaceAll('-', '');
await admin`CREATE DATABASE ${admin(database)}`;
const sql = postgres({ ...connection, database, max: 8 });
const [org, commission, manager, reader, unrelated] = Array.from({ length: 5 }, randomUUID);
const as = (actor, fn) => sql.begin(async (tx) => {
  await tx`SET LOCAL ROLE authenticated`;
  await tx`SELECT set_config('request.jwt.claim.sub', ${actor}, true)`;
  return fn(tx);
});
const stage = (actor, payload, request = randomUUID()) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_stage_import(${org}, ${commission}, ${request}, ${tx.json(payload)}) AS result
`)[0].result);
const batches = (actor) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_import_batches(${org}, ${commission}) AS result
`)[0].result);
const preview = (actor, batch, limit = 30, offset = 0) => as(actor, async (tx) => (await tx`
  SELECT public.soja_store_import_preview(${org}, ${commission}, ${batch}, ${limit}, ${offset}) AS result
`)[0].result);
const original = '\uFEFFNome;Código;Quantidade;Custo;Nota\r\n'
  + '"Cuia; ""Azul"""; cuia-azul ;8;R$ 43,00;"uma linha\r\ne outra"\r\n'
  + '=A1+B1;B;;?;registrado como texto\r\n'
  + 'Tábua;C;25+15;1.234;revisar';
const base = {
  file_name: 'Planilha de teste.csv', file_id: 'origem-de-teste', source_version: 'rev-A', as_of: '2025-11-30',
  classification: 'historical', delimiter: ';', sheet: 'Referência', source_text: original,
  mapping: { name: 'nome', sku: 'Código', quantity: 'Quantidade', unit_cost: 'Custo' },
};
const review = (actor, kind, version, payload, request = randomUUID()) => as(actor, async (tx) => (await tx`
  SELECT public.${tx('soja_store_review_import_' + kind)}(${org}, ${commission}, ${request}, ${version}, ${tx.json(payload)}) AS result
`)[0].result);
const fails = (promise, code, message) => assert.rejects(
  promise, (error) => error.code === code && (message === undefined || error.message === message),
);

try {
  await sql.unsafe(await readFile(new URL('./schema-fixture.sql', import.meta.url), 'utf8'));
  const migrationConnection = await sql.reserve();
  try {
    for (const file of ['20261112120000_soja_store_catalog.sql', '20261112120300_soja_store_import_staging.sql']) {
      await migrationConnection.unsafe(await readFile(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8'));
    }
  } finally {
    await migrationConnection.release();
  }

  await sql`INSERT INTO public.organizations VALUES (${org})`;
  await sql`INSERT INTO public.commissions (id, org_id, slug) VALUES (${commission}, ${org}, 'soja-store')`;
  await sql`INSERT INTO soja_store_private.scopes (org_id, commission_id, enabled) VALUES (${org}, ${commission}, true)`;
  for (const [user, capability] of [[manager, 'imports.manage'], [reader, 'imports.view'], [unrelated, 'catalog.view']]) {
    const person = randomUUID();
    await sql`INSERT INTO auth.users VALUES (${user})`;
    await sql`INSERT INTO public.org_members VALUES (${org}, ${user}, 'operador', true)`;
    await sql`INSERT INTO public.commission_people VALUES (${person}, ${org}, ${user})`;
    await sql`INSERT INTO public.commission_responsibles (commission_id, org_id, person_id) VALUES (${commission}, ${org}, ${person})`;
    await sql`
      INSERT INTO soja_store_private.access_grants (org_id, commission_id, person_id, user_id, capability, granted_by)
      VALUES (${org}, ${commission}, ${person}, ${user}, ${capability}, ${manager})
    `;
  }
  assert.deepEqual(await batches(reader), { items: [], total: 0 });
  await fails(stage(reader, base), '42501');
  await fails(batches(unrelated), '42501');
  await fails(as(manager, (tx) => tx`SELECT * FROM soja_store_private.import_batches`), '42501');

  const request = randomUUID();
  const [first, replay] = await Promise.all([stage(manager, base, request), stage(manager, base, request)]);
  assert.deepEqual(first, replay);
  assert.equal(first.row_count, 3);
  assert.equal(first.flagged_count, 2);
  const batch = (await batches(reader)).items[0];
  assert.equal(batch.sha256, createHash('sha256').update(original).digest('hex'));
  assert.equal(batch.as_of, '2025-11-30');
  assert.equal(batch.file_id, base.file_id);
  assert.ok(!Object.hasOwn(batch, 'source_text'));
  assert.equal((await sql`SELECT source_text FROM soja_store_private.import_batches`)[0].source_text, original);

  const read = await preview(reader, first.id, 2);
  assert.equal(read.total, 3);
  assert.deepEqual(read.items[0], {
    source_row: 2,
    original: { Nome: 'Cuia; "Azul"', Código: ' cuia-azul ', Quantidade: '8', Custo: 'R$ 43,00', Nota: 'uma linha\r\ne outra' },
    normalized: { name: 'Cuia; "Azul"', sku: 'CUIA-AZUL', quantity: '8', unit_cost: '43.00' },
    warnings: [],
    review: null,
  });
  assert.equal(read.items[1].source_row, 4);
  assert.equal(read.items[1].normalized.name, null);
  assert.equal(read.items[1].normalized.quantity, null);
  assert.equal(read.items[1].original.Nome, '=A1+B1');
  assert.deepEqual(read.items[1].warnings, ['name:formula', 'quantity:missing', 'unit_cost:ambiguous_number']);
  assert.equal((await preview(reader, first.id, 2, 2)).items[0].source_row, 5);
  await fails(preview(unrelated, first.id), '42501');
  console.log('PASS origin, original bytes, physical row positions, staged normalization and permissions');

  await fails(stage(manager, { ...base, file_id: 'other', source_version: 'rev-C' }), 'PT409', 'SOJA_STORE_IMPORT_DUPLICATE_CONTENT');
  await fails(stage(manager, { ...base, source_text: original + '\nExtra;X;0;0;' }), 'PT409', 'SOJA_STORE_IMPORT_DUPLICATE_VERSION');
  await fails(stage(manager, { ...base, source_version: 'rev-B' }, request), 'PT409', 'SOJA_STORE_REQUEST_CONFLICT');
  await fails(stage(manager, { ...base, file_id: 'invalid', source_text: 'Nome;Código\n"aspas' }), '22023', 'SOJA_STORE_IMPORT_INVALID_CSV');
  await fails(stage(manager, { ...base, file_id: 'invalid', source_text: 'Nome;Nome\nX;Y' }), '22023', 'SOJA_STORE_IMPORT_INVALID_HEADERS');
  assert.equal((await batches(reader)).total, 1);
  assert.equal((await sql`SELECT count(*)::integer AS total FROM soja_store_private.products`)[0].total, 0);
  console.log('PASS deduplication, concurrent retry, malformed file rollback and staging separation');

  const batchReview = { batch_id: first.id, action: 'finish', reason: 'Conferência dos valores' };
  const lineReview = { batch_id: first.id, source_row: 4, status: 'checked',
    reason: 'Quantidade conferida e custo desconhecido', values: { name: 'Cuia', quantity: '3,50', unit_cost: null } };
  await fails(review(reader, 'line', 0, lineReview), '42501');
  await fails(review(manager, 'batch', 1, batchReview), 'PT409', 'SOJA_STORE_IMPORT_REVIEW_STATE');
  await fails(review(manager, 'line', 0, { ...lineReview, values: { quantity: '=A1' } }), '22023', 'SOJA_STORE_IMPORT_INVALID_REVIEW_VALUE');
  const concurrentReview = await Promise.allSettled([
    review(manager, 'line', 0, lineReview),
    review(manager, 'line', 0, lineReview),
  ]);
  assert.equal(concurrentReview.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(concurrentReview.find((r) => r.status === 'rejected').reason.message, 'SOJA_STORE_STALE_VERSION');
  const checked = (await preview(reader, first.id)).items.find((line) => line.source_row === 4);
  assert.equal(checked.original.Nome, '=A1+B1');
  assert.equal(checked.normalized.name, null);
  assert.equal(checked.review.values.name, 'Cuia');
  assert.equal(checked.review.values.quantity, '3.50');
  assert.equal(checked.review.values.unit_cost, null);
  assert.equal((await batches(reader)).items[0].pending_count, 1);
  await review(manager, 'line', 0, { ...lineReview, source_row: 5, reason: 'Conferido com a planilha de origem', values: { quantity: '40', unit_cost: '12,34' } });
  assert.equal((await batches(reader)).items[0].pending_count, 0);
  await fails(review(manager, 'batch', 2, batchReview), 'PT409', 'SOJA_STORE_STALE_VERSION');
  const finished = await review(manager, 'batch', 3, batchReview);
  assert.equal(finished.status, 'reviewed');
  await fails(review(manager, 'line', 1, lineReview), 'PT409', 'SOJA_STORE_IMPORT_REOPEN_REQUIRED');
  const reopened = await review(manager, 'batch', 4, { ...batchReview, action: 'reopen', reason: 'Nova dúvida na linha inicial' });
  assert.equal(reopened.status, 'in_review');
  await review(manager, 'line', 0, { ...lineReview, source_row: 2, status: 'pending', values: {}, reason: 'Peso ainda não confirmado' });
  assert.equal((await batches(reader)).items[0].pending_count, 1);
  assert.equal((await sql`SELECT count(*)::integer AS total FROM soja_store_private.import_line_reviews`)[0].total, 3);
  assert.equal((await sql`SELECT count(*)::integer AS total FROM soja_store_private.products`)[0].total, 0);
  console.log('PASS manual correction, original and normalized preservation, batch completion, reopen, and review conflicts');
} finally {
  await sql.end();
  await admin`DROP DATABASE ${admin(database)}`;
  await admin.end();
}
