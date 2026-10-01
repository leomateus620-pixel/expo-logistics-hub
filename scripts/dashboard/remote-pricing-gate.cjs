// Read-only schema check. limit=0 requests no inventory rows or sale amounts.
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const env = fs.existsSync('.env') ? Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2')];
    })) : {};
  const origin = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !key) throw new Error('Configure the existing Supabase URL and public key; do not use admin credentials for this check.');

  const service = fs.readFileSync('src/features/commercial-map/services/commercialMapService.ts', 'utf8');
  const embed = service.match(/const OFFICIAL_PRICING_EMBED = `([^`]+)`/)[1];
  const select = service.match(/export const COMMERCIAL_LOT_SELECT = `([^`]+)`/)[1]
    .replace('${OFFICIAL_PRICING_EMBED}', embed);
  const probes = [];
  for (const [name, table, projection] of [
    ['pricing-entity-column', 'commercial_lot_pricing_2028', 'entity_id'],
    ['shared-map-relationship', 'commercial_lots', select],
  ]) {
    const url = new URL(`/rest/v1/${table}`, origin);
    // Supabase .select() removes unquoted whitespace before sending this projection.
    url.searchParams.set('select', projection.replace(/\s+/g, ''));
    url.searchParams.set('limit', '0');
    if (table === 'commercial_lots') url.searchParams.set('financial_entity.pricing.limit', '1');
    const response = await fetch(url, { headers: { apikey: key } });
    const payload = await response.json();
    probes.push({ name, status: response.status, ready: response.ok && Array.isArray(payload) && payload.length === 0,
      ...(!response.ok ? { code: payload.code || 'HTTP_ERROR', message: payload.message || 'Schema check failed' } : {}) });
  }
  const report = { checkedAt: new Date().toISOString(), readOnly: true, rowLimit: 0,
    productionRowsRead: 0, ready: probes.every(probe => probe.ready), probes };
  const output = process.argv[2];
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}
main().catch(() => { console.error('Read-only pricing schema check could not complete. No credentials or response bodies were logged.'); process.exitCode = 1; });
