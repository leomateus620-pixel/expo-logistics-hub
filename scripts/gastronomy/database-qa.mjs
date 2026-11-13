// Run only against a disposable, migrated local Fenasoja map with synthetic
// project members. The fixture is expected to have the official anchor codes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import postgres from 'postgres';

const project = '0538d132-34dd-4347-a33c-526edac7339c';
const org = '00000000-0000-4000-a000-000000000001';
const seller = '00000000-0000-4000-a000-000000000010';
const gastronomyMember = '00000000-0000-4000-a000-000000000011';
const mapViewer = '00000000-0000-4000-a000-000000000012';
const ruralMember = '00000000-0000-4000-a000-000000000013';
const sellerWithoutContracts = '00000000-0000-4000-a000-000000000014';
const contractsOnly = '00000000-0000-4000-a000-000000000015';
const db = postgres({ host: '127.0.0.1', port: 55438, database: 'gastronomy_qa', user: 'postgres', max: 6, onnotice: () => {} });
const migration = await fs.readFile(new URL('../../supabase/migrations/20261111190000_commercial_gastronomy.sql', import.meta.url), 'utf8');
const contractMigration = await fs.readFile(new URL('../../supabase/migrations/20261112190000_commercial_contract_history.sql', import.meta.url), 'utf8');
const asUser = (user, operation) => db.begin(async (tx) => {
  await tx.unsafe('SET LOCAL ROLE authenticated');
  await tx`SELECT set_config('request.jwt.claim.sub',${user},true)`;
  return operation(tx);
});
const split = (total, count) => Array.from({length: count}, (_, index) => ({
  due_date: new Date(Date.UTC(2026, 11 + index, 5)).toISOString().slice(0, 10),
  amount: (Math.floor(total / count) + (index < total % count ? 1 : 0)) / 100,
}));
const runSale = (key, ids, total, { method = 'PIX', count = 1, stage = 'RENOVACAO', fee = 0, user = seller } = {}) =>
  asUser(user, async (tx) => (await tx`
    SELECT public.register_commercial_sale_order(${'qa-gastronomy-' + key},${stage},${tx.array(ids)}::uuid[],
      'Expositor de teste',NULL,NULL,NULL,NULL,${count},${method},NULL,
      ${tx.json(split(total, count))},${total / 100},NULL,NULL,${fee},0,0,NULL) AS id
  `)[0].id);
const detail = (id) => asUser(seller, async (tx) => (await tx`SELECT get_commercial_sale_order_detail(${id},NULL) AS result`)[0].result);
const cancel = (order, items) => asUser(seller, (tx) => tx`SELECT cancel_sale_order_items(${order},${tx.array(items)}::uuid[],'QA')`);
const confirm = (order, items) => asUser(seller, (tx) => tx`SELECT confirm_sale_order_items(${order},${tx.array(items)}::uuid[])`);
const getItems = (id) => db`SELECT * FROM lot_sale_order_items WHERE order_id=${id} ORDER BY public_identifier`;
const getStatus = async (id) => (await db`SELECT status FROM commercial_lots WHERE id=${id}`)[0].status;
const pointHistory = (lot, user = seller) => asUser(user, async (tx) => (await tx`SELECT get_lot_contract_history(${lot}) AS result`)[0].result);

try {
  assert.ok((await db`SELECT 1 FROM map_projects WHERE id=${project} AND org_id=${org}`).length, 'Disposable QA project required');
  const inventory = await db`
    SELECT l.id,l.public_identifier,l.status,l.price_source,l.food_type,l.unit_quantity,l.official_area_sqm,
      e.parent_entity_id,a.public_identifier AS anchor,p.renovacao_total,p.segunda_total,
      p.renovacao_price_per_sqm,p.segunda_price_per_sqm,q.is_sellable
    FROM commercial_lots l JOIN map_entities e ON e.id=l.entity_id JOIN map_entities a ON a.id=e.parent_entity_id
    JOIN commercial_lot_pricing_2028 p ON p.lot_id=l.id JOIN commercial_sale_eligibility q ON q.lot_id=l.id
    WHERE l.commercial_unit='FOOD_POINT' AND l.project_id=${project} ORDER BY l.public_identifier
  `;
  assert.deepEqual(inventory.map((row) => [row.public_identifier,row.anchor,row.price_source.cell,Number(row.renovacao_total)]), [
    ['GAST-C1-01','C1','J3',85107], ['GAST-C2-01','C2','J4',50107], ['GAST-C2-02','C2','J5',32357], ['GAST-C4-01','C4','J33',17500],
    ['GAST-D1-01','D1','J7',33000], ['GAST-D1-02','D1','J8',33000],
    ['GAST-D3-01','D3','J26',22780], ['GAST-D3-02','D3','J27',22780], ['GAST-D3-03','D3','J28',22780],
    ['GAST-D3-04','D3','J29',22780], ['GAST-D3-05','D3','J30',19150], ['GAST-D4-01','D4','J9',25200],
  ]);
  assert.equal(new Set(inventory.map((row) => row.parent_entity_id)).size, 6);
  assert.equal(inventory.reduce((sum, row) => sum + Number(row.renovacao_total), 0), 386541);
  assert.ok(inventory.every((row) => row.status === 'AVAILABLE' && row.is_sellable && row.unit_quantity === 1
    && row.official_area_sqm === null && row.renovacao_price_per_sqm === null && row.segunda_price_per_sqm === null
    && row.renovacao_total === row.segunda_total));
  assert.deepEqual(inventory.filter((row) => row.anchor === 'D1').map((row) => row.price_source.originalNumber), [2, 3]);
  assert.ok(inventory.filter((row) => row.anchor === 'D3').every((row) => row.food_type === null));
  assert.equal((await db`SELECT count(*)::int AS n FROM lot_sales s JOIN commercial_lots l ON l.id=s.lot_id WHERE l.commercial_unit='FOOD_POINT'`)[0].n, 0);
  assert.equal((await db`SELECT count(*)::int AS n FROM map_entity_geometries g JOIN map_entities e ON e.id=g.entity_id WHERE e.classification='FOOD_POINT'`)[0].n, 0);
  const segmentId = (await db`SELECT id FROM map_segments WHERE slug='gastronomia'`)[0].id;
  assert.equal((await db`SELECT map_segment_is_complete(${segmentId}) AS valid`)[0].valid, true);

  const id = (code) => inventory.find((row) => row.public_identifier === code).id;
  const central = id('GAST-C2-01'), pizza = id('GAST-C2-02');
  const visible = (user) => asUser(user, async (tx) => {
    const rows = await tx`SELECT commercial_unit,count(*)::int AS n FROM commercial_lot_pricing_2028 GROUP BY commercial_unit ORDER BY commercial_unit`;
    return rows.map((row) => [row.commercial_unit, row.n]);
  });
  assert.deepEqual(await visible(gastronomyMember), [['FOOD_POINT',12]]);
  assert.deepEqual(await visible(ruralMember), [['SQUARE_METER',1]]);
  assert.deepEqual(await visible(mapViewer), [['FOOD_POINT',12],['SQUARE_METER',4]]);
  const visibleAnchors = await asUser(gastronomyMember, (tx) => tx`
    SELECT e.public_identifier FROM map_entities e JOIN map_entity_geometries g ON g.entity_id=e.id
    WHERE e.project_id=${project} AND g.is_current ORDER BY e.public_identifier
  `);
  assert.deepEqual(visibleAnchors.map((row) => row.public_identifier), ['C1','C2','C4','D1','D3','D4']);
  await assert.rejects(runSale('forbidden',[central],5010700,{user:mapViewer}), /MAP_PERMISSION_DENIED/);
  await assert.rejects(runSale('no-write',[central],5010700,{user:gastronomyMember}), /MAP_PERMISSION_DENIED/);

  await assert.rejects(runSale('tampered',[central,pizza],8246401), /TOTAL_MISMATCH/);
  assert.equal(await getStatus(central),'AVAILABLE');
  assert.equal(await getStatus(pizza),'AVAILABLE');
  assert.equal((await db`SELECT count(*)::int AS n FROM lot_sale_orders WHERE idempotency_key='qa-gastronomy-tampered'`)[0].n,0);

  const order = await runSale('restaurant',[central,pizza],8246400,{method:'BOLETO_PARCELADO',count:17,stage:'SEGUNDA_ETAPA'});
  assert.equal(await runSale('restaurant',[central,pizza],8246400,{method:'BOLETO_PARCELADO',count:17,stage:'SEGUNDA_ETAPA'}),order);
  await assert.rejects(runSale('restaurant',[central,pizza],8246400,{user:mapViewer}), /MAP_PERMISSION_DENIED/);
  const [centralItem,pizzaItem] = await getItems(order);
  assert.equal(centralItem.contract_state,'PENDING_SIGNATURE');
  assert.equal(centralItem.structure_identifier_snapshot,'C2');
  assert.equal(pizzaItem.structure_name_snapshot,'Restaurante');
  assert.equal(centralItem.official_area_snapshot,null);
  assert.equal(centralItem.price_per_sqm_snapshot,null);
  assert.equal(Number(centralItem.item_total) + Number(pizzaItem.item_total),82464);
  assert.equal(await getStatus(pizza),'SALE_OPEN');
  assert.equal(await getStatus(central),'SALE_OPEN');
  const first = await detail(order);
  assert.equal(first.installments.length,17);
  assert.equal(first.installments[0].dueDate,'2026-12-05');
  assert.equal(first.installments[16].dueDate,'2028-04-05');
  assert.equal(first.installments.reduce((sum, row) => sum+Math.round(row.amount*100),0),8246400);
  assert.equal(first.header.feesTotal,0);

  const docPath = org + '/orders/' + order + '/qa.pdf';
  const pointDocPath = org + '/' + pizza + '/pizza.pdf';
  const pointReplacement = org + '/' + pizza + '/pizza-v2.pdf';
  const sharedReplacement = org + '/orders/' + order + '/qa-v2.pdf';
  const rejectedReplacement = org + '/' + pizza + '/rejected.pdf';
  await db`INSERT INTO user_capabilities VALUES (${contractsOnly},${org},'map.manage_contracts')`;
  await db`INSERT INTO storage.objects (bucket_id,name,owner_id)
    SELECT 'map-contracts', p, ${seller} FROM unnest(${db.array([docPath,pointDocPath,pointReplacement,sharedReplacement,rejectedReplacement])}::text[]) p`;
  await asUser(seller, (tx) => tx`SELECT attach_order_contract(${order},${tx.array([central,pizza])}::uuid[],${docPath},'qa.pdf','application/pdf',1024,'C2-TEST')`);
  await assert.rejects(asUser(seller, (tx) => tx`SELECT register_lot_contract_version(${pizza},${pointDocPath},'pizza.pdf','application/pdf',1024,'C2-PIZZA',${centralItem.sale_id})`), /SALE_CHANGED/);
  await assert.rejects(asUser(seller, (tx) => tx`SELECT register_lot_contract_version(${pizza},${pointDocPath},'pizza.pdf','application/pdf',1024,'C2-PIZZA',${pizzaItem.sale_id})`), /SALE_NOT_SIGNED/);
  const attached = await detail(order);
  assert.equal(attached.contracts.length,1);
  assert.equal(attached.contracts.find((row) => row.scope === 'ORDER_ITEMS').lotIds.length,2);
  assert.equal((await pointHistory(pizza)).canUpload,false);
  assert.equal(await getStatus(central),'SALE_OPEN');
  const exported = (await asUser(seller, (tx) => tx`SELECT export_commercial_sale_orders(${project},p_segment_slug=>'gastronomia') AS result`))[0].result.rows;
  assert.equal(exported.length,1);
  assert.equal(exported[0].value,82464);
  assert.equal(exported[0].documents.length,1);
  assert.deepEqual(exported[0].locations, [{location:'Gastronomia · Restaurante · C2', lots:['Pizzaria (1 ponto de alimentação)','Restaurante Central (1 ponto de alimentação)']}]);
  const restrictedList = await asUser(sellerWithoutContracts, async (tx) => (await tx`
    SELECT list_commercial_sale_orders(${project},p_segment_slug=>'gastronomia') AS result
  `)[0].result);
  assert.equal(restrictedList.rows[0].document_count,null);
  const privateSearch = await asUser(sellerWithoutContracts, async (tx) => (await tx`
    SELECT list_commercial_sale_orders(${project},p_search=>'C2-TEST') AS result
  `)[0].result);
  assert.equal(privateSearch.total,0);
  await assert.rejects(asUser(sellerWithoutContracts, (tx) => tx`
    SELECT list_commercial_sale_orders(${project},p_has_document=>true)
  `), /MAP_PERMISSION_DENIED/);
  const report = await asUser(seller, async (tx) => (await tx`
    SELECT workers_map_commercial_report(${project},${tx.json({schemaVersion:1, projectId:project, scopeSearch:['Gastronomia']})}) AS result
  `)[0].result);
  assert.equal(report.totals.inventoryLots,12);
  assert.equal(report.totals.pendingPrincipalCents,8246400);
  assert.equal(report.totals.currentArea,null);
  assert.ok(report.inventory.every((row) => row.commercialUnit === 'FOOD_POINT' && row.currentArea === null));
  assert.ok(report.coverage.issues.every((issue) => !['CURRENT_AREA_MISSING','HISTORICAL_AREA_MISSING','GEOMETRY_MISSING'].includes(issue.code)));

  await confirm(order,[pizzaItem.id]);
  await confirm(order,[pizzaItem.id]);
  assert.equal(await getStatus(pizza),'SOLD');
  assert.equal(await getStatus(central),'SALE_OPEN');
  await db.begin((tx) => tx.unsafe(migration.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '')));
  await db.unsafe(contractMigration);
  assert.equal(await getStatus(pizza),'SOLD');
  assert.equal((await getItems(order))[1].id,pizzaItem.id);
  assert.equal((await db`SELECT count(*)::int AS n FROM commercial_lots WHERE commercial_unit='FOOD_POINT'`)[0].n,12);

  const pointUpload = (user = seller) => asUser(user, (tx) => tx`SELECT register_lot_contract_version(${pizza},${pointDocPath},'pizza.pdf','application/pdf',1024,'C2-PIZZA',${pizzaItem.sale_id})`);
  await assert.rejects(pointUpload(sellerWithoutContracts), /MAP_PERMISSION_DENIED/);
  await pointUpload();
  const pizzaHistory = await pointHistory(pizza);
  const individual = pizzaHistory.contracts.find((row) => row.scope === 'LOT');
  const orderContract = pizzaHistory.contracts.find((row) => row.scope === 'ORDER_ITEMS');
  assert.ok(pizzaHistory.canUpload && pizzaHistory.canViewHistory && pizzaHistory.documentsAccessible);
  assert.equal(pizzaHistory.saleId,pizzaItem.sale_id);
  assert.equal(individual.orderId,order);
  assert.equal(orderContract.coverageCount,2);
  assert.equal(individual.versions[0].uploadedBy,seller);
  assert.equal((await pointHistory(central)).contracts.length,1);
  const publicHistory = await pointHistory(pizza,mapViewer);
  assert.equal(publicHistory.canViewHistory,false);
  assert.deepEqual(publicHistory.contracts,[]);
  assert.deepEqual(publicHistory.history,[]);
  assert.deepEqual((await pointHistory(pizza,sellerWithoutContracts)).history.map((event) => event.action).sort(), ['LOT_SALE_CONFIRMED','LOT_SALE_OPEN']);
  assert.deepEqual((await pointHistory(pizza,contractsOnly)).history.map((event) => event.action).sort(), ['CONTRACT_UPLOADED','ORDER_CONTRACT_UPLOADED']);

  const replace = (path, expected, mime = 'application/pdf') => asUser(seller, (tx) => tx`
    SELECT register_lot_contract_version(${pizza},${path},'pizza-v2.pdf',${mime},1024,'C2-PIZZA',${pizzaItem.sale_id},${individual.contractId},${expected})
  `);
  await assert.rejects(replace(rejectedReplacement,1,'text/plain'), /INVALID_CONTRACT_FILE/);
  assert.equal((await pointHistory(pizza)).contracts.find((row) => row.scope === 'LOT').activeVersion,1);
  await replace(pointReplacement,1);
  await assert.rejects(replace(rejectedReplacement,1), /CONTRACT_CHANGED/);
  await asUser(seller, (tx) => tx`
    SELECT update_commercial_contract_metadata(${individual.contractId},'C2-PIZZA-EDIT',2,${pizza},${pizzaItem.sale_id})
  `);
  const replaced = (await pointHistory(pizza)).contracts.find((row) => row.scope === 'LOT');
  assert.equal(replaced.contractNumber,'C2-PIZZA-EDIT');
  assert.deepEqual(replaced.versions.map((row) => [row.version,Boolean(row.supersededAt)]),[[2,false],[1,true]]);
  const metaAudit = (await pointHistory(pizza)).history.find((event) => event.action === 'CONTRACT_METADATA_UPDATED');
  assert.equal(metaAudit.actorUserId,seller);
  assert.equal(metaAudit.beforeState.contract_number,'C2-PIZZA');
  assert.equal(metaAudit.afterState.contract_number,'C2-PIZZA-EDIT');
  assert.equal((await detail(order)).contracts.find((row) => row.scope === 'LOT').contractNumber,replaced.contractNumber);
  const replaceShared = (lot, sale) => asUser(seller, (tx) => tx`
    SELECT replace_lot_order_contract(${lot},${sale},${orderContract.contractId},1,${sharedReplacement},'shared-v2.pdf','application/pdf',1024)
  `);
  await assert.rejects(replaceShared(central,centralItem.sale_id), /SALE_CHANGED/);
  await replaceShared(pizza,pizzaItem.sale_id);
  assert.equal((await pointHistory(central)).contracts[0].activeVersion,2);
  assert.equal((await pointHistory(pizza)).contracts.find((row) => row.scope === 'ORDER_ITEMS').versions[0].storagePath,sharedReplacement);
  assert.equal((await asUser(seller, (tx) => tx`DELETE FROM storage.objects WHERE bucket_id='map-contracts' AND name=${pointDocPath} RETURNING name`)).length,0);
  assert.equal((await asUser(seller, (tx) => tx`DELETE FROM storage.objects WHERE bucket_id='map-contracts' AND name=${rejectedReplacement} RETURNING name`)).length,1);
  await assert.rejects(asUser(seller, (tx) => tx`DELETE FROM lot_contract_versions WHERE id=${replaced.versions[1].id}`), /permission denied/);

  await db`UPDATE lot_sale_installments SET payment_status='PAID',paid_at=now() WHERE order_id=${order} AND installment_number=1`;
  await cancel(order,[centralItem.id]);
  assert.equal(await getStatus(central),'AVAILABLE');
  assert.equal(await getStatus(pizza),'SOLD');
  const remaining = await detail(order);
  assert.equal(remaining.installments[0].amount,first.installments[0].amount);
  assert.equal(remaining.installments[0].paymentStatus,'PAID');
  assert.equal(remaining.header.negotiatedTotal,32357);
  assert.deepEqual(remaining.contracts.find((row) => row.scope === 'LOT').lotIds,[pizza]);
  const shared = remaining.contracts.find((row) => row.scope === 'ORDER_ITEMS');
  assert.deepEqual(shared.lotIds,[pizza]);
  assert.ok(shared.historicalLotIds.includes(central));
  assert.equal(shared.versions[0].coveredLotIds.length,2);
  assert.equal((await pointHistory(central)).contracts[0].isCurrent,false);
  assert.equal((await pointHistory(central)).contracts[0].versions[0].storagePath,sharedReplacement);
  assert.equal((await pointHistory(central)).history.find((event) => event.action === 'LOT_SALE_CANCELLED').actorUserId,seller);

  const revise = (add) => asUser(seller, (tx) => tx`SELECT revise_sale_order_items(${order},${tx.array([add])}::uuid[],p_reason=>'QA revisão')`);
  await assert.rejects(revise(id('GAST-D3-01')), /LOT_OUTSIDE_ORDER_SCOPE/);
  await revise(central);
  const revised = await detail(order);
  assert.equal(revised.items.length,3);
  assert.equal(revised.items.find((row) => row.lotId === central && row.contractState !== 'CANCELLED').contractState,'SIGNED');
  assert.equal(revised.header.negotiatedTotal,82464);
  assert.equal(revised.installments[0].amount,first.installments[0].amount);
  assert.deepEqual(revised.contracts.find((row) => row.scope === 'ORDER_ITEMS').lotIds,[pizza]);
  const revision = (await pointHistory(pizza)).history.find((event) => event.action === 'LOT_SALE_ORDER_REVISED'
    && event.afterState.lots_after.includes('GAST-C2-01'));
  assert.equal(revision.actorUserId,seller);
  assert.deepEqual(revision.afterState.lots_before,['GAST-C2-02']);
  assert.equal(revision.afterState.total_after,82464);

  // Removing a signed item keeps its contract in the first sale. The same lot
  // can subsequently acquire a different current contract under another sale.
  await asUser(seller, (tx) => tx`SELECT revise_sale_order_items(${order},p_remove_item_ids=>${tx.array([pizzaItem.id])}::uuid[],p_reason=>'QA remoção')`);
  const removed = await pointHistory(pizza);
  assert.equal(removed.canUpload,false);
  assert.ok(removed.contracts.every((row) => !row.isCurrent && row.orderId === order));
  assert.deepEqual((await detail(order)).contracts.find((row) => row.scope === 'LOT').lotIds,[]);
  const nextOrder = await runSale('resale-pizza',[pizza],3235700);
  const [newItem] = await getItems(nextOrder);
  await confirm(nextOrder,[newItem.id]);
  const newDocument = org + '/' + pizza + '/new-sale.pdf';
  await db`INSERT INTO storage.objects (bucket_id,name,owner_id) VALUES ('map-contracts',${newDocument},${seller})`;
  await assert.rejects(asUser(seller, (tx) => tx`SELECT register_lot_contract_version(${pizza},${newDocument},'new.pdf','application/pdf',1024,NULL,${pizzaItem.sale_id})`), /SALE_CHANGED/);
  await asUser(seller, (tx) => tx`SELECT register_lot_contract_version(${pizza},${newDocument},'new.pdf','application/pdf',1024,NULL,${newItem.sale_id})`);
  const resold = await pointHistory(pizza);
  assert.equal(resold.contracts.filter((row) => row.isCurrent).length,1);
  assert.equal(resold.contracts.find((row) => row.isCurrent).orderId,nextOrder);
  assert.equal(resold.contracts.find((row) => row.contractId === individual.contractId).versions.length,2);
  assert.deepEqual((await detail(nextOrder)).contracts.map((row) => row.versions[0].storagePath),[newDocument]);
  assert.equal((await detail(order)).contracts.find((row) => row.scope === 'LOT').contractId,individual.contractId);

  const mirante = inventory.filter((row) => row.anchor === 'D3').map((row) => row.id);
  const fullMirante = await runSale('mirante',mirante,11027000,{method:'BOLETO_AVISTA'});
  assert.equal((await detail(fullMirante)).header.negotiatedTotal,110270);
  await cancel(fullMirante,(await getItems(fullMirante)).map((row) => row.id));

  const race = await Promise.allSettled([
    runSale('race-a',[mirante[4]],1915000),
    runSale('race-b',[mirante[4]],1915000),
  ]);
  assert.equal(race.filter((result) => result.status === 'fulfilled').length,1);
  assert.match(race.find((result) => result.status === 'rejected').reason.message,/LOT_NOT_SELLABLE/);
  assert.equal((await db`SELECT count(*)::int AS n FROM lot_sales WHERE lot_id=${mirante[4]} AND status IN ('OPEN','CONFIRMED')`)[0].n,1);
  for (const other of mirante.slice(0,4)) assert.equal(await getStatus(other),'AVAILABLE');

  const areaLots = await db`SELECT id FROM commercial_lots WHERE commercial_unit='SQUARE_METER' ORDER BY public_identifier`;
  for (const [index, row] of areaLots.entries()) {
    const mixed = await runSale('mixed-' + index,[id('GAST-C1-01'),row.id],8711700,{fee:10});
    const mixedDetail = await detail(mixed);
    assert.equal(mixedDetail.header.officialAreaTotal,20);
    assert.equal(mixedDetail.header.spacesSubtotal,87107);
    assert.equal(mixedDetail.header.feesTotal,10);
    assert.equal(mixedDetail.header.negotiatedTotal,87117);
    await cancel(mixed,(await getItems(mixed)).map((item) => item.id));
  }
  const [ordinary] = areaLots;
  const ordinaryOrder = await runSale('ordinary-contract',[ordinary.id],200000);
  const [ordinaryItem] = await getItems(ordinaryOrder);
  await confirm(ordinaryOrder,[ordinaryItem.id]);
  const ordinaryPath = org + '/' + ordinary.id + '/ordinary.pdf';
  await db`INSERT INTO storage.objects (bucket_id,name,owner_id) VALUES ('map-contracts',${ordinaryPath},${seller})`;
  await asUser(seller, (tx) => tx`SELECT register_lot_contract_version(${ordinary.id},${ordinaryPath},'ordinary.pdf','application/pdf',1024,'ORDINARY')`);
  assert.equal((await detail(ordinaryOrder)).contracts[0].versions[0].storagePath,ordinaryPath);
  console.log('Gastronomia PostgreSQL QA: 12 pontos, 6 estruturas, R$ 386.541,00, carga idempotente, RLS, três pagamentos, checkout misto, concorrência, revisão, documentos, exportação e relatório OK');
} finally {
  await db.end();
}
