/** Runs the public RPC baseline and candidate on synthetic, isolated PostgreSQL.
 * Set PGLITE_MODULE to @electric-sql/pglite's absolute dist/index.js path. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error('Set PGLITE_MODULE to an absolute PGlite module path.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const { pgcrypto } = await import(pathToFileURL(join(dirname(modulePath), 'contrib/pgcrypto.js')).href);
const db = new PGlite({ extensions: { pgcrypto } });
const migration = (filename) => readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8');
const value = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const sqlFunction = (source, name) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = source.indexOf('$function$;', start);
  assert(start >= 0 && end > start, `Missing baseline function ${name}`);
  return source.slice(start, end + '$function$;'.length);
};
const id = (n) => `b11cf05a-8a1f-4864-bd11-${String(n).padStart(12, '0')}`;
const rural = 'exporural';
const industry = 'industria-comercio-servicos-externo';
const auto = 'espaco-automovel';
const pavilion = 'pavilhao-1';
const token = (slug) => `synthetic-public-map-token-${slug}`;
const inventory = (slug = rural, access = token(slug)) => value('SELECT public_map_inventory($1,$2) value', [slug, access]);
const revision = async (slug = rural) =>
  (await value('SELECT public_map_scope_revision($1,$2) value', [slug, token(slug)])).revision;
const detail = (n, slug = rural) => value('SELECT public_map_lot($1,$2,$3) value', [slug, token(slug), id(n)]);
const asOwner = async (sql) => {
  await db.exec('RESET ROLE');
  await db.exec(sql);
  await db.exec('SET ROLE anon');
};

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA app_private; GRANT USAGE ON SCHEMA app_private TO anon;
    CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE map_projects(id uuid PRIMARY KEY, org_id uuid, name text DEFAULT 'Synthetic',
      coordinate_system text DEFAULT 'IMAGE', reference_width int, reference_height int,
      active_version int DEFAULT 1, reference_revision text, updated_at timestamptz DEFAULT now());
    CREATE TABLE map_segments(id uuid PRIMARY KEY, project_id uuid, slug text, is_active bool DEFAULT true);
    CREATE TABLE map_entities(id uuid PRIMARY KEY, project_id uuid, layer_id uuid DEFAULT '${id(190)}',
      parent_entity_id uuid, segment_id uuid, public_identifier text, name text, description text,
      classification text, verification_status text, is_sellable bool DEFAULT true,
      is_archived bool DEFAULT false, metadata jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now());
    CREATE TABLE map_entity_geometries(id uuid PRIMARY KEY, entity_id uuid, geometry jsonb,
      elevation numeric, extrusion_height numeric, rotation numeric, version int, calibration_version int,
      is_current bool DEFAULT true, updated_at timestamptz DEFAULT now());
    CREATE TABLE map_layers(id uuid PRIMARY KEY, project_id uuid, layer_key text, name text,
      description text, color text, opacity numeric, is_visible bool, is_locked bool, sort_order int);
    CREATE TABLE commercial_lots(id uuid PRIMARY KEY, entity_id uuid, project_id uuid, public_identifier text,
      block text, lot_number text, level_label text, display_name text, official_area_sqm numeric,
      is_corner bool, is_covered bool, infrastructure text[], has_electricity bool,
      has_water bool, has_internet bool, status text, archived_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE VIEW commercial_lot_pricing_2028 AS SELECT id AS lot_id, 100::numeric AS renovacao_price_per_sqm,
      100::numeric AS renovacao_total, 'Synthetic'::text AS renovacao_rule_label, 110::numeric AS segunda_price_per_sqm,
      110::numeric AS segunda_total, 'Synthetic'::text AS segunda_rule_label, 'RESOLVIDO'::text AS resolution_status,
      null::text AS pavilion FROM commercial_lots;
    CREATE TABLE lot_sales(id uuid PRIMARY KEY, lot_id uuid, status text, buyer_name text, buyer_trade_name text,
      created_at timestamptz DEFAULT now(), reverted_at timestamptz,
      document_number text DEFAULT 'private-document', negotiated_value numeric DEFAULT 123456);
    CREATE UNIQUE INDEX lot_sales_one_confirmed_per_lot ON lot_sales(lot_id) WHERE status = 'CONFIRMED';
    CREATE TABLE lot_sale_order_items(id uuid PRIMARY KEY, order_id uuid, lot_id uuid, sale_id uuid,
      contract_state text, cancelled_at timestamptz);
    CREATE TABLE lot_sale_orders(id uuid PRIMARY KEY, project_id uuid, exhibitor_id uuid, status text DEFAULT 'CONFIRMED',
      updated_at timestamptz DEFAULT now(), reverted_at timestamptz);
    CREATE TABLE commercial_exhibitors(id uuid PRIMARY KEY, org_id uuid, trade_name text);
    CREATE TABLE lot_contracts(id uuid PRIMARY KEY, order_id uuid, filename text);
    CREATE TABLE lot_contract_lots(contract_id uuid, lot_id uuid);
  `);
  const links = await migration('20260920140827_933304d5-bed6-4a02-9900-2e0a74616514.sql');
  await db.exec(links.split('CREATE TABLE IF NOT EXISTS public.public_map_events')[0]);
  for (const name of ['public_map_resolve_link', 'public_map_scope_entity_ids']) await db.exec(sqlFunction(links, name));
  await db.exec(`
    REVOKE ALL ON FUNCTION public_map_resolve_link(text,text), public_map_scope_entity_ids(uuid) FROM PUBLIC;
    ALTER TABLE lot_sales ENABLE ROW LEVEL SECURITY;
    ALTER TABLE lot_sale_orders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE commercial_exhibitors ENABLE ROW LEVEL SECURITY;
  `);
  await db.exec(await migration('20260920204748_aeb5790c-352c-4ee9-aa6a-672a237854f5.sql'));
  await db.exec(await migration('20260925002742_85393a93-2980-4550-b750-fc3362fa0091.sql'));
  await db.exec(await migration('20260926132413_1c8401d9-64f9-4dea-98a0-4b7f54b69192.sql'));
  await db.exec(await migration('20260929010000_public_map_three_conditions.sql'));
  const identity = await migration('20261002150426_ce99eb35-02d6-4db4-bcbe-1e79c564c06d.sql');
  await db.exec(identity.slice(identity.indexOf('CREATE OR REPLACE FUNCTION public.commercial_buyer_display_name'), identity.indexOf('-- Registro de pedido')));
  await db.exec(identity.slice(identity.indexOf('-- Links públicos')));

  await db.exec(`
    INSERT INTO map_projects(id, org_id) VALUES ('${id(100)}','${id(101)}');
    INSERT INTO map_segments VALUES ('${id(200)}','${id(100)}','exporural',true),
      ('${id(201)}','${id(100)}','industria-comercio-servicos',true);
    INSERT INTO map_entities(id,project_id,public_identifier) VALUES ('${id(204)}','${id(100)}','B1');
    INSERT INTO map_layers(id,project_id,layer_key,name,sort_order)
      VALUES ('${id(190)}','${id(100)}','commercial','Synthetic',1);
    INSERT INTO commercial_exhibitors VALUES ('${id(300)}','${id(101)}','Unconfirmed draft'),
      ('${id(301)}','${id(101)}','Same spelling');
    INSERT INTO lot_sale_orders(id,project_id,exhibitor_id,updated_at)
      VALUES ('${id(400)}','${id(100)}','${id(300)}','2026-09-01'),
      ('${id(401)}','${id(100)}','${id(300)}','2026-10-01'),
      ('${id(402)}','${id(100)}','${id(301)}','2026-09-01'),
      ('${id(403)}','${id(100)}',null,'2026-09-01'),
      ('${id(404)}','${id(100)}',null,'2026-09-01'),
      ('${id(405)}','${id(100)}',null,'2026-09-01');
  `);
  for (const [n, order, trade, state, area] of [
    [1, 400, 'KF', 'SIGNED'], [2, 400, 'KF', 'SIGNED'], [3, 400, 'KF', 'SIGNED'],
    [4, 401, '\tKF ', 'SIGNED'], [5, 402, 'KF', 'SIGNED'],
    [6, 403, 'Legado', 'LEGACY_UNVERIFIED'], [7, 404, 'Legado', 'LEGACY_UNVERIFIED'],
    [8, 405, 'Legado conjunto', 'LEGACY_UNVERIFIED'], [9, 405, 'Legado conjunto', 'LEGACY_UNVERIFIED'],
    [10, null, '  ', null], [11, 400, 'Em aberto', 'PENDING_SIGNATURE'],
    [12, 401, 'Fora do recorte', 'SIGNED', 'industry'],
    [13, 400, 'Cancelada', 'CANCELLED'], [14, null, null, null, 'pavilion'],
    [15, 401, 'Interior ICS', 'SIGNED', 'industry-interior'],
    [16, null, null, 'AVAILABLE'], [17, 400, 'Carros', 'SIGNED', 'auto'],
  ]) {
    const segment = !area ? id(200) : area.startsWith('industry') ? id(201) : null;
    const metadata = area === 'industry-interior' ? { pavilionPublicIdentifier: 'B1' } : {};
    await db.query(`INSERT INTO map_entities(id,project_id,parent_entity_id,segment_id,public_identifier,metadata)
      VALUES ($1,$2,$3,$4,$5,$6)`, [id(1000 + n), id(100), area === 'pavilion' ? id(204) : null, segment, `Fixture ${n}`, metadata]);
    await db.query(`INSERT INTO commercial_lots(id,entity_id,project_id,public_identifier,official_area_sqm,status)
      VALUES ($1,$2,$3,$4,2,$5)`, [id(n), id(1000 + n), id(100), `Fixture ${n}`,
      state === 'PENDING_SIGNATURE' ? 'SALE_OPEN' : state === 'AVAILABLE' ? 'AVAILABLE' : 'SOLD']);
    if (state !== 'AVAILABLE') {
      await db.query(`INSERT INTO lot_sales(id,lot_id,status,buyer_name,buyer_trade_name)
        VALUES ($1,$2,$3,$4,$5)`, [id(500 + n), id(n), state === 'PENDING_SIGNATURE' ? 'OPEN' : 'CONFIRMED', 'Private legal name', trade]);
    }
    if (order) {
      await db.query('INSERT INTO lot_sale_order_items(id,order_id,lot_id,sale_id,contract_state) VALUES ($1,$2,$3,$4,$5)',
        [id(600 + n), id(order), id(n), id(500 + n), state]);
    }
  }
  for (const [n, slug, kind, key, entities] of [
    [701, rural, 'SEGMENT', rural, []],
    [702, industry, 'SEGMENT_EXTERNAL', 'industria-comercio-servicos', []],
    [703, auto, 'ENTITY_SET', null, [id(1017)]],
    [704, pavilion, 'PAVILION', 'B1', []],
  ]) {
    await db.query(`INSERT INTO public_map_links(id,org_id,project_id,slug,display_name,scope_kind,scope_key,scope_entity_ids,is_active,token_hash)
      VALUES ($1,$2,$3,$4,$4,$5,$6,$7,true,encode(extensions.digest($8,'sha256'),'hex'))`,
    [id(n), id(101), id(100), slug, kind, key, entities, token(slug)]);
  }

  await db.exec('SET ROLE anon');
  const oldPavilion = await inventory(pavilion);
  const oldPavilionDetail = await detail(14, pavilion);
  assert.equal(oldPavilionDetail.buyerName, 'Private legal name');
  await asOwner(await migration('20261117140000_public_map_sold_companies.sql'));

  let current = await inventory();
  const lot = (n) => current.lots.find((item) => item.id === id(n));
  const key = (n) => lot(n).buyerGroupKey;
  const initialRevision = await revision();
  assert.equal(current.revision, initialRevision);
  assert.equal(current.lots.length, 13);
  assert.deepEqual([1, 2, 3, 4].map(key), Array(4).fill(key(1)));
  assert.match(key(1), /^[a-f0-9]{64}$/);
  assert.notEqual(key(1), key(5));
  assert.equal(lot(1).buyerTradeName, 'KF');
  assert.equal(lot(5).buyerTradeName, 'KF');
  assert.notEqual(key(6), key(7));
  assert.equal(key(8), key(9));
  assert.equal(lot(10).buyerIdentityEligible, true);
  assert.equal(lot(10).buyerTradeName, null);
  assert.equal(lot(10).buyerName, null);
  for (const n of [11, 13]) {
    assert.equal(lot(n).availability, 'SOLD');
    assert.equal(lot(n).buyerIdentityEligible, false);
    assert.equal(lot(n).buyerGroupKey, null);
  }
  assert.equal(lot(16).availability, 'AVAILABLE');
  assert(!JSON.stringify(current).match(/Private legal name|private-document|123456|Fora do recorte|Unconfirmed draft/));
  assert.equal((await detail(3)).buyerGroupKey, key(1));
  assert.equal((await detail(3)).buyerTradeName, lot(3).buyerTradeName);
  assert.deepEqual((await inventory(industry)).lots.map((item) => item.id), [id(12)]);
  assert.equal((await detail(12, industry)).buyerTradeName, 'Fora do recorte');
  assert.notEqual((await detail(12, industry)).buyerGroupKey, key(1));
  assert.equal((await detail(17, auto)).buyerTradeName, 'Carros');
  await assert.rejects(() => detail(12), /PUBLIC_MAP_LOT_OUT_OF_SCOPE/);
  assert.deepEqual(await inventory(pavilion), oldPavilion);
  assert.deepEqual(await detail(14, pavilion), oldPavilionDetail);
  await assert.rejects(() => db.query('SELECT * FROM lot_sales'), /permission denied/);
  await assert.rejects(() => db.query('SELECT app_private.public_map_sold_company_projection(null,null)'), /permission denied/);

  await asOwner(`INSERT INTO lot_contracts VALUES ('${id(900)}','${id(400)}','private-1.pdf'), ('${id(901)}','${id(400)}','private-2.pdf');
    INSERT INTO lot_contract_lots VALUES ('${id(900)}','${id(1)}'), ('${id(900)}','${id(2)}'), ('${id(901)}','${id(2)}');
    UPDATE commercial_exhibitors SET trade_name='another draft' WHERE id='${id(300)}';`);
  assert.equal(await revision(), initialRevision);
  assert.deepEqual(await inventory(), current);

  await asOwner(`INSERT INTO lot_sale_order_items(id,order_id,lot_id,sale_id,contract_state)
    VALUES ('${id(950)}','${id(402)}','${id(2)}','${id(502)}','SIGNED');`);
  current = await inventory();
  assert.notEqual(key(2), key(1));
  assert.notEqual(key(2), key(5));
  assert.notEqual(current.revision, initialRevision);
  await asOwner(`DELETE FROM lot_sale_order_items WHERE id='${id(950)}';`);
  assert.equal(await revision(), initialRevision);

  await asOwner(`UPDATE lot_sales SET buyer_trade_name=' KF Renovada ' WHERE id='${id(504)}';`);
  current = await inventory();
  assert.equal(current.revision, await revision());
  assert.notEqual(current.revision, initialRevision);
  assert.equal(lot(1).buyerTradeName, 'KF Renovada');
  assert.equal(lot(5).buyerTradeName, 'KF');
  const renamedRevision = current.revision;
  const originalKey = key(1);
  const industryRevision = await revision(industry);

  await asOwner(`UPDATE lot_sales SET buyer_trade_name='  ' WHERE id='${id(504)}';`);
  current = await inventory();
  assert.equal(lot(1).buyerTradeName, null);
  assert.equal(key(1), originalKey);
  assert.notEqual(current.revision, renamedRevision);
  await asOwner(`UPDATE lot_sales SET buyer_trade_name=' KF Renovada ' WHERE id='${id(504)}';`);

  await asOwner(`UPDATE commercial_lots SET status='SOLD' WHERE id='${id(11)}';
    UPDATE lot_sales SET status='CONFIRMED', buyer_trade_name='KF' WHERE id='${id(511)}';
    UPDATE lot_sale_order_items SET contract_state='SIGNED' WHERE id='${id(611)}';
    UPDATE lot_sale_orders SET exhibitor_id='${id(301)}' WHERE id='${id(400)}';`);
  current = await inventory();
  assert.notEqual(current.revision, renamedRevision);
  assert.equal(lot(11).buyerIdentityEligible, true);
  assert.equal(key(11), key(5));
  assert.notEqual(key(1), originalKey);
  assert.equal(await revision(industry), industryRevision);
  const linkedRevision = current.revision;

  await asOwner(`UPDATE commercial_lots SET status='AVAILABLE' WHERE id='${id(4)}';
    UPDATE lot_sales SET status='REVERTED', reverted_at=now() WHERE id='${id(504)}';
    UPDATE lot_sale_order_items SET contract_state='CANCELLED', cancelled_at=now() WHERE id='${id(604)}';`);
  const cancelled = await detail(4);
  assert.deepEqual([cancelled.availability, cancelled.buyerGroupKey, cancelled.buyerTradeName], ['AVAILABLE', null, null]);
  const cancelledRevision = await revision();
  assert.notEqual(cancelledRevision, linkedRevision);
  await asOwner(`UPDATE commercial_lots SET status='SOLD' WHERE id='${id(4)}';
    INSERT INTO lot_sales(id,lot_id,status,buyer_trade_name) VALUES ('${id(954)}','${id(4)}','CONFIRMED','Revenda');`);
  const resale = await detail(4);
  assert.notEqual(resale.buyerGroupKey, originalKey);
  assert.equal(resale.buyerTradeName, 'Revenda');
  assert.notEqual(await revision(), cancelledRevision);

  await assert.rejects(() => inventory(rural, token(industry)), /PUBLIC_MAP_LINK_INVALID/);
  await asOwner(`UPDATE public_map_links SET expires_at=now()-interval '1 second' WHERE slug='${rural}';`);
  for (const read of [inventory, revision, () => detail(1), () => value('SELECT public_map_context($1,$2) value', [rural, token(rural)])]) {
    await assert.rejects(() => read(), /PUBLIC_MAP_LINK_INVALID/);
  }
  await asOwner(`UPDATE public_map_links SET expires_at=now()+interval '1 day' WHERE slug='${rural}';
    UPDATE public_map_links SET revoked_at=now() WHERE slug='${auto}';
    UPDATE public_map_links SET scope_kind='PAVILION', scope_key='B1' WHERE slug='${industry}';`);
  assert((await inventory()).lots.length > 0);
  await assert.rejects(() => inventory(auto), /PUBLIC_MAP_LINK_INVALID/);
  assert.equal('buyerGroupKey' in await detail(14, industry), false);
  console.log('Public inventory, detail, scope revision, expiration and legacy compatibility passed in isolated PostgreSQL (PGlite).');
} finally {
  await db.close();
}
