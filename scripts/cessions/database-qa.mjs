import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const connection = {
  host: '127.0.0.1',
  port: Number(process.env.GASTRONOMY_QA_PORT),
  database: 'gastronomy_qa',
  user: 'postgres',
  max: 1,
  onnotice() {},
};
const db = postgres(connection);
const competitor = postgres(connection);
const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const inventory = JSON.parse(await read('./inventory-2028.json'));
const migration = await read('../../supabase/migrations/20261128120000_commercial_space_cessions.sql');
const project = '0538d132-34dd-4347-a33c-526edac7339c';
const seller = '00000000-0000-4000-a000-000000000010';
const org = '00000000-0000-4000-a000-000000000001';
const emater = 'e02f21cc-345d-4882-8dd2-a916b937ab64';
const sale = (tx, lot, price) =>
  tx.unsafe(
    `
  SELECT register_commercial_sale_order_checked($1,$2,$3,'RENOVACAO',ARRAY[$4::uuid],
    jsonb_build_object($4::text,$5::numeric),'Empresa QA',NULL,NULL,NULL,'CASH',1,'PIX',NULL,
    jsonb_build_array(jsonb_build_object('amount',$5::numeric,'due_date','2028-01-15')),$5,NULL,NULL,0,0,0,NULL) id`,
    [project, seller, crypto.randomUUID(), lot.id, price],
  );
const asSeller = async (tx) => {
  await tx.unsafe('SET LOCAL ROLE authenticated');
  await tx`SELECT set_config('request.jwt.claim.sub',${seller},true)`;
};
try {
  assert.equal(
    (await db`SELECT name FROM map_projects WHERE id=${project} AND org_id=${org}`)[0]?.name,
    'Fenasoja 2028 QA',
  );
  await db.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users SELECT DISTINCT user_id FROM user_capabilities;
      ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
      CREATE OR REPLACE FUNCTION public.map_capable_lot_ids(text) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT l.id FROM commercial_lots l JOIN map_projects p ON p.id=l.project_id WHERE map_has_explicit_capability(p.org_id,$1) $$;
      INSERT INTO commercial_exhibitors(id,org_id,name,document_number,document_normalized)
        VALUES ('7f7b6bea-725e-4efe-bd3e-5cdd0d7b0a48','${org}','FENASOJA','00000000000','00000000000');
    `);
    const [layer] =
      await tx`INSERT INTO map_layers(project_id,layer_key,name) VALUES(${project},'commercial','Lotes') RETURNING id`;
    for (const block of ['V', 'S', 'R']) {
      const slug = block === 'V' ? null : 'exporural';
      const [parent] =
        await tx`INSERT INTO map_entities(project_id,layer_id,public_identifier,name,classification,metadata)
        VALUES(${project},${layer.id},${'QUADRA-' + block},${'Quadra ' + block},'QUADRA',${tx.json({ segmentId: slug })}) RETURNING id`;
      for (const item of inventory.filter((i) => i.block === block)) {
        await tx`INSERT INTO map_entities(id,project_id,layer_id,parent_entity_id,public_identifier,name,classification,is_sellable,metadata)
          VALUES(${item.entity_id},${project},${layer.id},${parent.id},${item.code},${item.display_name},'SELLABLE_LOT',${item.is_sellable},${tx.json({ segmentId: slug })})`;
        await tx`INSERT INTO map_entity_geometries(project_id,entity_id,geometry,elevation,extrusion_height,rotation,change_reason)
          VALUES(${project},${item.entity_id},${tx.json(item.geometry)},${item.elevation},${item.extrusion_height},${item.rotation},'Prévia de QA')`;
        await tx`INSERT INTO commercial_lots(id,entity_id,project_id,public_identifier,display_name,block,lot_number,official_area_sqm)
          VALUES(${item.id},${item.entity_id},${project},${item.code},${item.display_name},${block},${item.lot_number},${item.baseline.official_area_sqm})`;
        await tx`INSERT INTO commercial_lot_price_overrides(lot_id,stage,total) VALUES
          (${item.id},'RENOVACAO',${item.baseline.renovacao_total}),(${item.id},'SEGUNDA_ETAPA',${item.baseline.segunda_total})`;
      }
    }
  });
  const inventoryMigration = await read(
    '../../supabase/migrations/20261128121000_commercial_cession_inventory.sql',
  );
  for (let pass = 0; pass < 2; pass++) {
    await db.unsafe(migration);
    await db.unsafe(inventoryMigration);
  }
  assert.equal((await db`SELECT count(*)::int n FROM commercial_lots WHERE cession_id IS NOT NULL`)[0].n, 11);
  assert.equal((await db`SELECT count(*)::int n FROM commercial_space_cessions`)[0].n, 2);
  const ceded = inventory.find((i) => i.code === 'Q-V-01');
  const neighbor = inventory.find((i) => i.code === 'Q-V-06');
  await assert.rejects(
    db.begin(async (tx) => {
      await asSeller(tx);
      await sale(tx, ceded, ceded.baseline.renovacao_total);
    }),
    /LOT_CEDED:Q-V-01/,
  );
  await db.begin(async (tx) => {
    await asSeller(tx);
    const [receipt] = await sale(tx, neighbor, neighbor.baseline.renovacao_total);
    assert.ok(receipt.id);
    await tx.unsafe('ROLLBACK');
  });
  await db.begin(async (tx) => {
    await asSeller(tx);
    const request = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      const [row] = await tx`SELECT register_space_cession(${request},${project},
        'Empresa QA',NULL,'Cessão de teste',ARRAY[${neighbor.id}::uuid]) id`;
      assert.equal(row.id, request);
    }
    const [row] = await tx`SELECT space_cession_detail(${request}) detail`;
    assert.equal(row.detail.total, 0);
    assert.equal(row.detail.lots.length, 1);
    assert.equal(row.detail.lots[0].original.renewal, Number(neighbor.baseline.renovacao_total));
    // The competing checkout cannot confirm while the cession owns the lot lock.
    await assert.rejects(
      competitor.begin(async (other) => {
        await asSeller(other);
        await other.unsafe("SET LOCAL lock_timeout = '350ms'");
        await sale(other, neighbor, neighbor.baseline.renovacao_total);
      }),
      { code: '55P03' },
    );
    await tx.unsafe('ROLLBACK');
  });
  const token = crypto.randomUUID();
  await db.begin(async (tx) => {
    await tx`INSERT INTO public_map_links(org_id,project_id,slug,token_hash,display_name,scope_kind,scope_entity_ids)
      VALUES(${org},${project},'qa-cession',encode(extensions.digest(${token},'sha256'),'hex'),
        'Prévia QA','ENTITY_SET',ARRAY[${ceded.entity_id}::uuid])`;
    await tx.unsafe('SET LOCAL ROLE anon');
    const [row] =
      await tx`SELECT public_map_inventory('qa-cession',${token}) scope, public_map_lot('qa-cession',${token},${ceded.id}) detail`;
    assert.deepEqual(
      row.scope.lots.map((l) => l.id),
      [ceded.id],
    );
    for (const lot of [row.scope.lots[0], row.detail]) {
      assert.deepEqual(lot.cession, {
        beneficiary: 'Emater Ascar',
        purpose: 'Espaço cedido por patrocínio',
        marker: null,
      });
      assert.equal(lot.pricing.renovacaoTotal, 0);
      assert.equal(lot.pricing.segundaTotal, 0);
      assert.ok(!JSON.stringify(lot).includes(emater));
    }
    await tx.unsafe('ROLLBACK');
  });
  await assert.rejects(
    db.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE anon');
      await tx`SELECT space_cession_detail(${emater})`;
    }),
    /permission denied/,
  );
  // Real document rows in a rolled-back QA transaction. No production contract is synthesized.
  await db.begin(async (tx) => {
    const path = org + '/cessions/' + emater + '/qa.pdf';
    await tx`INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES('map-contracts',${path},${seller},'{"size":1024,"mimetype":"application/pdf"}')`;
    await asSeller(tx);
    await tx`SELECT attach_cession_contract(${emater},0,${path},'qa.pdf','application/pdf',1024)`;
    await tx`SELECT sign_cession_contract(${emater},1)`;
    for (const code of ['Q-V-01', 'Q-S-25']) {
      const [row] =
        await tx`SELECT space_cession_detail(cession_id) detail FROM commercial_lots WHERE public_identifier=${code}`;
      assert.equal(row.detail.lots.length, 7);
      assert.equal(row.detail.versions[0].path, path);
      assert.ok(row.detail.versions[0].signedAt);
    }
    await tx.unsafe('ROLLBACK');
  });
  console.log('Duas aplicações, carrinho antigo bloqueado, checkout V06 e documento multiquadra conferidos.');
} finally {
  await Promise.all([db.end(), competitor.end()]);
}
