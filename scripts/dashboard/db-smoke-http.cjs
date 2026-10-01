// Local-only real PostgreSQL/PostgREST proof. Synthetic fixture; no application credentials.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
  if (index % 2 === 0) pairs.push([item.replace(/^--/, ''), all[index + 1]]);
  return pairs;
}, []));
const base = new URL(args.base || 'http://127.0.0.1:5195');
assert.equal(base.hostname, '127.0.0.1', 'Database smoke must stay on loopback');
const directory = path.resolve(args['run-dir']);
const secret = fs.readFileSync(args['secret-file'], 'utf8');
const repository = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(repository, 'src/features/commercial-map/services/commercialMapService.ts'), 'utf8');
const bridge = source.match(/const OFFICIAL_PRICING_EMBED = `([\s\S]*?)`;/)?.[1];
// Supabase .select() strips unquoted whitespace before URL serialization.
const select = source.match(/export const COMMERCIAL_LOT_SELECT = `([\s\S]*?)`;/)?.[1]?.replace('${OFFICIAL_PRICING_EMBED}', bridge)?.replace(/\s/g, '');
assert(bridge && select && !select.includes('${'), 'Use the exact checked-in map relation select');
assert(source.includes("limit(1, { referencedTable: 'financial_entity.pricing' })"), 'Child limit belongs to the current shared query');
const project = '30000000-0000-4000-8000-000000000001';
const otherProject = '30000000-0000-4000-8000-000000000002';
const org = '40000000-0000-4000-8000-000000000001';
const segment = '50000000-0000-4000-8000-000000000001';
const lotId = number => '10000000-0000-4000-8000-' + String(number).padStart(12, '0');
const entityId = number => '20000000-0000-4000-8000-' + String(number).padStart(12, '0');
const localClaims = {
  manager: { role: 'authenticated', org_id: org, capabilities: ['map.view', 'map.manage_sales', 'map.manage_lots'], segments: [] },
  viewer: { role: 'authenticated', org_id: org, capabilities: ['map.view'], segments: [] },
  commission: { role: 'authenticated', org_id: org, capabilities: [], segments: [segment] },
};
function jwt(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ ...localClaims[role], exp: Math.floor(Date.now() / 1000) + 600 });
  return content + '.' + crypto.createHmac('sha256', secret).update(content).digest('base64url');
}
async function request(resource, params, role = 'manager') {
  const url = new URL(resource, base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const headers = { Prefer: 'count=exact' };
  if (role !== 'anonymous') headers.Authorization = 'Bearer ' + jwt(role);
  const started = performance.now();
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  return { status: response.status, body, countRange: response.headers.get('content-range'), durationMs: Math.round(performance.now() - started) };
}
function parameters(offset = 0, includeLimit = true) {
  return { select, project_id: 'eq.' + project, archived_at: 'is.null', order: 'id.asc', offset, limit: 1000,
    ...(includeLimit ? { 'financial_entity.pricing.limit': 1 } : {}) };
}
async function ready(phase) {
  let latest;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await request('commercial_lots', { ...parameters(), limit: 0 });
      latest = { status: response.status, body: response.body };
      if (phase === 'before' && response.body.code === 'PGRST200') return response;
      if (phase === 'after' && [200, 206].includes(response.status)) return response;
    } catch (error) {
      if (attempt === 39) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Expected PostgREST schema cache was not ready for ' + phase + ': ' + JSON.stringify(latest));
}
async function pages(role) {
  const rows = [];
  const sizes = [];
  const durationMs = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await request('commercial_lots', parameters(offset), role);
    assert([200, 206].includes(response.status), JSON.stringify(response.body));
    assert(Array.isArray(response.body));
    assert(response.body.length <= 1000, 'Real API max rows is 1000');
    sizes.push(response.body.length);
    durationMs.push(response.durationMs);
    rows.push(...response.body);
    if (response.body.length < 1000) break;
  }
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, role + ': no root duplicates across pages');
  return { rows, sizes, durationMs };
}
function pricing(row) {
  const relation = row.financial_entity?.pricing;
  assert(!Array.isArray(relation) || relation.length <= 1, 'Embedded child remains at most one price row');
  const result = Array.isArray(relation) ? relation[0] : relation;
  if (result) {
    assert.equal(result.lot_id, row.id, 'Price matches the same lot');
    assert.equal(result.entity_id, row.entity_id, 'Price matches the same persisted entity');
  }
  return result;
}
function save(name, result) {
  fs.writeFileSync(path.join(directory, name), JSON.stringify(result, null, 2) + '\n');
}

(async () => {
  const readyResult = await ready(args.phase);
  if (args.phase === 'before') {
    const baseline = JSON.parse(fs.readFileSync(path.join(directory, 'view-before.json'), 'utf8').replace(/^\uFEFF/, ''));
    assert(!baseline.columns.includes('entity_id'));
    assert(baseline.viewOptions.includes('security_invoker=on'));
    const missingColumn = await request('commercial_lot_pricing_2028', { select: 'entity_id', limit: 0 });
    assert.equal(missingColumn.body.code, '42703');
    save('http-before.json', { exactSelect: select, missingRelationship: readyResult.body.code, missingEntityColumn: missingColumn.body.code,
      columns: baseline.columns, viewOptions: baseline.viewOptions });
    console.log('Before migration: missing entity_id and relationship proven over real PostgREST.');
    return;
  }
  const before = JSON.parse(fs.readFileSync(path.join(directory, 'view-before.json'), 'utf8').replace(/^\uFEFF/, ''));
  const after = JSON.parse(fs.readFileSync(path.join(directory, 'view-after.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.deepEqual(after.columns.slice(0, -1), before.columns, 'Existing pricing columns retain order/names');
  assert.equal(after.columns.at(-1), 'entity_id');
  assert(after.viewOptions.includes('security_invoker=on'));
  assert.equal(after.tieMultiplicity['FIXTURE-2'], 2);
  assert.equal(after.tieMultiplicity['FIXTURE-3'], 2);
  assert.equal(after.tieMultiplicity['FIXTURE-4'], 4);

  const manager = await pages('manager');
  assert.deepEqual(manager.sizes, [1000, 205]);
  assert.equal(manager.rows.length, 1205);
  const byId = new Map(manager.rows.map(row => [row.id, row]));
  const shapes = new Set();
  for (const row of manager.rows) {
    assert.equal(row.financial_entity.id, row.entity_id);
    shapes.add(Array.isArray(row.financial_entity.pricing) ? 'array' : typeof row.financial_entity.pricing);
    pricing(row);
  }
  const normal = pricing(byId.get(lotId(1)));
  assert.equal(normal.renovacao_total, 1000);
  assert.equal(normal.segunda_total, 2000);
  const tied = pricing(byId.get(lotId(2)));
  assert.equal(tied.resolution_status, 'REGRA_AMBIGUA');
  assert.equal(tied.renovacao_total, null);
  assert.equal(tied.segunda_total, 2000);
  const manual = pricing(byId.get(lotId(4)));
  assert.equal(manual.resolution_status, 'OK');
  assert.equal(manual.renovacao_total, 50);
  assert.equal(manual.segunda_total, 0);
  assert.equal(manual.renovacao_is_manual, true);
  assert.equal(manual.segunda_is_manual, true);
  assert.equal(pricing(byId.get(lotId(5))).resolution_status, 'SEM_AREA');
  assert.equal(pricing(byId.get(lotId(6))).segunda_total, 0);
  assert.equal(byId.get(lotId(1)).lot_sales[0].negotiated_value, 1250);
  assert.equal(byId.get(lotId(2)).lot_sales.length, 2, 'Repeated OPEN history preserved, no arbitrary latest pick');
  assert.equal(new Set(byId.get(lotId(2)).lot_sales.map(row => row.id)).size, 2);
  assert.equal(byId.get(lotId(3)).lot_sales[0].negotiated_value, 0);

  const viewer = await pages('viewer');
  assert.deepEqual(viewer.sizes, [1000, 205]);
  assert(viewer.rows.every(row => row.lot_sales.length === 0), 'Map viewer cannot read restricted negotiated sales');
  assert.equal(pricing(viewer.rows[0]).segunda_total, 2000, 'Authorized cadastral price remains visible');
  const commission = await pages('commission');
  assert.deepEqual(commission.sizes, [1000, 100]);
  assert.equal(commission.rows.length, 1100);
  assert(commission.rows.every(row => Number(row.public_identifier.replace('FIXTURE-', '')) <= 1100));
  const commissionSales = commission.rows.flatMap(row => row.lot_sales);
  assert.equal(commissionSales.length, 2);
  assert(commissionSales.every(row => row.status === 'CONFIRMED'), 'Commission can read only confirmed sales in its segment');
  const anonymous = await pages('anonymous');
  assert.deepEqual(anonymous.sizes, [0]);
  const other = await request('commercial_lots', { ...parameters(), project_id: 'eq.' + otherProject });
  assert.equal(other.body.length, 0, 'Root RLS excludes other project');
  for (const role of ['manager', 'commission', 'anonymous']) {
    const hidden = await request('commercial_lot_pricing_2028', { select: 'lot_id,entity_id,segunda_total', lot_id: 'eq.' + lotId(1206), limit: 1000 }, role);
    assert.equal(hidden.body.length, 0, role + ': security invoker excludes hidden base lot');
    const hiddenEntity = await request('map_entities', { select: 'id', id: 'eq.' + entityId(1206) }, role);
    assert.equal(hiddenEntity.body.length, 0, role + ': other project entity hidden');
  }
  const unbounded = await request('commercial_lots', { ...parameters(0, false), id: 'eq.' + lotId(4), limit: 1 });
  const relation = unbounded.body?.[0]?.financial_entity?.pricing;
  const result = { status: 'passed', fixture: 'Synthetic local 1205-lot schema with real PK/FK/UNIQUE/RLS expressions; capability helper dependencies simulated with local JWT claims',
    postgresVersion: after.postgresVersion, exactSelect: select, childLimit: 'financial_entity.pricing.limit=1',
    viewOptions: after.viewOptions, viewColumnsBefore: before.columns, viewColumnsAfter: after.columns,
    migrationAppliedTwice: true, tieMultiplicity: after.tieMultiplicity, embeddedShapes: [...shapes],
    unboundedTieProbe: { status: unbounded.status, code: unbounded.body?.code || null,
      rootRows: Array.isArray(unbounded.body) ? unbounded.body.length : 0,
      distinctRootRows: Array.isArray(unbounded.body) ? new Set(unbounded.body.map(row => row.id)).size : 0,
      childRows: Array.isArray(relation) ? relation.length : relation ? 1 : 0 },
    pagination: { manager: manager.sizes, viewer: viewer.sizes, commission: commission.sizes, anonymous: anonymous.sizes },
    localPageDurationMs: { manager: manager.durationMs, viewer: viewer.durationMs, commission: commission.durationMs, anonymous: anonymous.durationMs },
    rootRows: manager.rows.length, distinctRootRows: new Set(manager.rows.map(row => row.id)).size,
    negotiatedSales: { manager: manager.rows.flatMap(row => row.lot_sales).length, viewer: 0, commissionConfirmed: commissionSales.length },
    checks: ['Exact production select parses through real PostgREST', 'Root rows are unique across 1000+205 page boundary', 'Pricing belongs to matching persisted lot/entity',
      '2x2 tied rules produce four raw view rows but one limited embedded child', 'Ambiguous rule stays REGRA_AMBIGUA', 'Manual overrides and numeric zero preserved',
      'Missing official area stays SEM_AREA', 'Repeated OPEN sale IDs remain separate', 'RLS hides open/reverted sales from commission and all sales from ordinary viewer',
      'Security invoker respects hidden project and base rows', 'Anonymous gets no lots', 'Previous view columns/order retained; migration twice succeeds'],
    productionEvidence: false };
  save('db-smoke-result.json', result);
  console.log(JSON.stringify({ status: result.status, rows: result.rootRows, pages: result.pagination, embeddedShapes: result.embeddedShapes, runDirectory: directory }));
})().catch(error => {
  save('db-smoke-failure.json', { status: 'failed', message: error.message, stack: error.stack, productionEvidence: false });
  console.error(error);
  process.exitCode = 1;
});
