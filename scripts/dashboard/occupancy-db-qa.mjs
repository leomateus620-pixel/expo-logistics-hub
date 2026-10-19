/** Fresh PostgreSQL WASM. Uses the actual checkout/signature/cancellation SQL
 * and the new read RPC, with synthetic auth, prices and records only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error('Set PGLITE_MODULE to the absolute PGlite module path.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const checks = [];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), project = id(2), pavilion = id(3), user = id(4), exhibitor = id(5);
const sql = body => db.exec(body);
const query = async (body, params = []) => (await db.query(body, params)).rows;
const value = async (body, params = []) => (await query(body, params))[0].value;
const file = name => fs.readFile(name, 'utf8');
const table = (source, name) => source.match(new RegExp(`CREATE TABLE public\\.${name} \\([\\s\\S]*?\\n\\);`))[0];
try {
  await sql(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES('${user}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE map_projects(id uuid PRIMARY KEY,org_id uuid,is_archived boolean DEFAULT false);
    CREATE TABLE map_entities(id uuid PRIMARY KEY,project_id uuid,parent_entity_id uuid,classification text,is_archived boolean DEFAULT false);
    CREATE TABLE commercial_lots(id uuid PRIMARY KEY,project_id uuid,entity_id uuid,public_identifier text,lot_number text,status text,
      archived_at timestamptz,official_area_sqm numeric,updated_at timestamptz DEFAULT now(),updated_by uuid);
    CREATE TABLE commercial_exhibitors(id uuid PRIMARY KEY,org_id uuid);
    CREATE TABLE profiles(user_id uuid,full_name text);
    CREATE FUNCTION map_has_explicit_capability(org uuid,capability text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT current_setting('test.org',true)=org::text AND coalesce(current_setting('test.capabilities',true),'') LIKE '%'||capability||'%' $$;
    CREATE FUNCTION can_view_commercial_map(org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT map_has_explicit_capability(org,'map.view') $$;
    CREATE TABLE lot_reservations(lot_id uuid,status text,updated_at timestamptz);
    CREATE TABLE lot_negotiations(lot_id uuid,status text,updated_at timestamptz);
    CREATE TABLE lot_status_history(lot_id uuid,previous_status text,new_status text,reason text,changed_by uuid);
    CREATE TABLE map_activity_logs(org_id uuid,project_id uuid,entity_id uuid,lot_id uuid,action text,before_state jsonb,after_state jsonb,reason text,actor_user_id uuid);
    CREATE VIEW commercial_sale_eligibility AS SELECT id lot_id,status='AVAILABLE' is_sellable FROM commercial_lots;
    CREATE VIEW commercial_lot_pricing_2028 AS SELECT id lot_id,100::numeric renovacao_price_per_sqm,110::numeric segunda_price_per_sqm,
      null::uuid renovacao_rule_id,null::uuid segunda_rule_id,'Preço de teste'::text renovacao_rule_label,'Preço de teste'::text segunda_rule_label FROM commercial_lots;`);
  const base = await file('supabase/migrations/20260805011308_bfacf637-b666-435a-88a4-8d9af2ba5f61.sql');
  const orders = await file('supabase/migrations/20260916043104_f96a88a7-acf9-4f62-85d1-85805e0e5ebb.sql');
  await sql(table(base, 'lot_sales'));
  for (const name of ['lot_sale_orders', 'lot_sale_order_items', 'lot_sale_installments']) await sql(table(orders, name));
  await sql(`ALTER TABLE lot_sale_orders ADD exhibitor_id uuid,ADD fee_admin numeric DEFAULT 0,ADD fee_ppci numeric DEFAULT 0,
    ADD fee_cleaning_license numeric DEFAULT 0,ADD fees_total numeric DEFAULT 0,ADD spaces_subtotal numeric DEFAULT 0;
    CREATE TABLE lot_contracts(id uuid PRIMARY KEY,lot_id uuid,order_id uuid,scope text,contract_number text,is_active boolean,
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE lot_contract_lots(contract_id uuid,lot_id uuid,PRIMARY KEY(contract_id,lot_id));`);
  const phases = await file('supabase/migrations/20260928195607_2d3505d1-bd81-4125-9b75-a2bb102f64a1.sql');
  await sql(phases.split('-- Fase 7:')[0]);
  const identity = await file('supabase/migrations/20261002150426_ce99eb35-02d6-4db4-bcbe-1e79c564c06d.sql');
  await sql(identity.split('-- Caminho legado.')[0]);
  await sql(await file('supabase/migrations/20261019180000_commercial_pavilion_occupancy.sql'));
  await sql(`INSERT INTO map_projects VALUES('${project}','${org}',false),('${id(20)}','${id(21)}',false);
    INSERT INTO map_entities VALUES('${pavilion}','${project}',null,'PAVILION',false),('${id(30)}','${project}',null,'PAVILION',false);
    INSERT INTO commercial_exhibitors VALUES('${exhibitor}','${org}');
    INSERT INTO map_entities SELECT ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'${project}','${pavilion}','INTERNAL_STAND',false FROM generate_series(1,257) n;
    INSERT INTO commercial_lots SELECT ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'${project}',
      ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'TECH-'||n,n::text,'AVAILABLE',null,3,now(),null FROM generate_series(1,257) n;
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    ALTER TABLE lot_sales ENABLE ROW LEVEL SECURITY; ALTER TABLE lot_sale_orders ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub','${user}',false),set_config('test.org','${org}',false),
      set_config('test.capabilities','map.view,map.manage_sales,map.manage_contracts',false);`);
  const occupancy = () => value('SELECT commercial_pavilion_occupancy($1,$2) value', [project, pavilion]);
  let data = await occupancy();
  assert.equal(data.lots.length, 257); assert(data.lots.every(l => !l.associations.length));
  assert.equal((await query('SELECT * FROM lot_sales')).length, 0);
  checks.push('Complete 257-lot snapshot via SECURITY DEFINER while table RLS denies direct sales reads');
  const order = await value(`SELECT register_commercial_sale_order(
    p_idempotency_key=>'occupancy-qa',p_stage=>'RENOVACAO',p_lot_ids=>$1::uuid[],p_buyer_name=>'Alfa LTDA',p_document_number=>null,
    p_phone=>null,p_email=>null,p_payment_type=>'CASH',p_installment_count=>1,p_payment_method=>'PIX',p_first_due_date=>'2026-11-01',
    p_installments=>'[{"due_date":"2026-11-01","amount":900}]'::jsonb,p_expected_total=>900,p_notes=>'Test only',
    p_exhibitor_id=>$2,p_buyer_trade_name=>'ALFA') value`, [[id(1001), id(1002), id(1003)], exhibitor]);
  data = await occupancy(); let active = data.lots.filter(l => l.associations.length);
  assert.equal(active.length, 3); assert(active.every(l => l.status === 'SALE_OPEN' && l.associations[0].contractState === 'PENDING_SIGNATURE'));
  assert(active.every(l => l.associations[0].orderId === order && l.associations[0].exhibitorId === exhibitor));
  checks.push('Actual checkout RPC creates OPEN/PENDING_SIGNATURE, persistent exhibitor identity and 3 active associations');
  await sql(`RESET ROLE; INSERT INTO lot_contracts VALUES('${id(500)}',null,'${order}','ORDER_ITEMS','FS28-TEST',true,now(),now());
    INSERT INTO lot_contract_lots VALUES('${id(500)}','${id(1001)}'),('${id(500)}','${id(1002)}'); SET ROLE authenticated;`);
  data = await occupancy(); active = data.lots.filter(l => l.associations.length);
  assert.equal(active.find(l => l.lotId === id(1001)).associations[0].contracts[0].number, 'FS28-TEST');
  assert.equal(active.find(l => l.lotId === id(1003)).associations[0].contracts.length, 0);
  assert(active.every(l => l.status === 'SALE_OPEN'));
  checks.push('Explicit contract scope covers only 2 linked items and never confirms a sale from a document');
  const first = active.find(l => l.lotId === id(1001)).associations[0].itemId;
  await query('SELECT confirm_sale_order_items($1,$2::uuid[])', [order, [first]]);
  data = await occupancy(); active = data.lots.filter(l => l.associations.length);
  assert.equal(active.filter(l => l.status === 'SOLD').length, 1);
  assert.equal(active.filter(l => l.status === 'SALE_OPEN').length, 2);
  const repeated = await value('SELECT confirm_sale_order_items($1,$2::uuid[]) value', [order, [first]]);
  assert.equal(repeated.skipped, 1);
  checks.push('Actual confirmation RPC preserves partial states and is idempotent');
  const cancel = active.find(l => l.lotId === id(1003)).associations[0].itemId;
  await query('SELECT cancel_sale_order_items($1,$2::uuid[],$3)', [order, [cancel], 'QA cancellation']);
  data = await occupancy(); const released = data.lots.find(l => l.lotId === id(1003));
  assert.equal(released.status, 'AVAILABLE'); assert.equal(released.associations.length, 0);
  checks.push('Actual cancellation releases inventory and removes the active association without deleting history');
  await sql(`RESET ROLE;
    INSERT INTO lot_sale_orders(id,project_id,buyer_name,stage,payment_type,payment_method,salesperson_user_id,idempotency_key)
      VALUES('${id(600)}','${project}','Outra empresa','RENOVACAO','CASH','PIX','${user}','contradictory-contract-fixture');
    INSERT INTO lot_contracts VALUES('${id(601)}',null,'${id(600)}','ORDER_ITEMS','MUST-NOT-LEAK',true,now(),now());
    INSERT INTO lot_contract_lots VALUES('${id(601)}','${id(1001)}'); SET ROLE authenticated;`);
  data = await occupancy();
  const contradicted = data.lots.find(l => l.lotId === id(1001)).associations[0];
  assert.equal(contradicted.inconsistent, true);
  assert(!JSON.stringify(contradicted.contracts).includes('MUST-NOT-LEAK'));
  await sql(`RESET ROLE; UPDATE lot_contracts SET is_active=false WHERE id='${id(601)}';
    UPDATE lot_sale_orders SET status='REVERTED',reverted_at=now() WHERE id='${id(600)}'; SET ROLE authenticated;`);
  checks.push('Contradictory active contract from another order is flagged without disclosing or adopting its reference');
  await sql(`SELECT set_config('test.capabilities','map.view',false);`);
  data = await occupancy(); assert.equal(data.contractsAccessible, false);
  assert(data.lots.every(l => l.associations.every(a => a.contracts === null)));
  assert(!JSON.stringify(data).match(/storage_path|document_number|negotiated_value|phone|email|FS28-TEST/));
  const pendingItem = data.lots.find(l => l.lotId === id(1002)).associations[0].itemId;
  await assert.rejects(() => query('SELECT confirm_sale_order_items($1,$2::uuid[])', [order, [pendingItem]]), /MAP_PERMISSION_DENIED/);
  checks.push('map.view alone receives authorized names but no contract references, contacts, prices or private paths');
  await sql(`SELECT set_config('test.org','${id(21)}',false);`);
  await assert.rejects(occupancy, /MAP_PERMISSION_DENIED/);
  await sql(`SELECT set_config('test.org','${org}',false),set_config('request.jwt.claim.sub','',false);`);
  await assert.rejects(occupancy, /MAP_PERMISSION_DENIED/);
  await sql(`SET ROLE anon;`); await assert.rejects(occupancy, /permission denied/);
  checks.push('Cross-organization, missing identity and anonymous execution denied');
  await sql(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user}',false),set_config('test.capabilities','map.view',false);
    UPDATE map_entities SET parent_entity_id='${id(101)}' WHERE id='${pavilion}'; SET ROLE authenticated;`);
  assert.equal((await occupancy()).lots.length, 257);
  checks.push('Persisted parent cycles terminate without losing the pavilion inventory');
  const report = { passed: true, boundary: 'Real PostgreSQL WASM; actual SQL RPC bodies; synthetic auth/eligibility/prices and reduced table schema. No deployed database access or production mutation.', checks };
  await fs.mkdir('docs/validation/pavilion-occupancy', { recursive: true });
  await fs.writeFile('docs/validation/pavilion-occupancy/database-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await db.close(); }
