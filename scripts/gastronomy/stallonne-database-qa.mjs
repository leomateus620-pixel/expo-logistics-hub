import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const project = '0538d132-34dd-4347-a33c-526edac7339c';
const org = '00000000-0000-4000-a000-000000000001';
const edition = '00000000-0000-4000-a000-000000002028';
const seller = '00000000-0000-4000-a000-000000000010';
const salesOnly = '00000000-0000-4000-a000-000000000014';
const token = 'qa-public-map-package-user-token';
const array = (ids) => `{${ids.join(',')}}`;
const as = (db, user, operation, role = 'authenticated') => db.begin(async (tx) => {
  await tx.unsafe(`SET LOCAL ROLE ${role}; SET LOCAL "request.jwt.claim.sub" = '${user}'`);
  return operation(tx);
});
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');

function register(db, key, totals, overrides = {}) {
  const subtotal = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  const { fee = 0, plan = [{ due_date: '2027-01-23', amount: subtotal + fee }] } = overrides;
  return as(db, seller, async (tx) => (await tx.unsafe(`
    SELECT public.register_commercial_sale_order_checked($1,$2,$3,'SEGUNDA_ETAPA',$4::uuid[],$5::jsonb,
      'Comprador sintético',NULL,NULL,NULL,$6,$7,$8,NULL,$9::jsonb,$10,NULL,NULL,$11,0,0,NULL) id
  `, [project, seller, key, array(Object.keys(totals)), JSON.stringify(totals),
    plan.length === 1 ? 'CASH' : 'INSTALLMENTS', plan.length,
    plan.length === 1 ? 'PIX' : 'BOLETO_PARCELADO', JSON.stringify(plan), subtotal + fee, fee]))[0].id);
}

export async function verifyStallonneDatabase(db, { history = false } = {}) {
  const fixture = await db.unsafe(`SELECT 1 FROM map_projects WHERE id=$1 AND org_id=$2 AND name='Fenasoja 2028 QA'`, [project,org]);
  assert.equal(fixture.length,1,'É necessário o projeto sintético descartável de QA.');
  const children = () => db.unsafe(`SELECT l.id,l.entity_id,l.status,e.metadata->'gastronomyMarkerPosition' position
    FROM commercial_lots l JOIN map_entities e ON e.id=l.entity_id
    WHERE l.public_identifier IN ('GAST-J-01','GAST-J-02','GAST-J-03') ORDER BY l.public_identifier`);
  const [anchor] = await db.unsafe("SELECT map_entities.id,geometry FROM map_entities JOIN map_entity_geometries USING (project_id) WHERE map_entities.id=entity_id AND public_identifier='J' AND is_current");
  const original = await children();
  assert.equal(original.length, 3);

  let prior;
  let reused;
  if (history) {
    [{ id: reused }] = await db.unsafe(`INSERT INTO commercial_lots(project_id,entity_id,public_identifier,display_name)
      VALUES($1,$2,'J','Parque de Diversões') RETURNING id`, [project, anchor.id]);
    prior = await register(db, 'qa-stallonne-predecessor', Object.fromEntries(original.map(({ id }, i) => [id, [19040, 22560, 10680][i]])));
    const priorItems = await db.unsafe("SELECT id FROM lot_sale_order_items WHERE order_id=$1", [prior]);
    await as(db, seller, (tx) => tx.unsafe("SELECT public.confirm_sale_order_items($1,$2::uuid[])",
      [prior,array(priorItems.map(({ id }) => id))]));
  }

  await db.unsafe(await migration('20261127150000_commercial_stallonne_package'));
  await db.unsafe(await migration('20261127151000_financial_stallonne_package'));
  const [main] = await db.unsafe(`SELECT l.id,l.entity_id,l.status,l.commercial_package_reconciliation_pending,
      p.renovacao_total::float8,p.segunda_total::float8
    FROM commercial_lots l JOIN commercial_lot_pricing_2028 p ON p.lot_id=l.id WHERE l.commercial_package_role='PRINCIPAL'`);
  assert.equal(main.entity_id, anchor.id);
  assert.deepEqual([main.renovacao_total, main.segunda_total], [252280, 252280]);
  await assert.rejects(db.unsafe(`UPDATE lot_prices SET base_price=1 WHERE lot_id=$1 AND is_active`, [main.id]), /USE_COMMERCIAL_PACKAGE_CHECKOUT/);
  const identity = ({ id, entity_id, position }) => ({ id, entity_id, position });
  assert.deepEqual((await children()).map(identity), original.map(identity));
  assert.deepEqual((await db.unsafe(`SELECT geometry FROM map_entity_geometries WHERE entity_id=$1 AND is_current`, [anchor.id]))[0].geometry, anchor.geometry);
  const [inventory] = await db.unsafe(`SELECT public._financial_scenario_food_inventory($1) inventory`, [project]);
  assert.equal(inventory.inventory.packageUnits, 1);
  const [classification] = await db.unsafe(`SELECT category FROM public._financial_scenario_lots($1) WHERE lot_id=$2`, [project, main.id]);
  assert.equal(classification.category, 'food_points');

  const confirmedFood = () => db.unsafe(`SELECT coalesce(sum(principal),0)::float8 cents FROM public._financial_scenario_commercial($1)
    WHERE stage='confirmed' AND category='food_points'`, [project]);
  if (history) {
    assert.equal(main.id, reused);
    assert.equal(main.status, 'BLOCKED');
    assert.equal(main.commercial_package_reconciliation_pending, true);
    const [order] = await db.unsafe(`SELECT negotiated_total::float8,status FROM lot_sale_orders WHERE id=$1`, [prior]);
    assert.deepEqual(order, { negotiated_total: 52280, status: 'CONFIRMED' });
    assert.equal((await confirmedFood())[0].cents,5228000);
    const [installment] = await db.unsafe(`SELECT id FROM lot_sale_installments WHERE order_id=$1`, [prior]);
    await assert.rejects(register(db, 'qa-stallonne-overlap', { [main.id]:252280 }), /LOT_NOT_SELLABLE/);
    await assert.rejects(db.unsafe(`UPDATE lot_sale_installments SET amount=1 WHERE id=$1`, [installment.id]), /COMMERCIAL_PACKAGE_COMPONENT_INSTALLMENTS/);
    await assert.rejects(db.unsafe(`INSERT INTO financial_obligations(source_type,source_id) VALUES('parcela_comercial',$1)`, [installment.id]), /COMMERCIAL_PACKAGE_COMPONENT_RECEIVABLE/);
    await db.unsafe(`UPDATE lot_sale_installments SET payment_status='PAID',paid_at=now() WHERE id=$1`, [installment.id]);
    await assert.rejects(as(db, seller, (tx) => tx.unsafe(
      "SELECT public.attach_order_contract($1,$2::uuid[],'x','x','application/pdf',1)", [prior,array([original[0].id])]
    )), /COMMERCIAL_PACKAGE_COMPONENT/);
    console.log('Conciliação: unidade existente e histórico preservados, concorrência e recebível avulso bloqueados.');
    return;
  }

  const health = (await db.unsafe(`SELECT public.map_segment_is_complete(id) complete FROM map_segments WHERE slug='gastronomia'`))[0];
  assert.equal(health.complete, true);
  assert.equal(main.status, 'AVAILABLE');
  const [balloon] = await db.unsafe(`SELECT id FROM commercial_lots WHERE public_identifier='GAST-D1-03'`);
  await assert.rejects(register(db, 'qa-stallonne-forbidden-child', { [original[0].id]:19040 }), /LOT_NOT_SELLABLE/);
  await assert.rejects(register(db, 'qa-stallonne-forbidden-fee', { [main.id]:252280 }, { fee:1 }), /COMMERCIAL_PACKAGE_NO_EXTRA_FEES/);
  await assert.rejects(register(db, 'qa-stallonne-forbidden-mixed', { [main.id]:252280, [balloon.id]:2815 }), /COMMERCIAL_PACKAGE_EXCLUSIVE_CHECKOUT/);
  await assert.rejects(db.unsafe(`INSERT INTO lot_reservations(lot_id,company_name,contact_name,expires_at,responsible_user_id)
    VALUES($1,'QA','QA',now()+interval '1 day',$2)`, [original[0].id,seller]), /USE_COMMERCIAL_PACKAGE_CHECKOUT/);
  await assert.rejects(db.unsafe(`INSERT INTO lot_negotiations(lot_id,company_name,responsible_user_id)
    VALUES($1,'QA',$2)`, [original[0].id,seller]), /USE_COMMERCIAL_PACKAGE_CHECKOUT/);
  await register(db, 'qa-stallonne-balloon', { [balloon.id]:2815 });

  const plan = Array.from({ length:17 }, (_, i) => ({
    due_date: new Date(Date.UTC(2027, i, 23)).toISOString().slice(0,10),
    amount: i < 16 ? 1000 : 236280
  }));
  const key = 'qa-stallonne-one-order';
  const order = await register(db, key, { [main.id]:252280 }, { plan });
  assert.equal(await register(db, key, { [main.id]:252280 }, { plan }), order);
  const [recovered] = await as(db, seller, (tx) => tx.unsafe(
    "SELECT public.get_commercial_sale_attempt($1,$2,'SEGUNDA_ETAPA',$3::uuid[]) attempt", [project,key,array([main.id])]
  ));
  assert.equal(recovered.attempt.orderId, order);
  const rows = await db.unsafe("SELECT id,contract_state FROM lot_sale_order_items WHERE order_id=$1", [order]);
  assert.equal(rows.length, 1);
  const [item] = rows;
  assert.equal(item.contract_state, 'PENDING_SIGNATURE');
  const due = await db.unsafe(`SELECT due_date::text,amount::float8 FROM lot_sale_installments WHERE order_id=$1 ORDER BY installment_number`, [order]);
  assert.deepEqual(Array.from(due), plan);
  assert.equal((await db.unsafe("SELECT component_lot_id FROM commercial_package_order_components WHERE order_item_id=$1", [item.id])).length,3);
  const confirm = () => as(db, seller, async (tx) => (await tx.unsafe(
    "SELECT public.confirm_sale_order_items($1,$2::uuid[]) result", [order,array([item.id])]
  ))[0].result);
  await assert.rejects(confirm(), /COMMERCIAL_PACKAGE_CONTRACT_REQUIRED/);

  const path = `${org}/orders/${order}/qa.pdf`;
  await as(db, seller, (tx) => tx.unsafe("INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('map-contracts',$1,$2)", [path,seller]));
  const attach = (user) => as(db, user, async (tx) => (await tx.unsafe(
    "SELECT public.attach_order_contract($1,$2::uuid[],$3,'qa.pdf','application/pdf',120) contract", [order,array([main.id]),path]
  ))[0].contract);
  await assert.rejects(attach(salesOnly), /MAP_PERMISSION_DENIED/);
  const contract = await attach(seller);
  assert.deepEqual(await attach(seller), contract);
  const covered = await db.unsafe("SELECT lot_id FROM lot_contract_lots WHERE contract_id=$1 AND removed_at IS NULL", [contract.contractId]);
  assert.deepEqual(new Set(covered.map(({ lot_id }) => lot_id)), new Set([main.id,...original.map(({id})=>id)]));
  assert.equal((await confirm()).confirmed,1);
  assert.equal((await confirm()).skipped,1);
  assert.equal((await confirmedFood())[0].cents,25228000);
  const [cash] = await as(db, seller, (tx) => tx.unsafe(`SELECT financial_scenario_overview($1,$2,'cash')
    ->'currentByCategory'->'food_points'->>'amountCents' cents`, [org,edition]));
  assert.equal(Number(cash.cents),0);
  const [counts] = await db.unsafe(`SELECT
    (SELECT count(*)::int FROM lot_sale_orders WHERE idempotency_key=$2) orders,
    (SELECT count(*)::int FROM lot_contracts WHERE order_id=$1 AND is_active) contracts`, [order,key]);
  assert.deepEqual(counts,{ orders:1, contracts:1 });
  const files = (user) => as(db, user, (tx) => tx.unsafe("SELECT name FROM storage.objects WHERE name=$1",[path]));
  assert.equal((await files(seller)).length,1);
  assert.equal((await files(salesOnly)).length,0);

  await db.unsafe(`INSERT INTO public_map_links(org_id,project_id,slug,token_hash,display_name,scope_kind,scope_key)
    VALUES($1,$2,'qa-stallonne',encode(extensions.digest($3,'sha256'),'hex'),'QA','SEGMENT','gastronomia')`, [org,project,token]);
  const [publicScope] = await as(db, '', (tx) => tx.unsafe("SELECT public.public_map_inventory('qa-stallonne',$1) inventory", [token]), 'anon');
  const packaged = publicScope.inventory.lots.filter(({packageRole}) => packageRole);
  assert.equal(packaged.length,4);
  for (const lot of packaged) {
    assert.equal(lot.availability,'SOLD');
    assert.equal(lot.buyerName,null);
    assert.equal(lot.buyerTradeName,null);
    assert.deepEqual(lot.pricing,{ resolutionStatus:'SEM_REGRA' });
  }
  await assert.rejects(as(db,'',(tx)=>tx.unsafe("SELECT public.public_map_inventory('qa-stallonne',repeat('x',32))"),'anon'), /PUBLIC_MAP_LINK_INVALID/);

  const [planLine] = await db.unsafe(`SELECT id FROM lot_sale_installments WHERE order_id=$1 LIMIT 1`, [order]);
  await db.unsafe(`INSERT INTO financial_obligations(id,source_type,source_id) VALUES(gen_random_uuid(),'parcela_comercial',$1)`, [planLine.id]);
  await assert.rejects(db.unsafe(`UPDATE lot_sale_orders SET status='REVERTED',reverted_at=now() WHERE id=$1`, [order]), /COMMERCIAL_PACKAGE_RECEIVABLE_EXISTS/);
  console.log('Checkout: plano manual, recuperação, contrato privado, assinatura idempotente, API pública e Financeiro conferidos.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const db = postgres({ host:'127.0.0.1', port:55438, database:'gastronomy_qa',
    username:'postgres', max:1, onnotice:()=>{} });
  try {
    await verifyStallonneDatabase(db, { history:process.argv.includes('--history') });
  } finally {
    await db.end();
  }
}
