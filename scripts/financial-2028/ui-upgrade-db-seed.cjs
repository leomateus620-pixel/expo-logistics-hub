/* Same authentic fixture for before/after captures. All financial writes use existing RPCs. */
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
const psql = option('--psql'), port = option('--port');
assert(path.isAbsolute(psql) && /^\d+$/.test(port), 'Explicit local PostgreSQL runtime required.');
const output = path.resolve(args.includes('--output') ? option('--output') : 'docs/validation/financial-ui-upgrade');
const expenseSeed = spawnSync(process.execPath, [path.join(__dirname, 'expenses-db-seed.cjs'), '--psql', psql, '--port', port], { encoding: 'utf8' });
assert.equal(expenseSeed.status, 0, expenseSeed.stderr);
const org = 'a0000000-0000-0000-0000-000000000001';
const lit = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${lit(JSON.stringify(value))}::jsonb`;
function run(sql) {
  const result = spawnSync(psql, ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'financial_expenses_qa', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    input: `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';\n${sql};\nCOMMIT;`, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}
const edition = run(`SELECT json_build_object('id',id) FROM financial_editions WHERE org_id='${org}' AND code=2028`).id;
const save = (entity, payload) => run(`SELECT financial_save('${org}',${lit(entity)},${json({ edition_id: edition, ...payload })},NULL,'${randomUUID()}',NULL)`);
const categories = ['Bilheteria e estacionamento', 'Lei Rouanet', 'Eventos', 'Gastronomia', 'Outras receitas'].map(name => save('category', { domain: 'receita', name }));
const fixtures = [
  { description: 'QA local · Bilheteria e estacionamento', category_id: categories[0].id, funding_type: 'recurso_livre', status: 'confirmada', projected_cents: 18000000, confirmed_cents: 16000000, counterparty: 'Operação da feira (QA local)', due_date: '2028-06-01' },
  { description: 'QA local · Projeto cultural Lei Rouanet', category_id: categories[1].id, funding_type: 'lei_rouanet', status: 'confirmada', projected_cents: 12000000, confirmed_cents: 9000000, counterparty: 'Incentivador cultural (QA local)', due_date: '2026-10-01' },
  { description: 'QA local · Plano de Trabalho Municipal', category_id: categories[4].id, funding_type: 'prefeitura_plano_trabalho', status: 'confirmada', projected_cents: 8000000, confirmed_cents: 8000000, counterparty: 'Município (QA local)', due_date: '2028-05-05' },
  { description: 'QA local · Operação de gastronomia', category_id: categories[3].id, funding_type: 'recurso_livre', status: 'projetada', projected_cents: 4500000, due_date: '2028-06-05' },
  { description: 'QA local · Eventos complementares', category_id: categories[2].id, funding_type: 'misto', status: 'projetada', projected_cents: 2000000, due_date: '2028-06-06' },
  { description: 'QA local · Ação cancelada preservada', category_id: categories[4].id, funding_type: 'nao_identificado', status: 'cancelada', projected_cents: 1000000 },
];
const revenues = fixtures.map(payload => save('revenue', { competence_date: '2028-05-01', responsible_name: 'Equipe financeira (QA local)', ...payload }));
const sponsorships = [
  { name: 'QA local · Cooperativa Ouro', tier: 'ouro', negotiation_status: 'confirmado', projected_free_cents: 14000000, projected_rouanet_cents: 6000000, confirmed_free_cents: 10000000, confirmed_rouanet_cents: 5000000, due_date: '2026-10-02' },
  { name: 'QA local · Indústria Prata', tier: 'prata', negotiation_status: 'confirmado', projected_free_cents: 7500000, confirmed_free_cents: 6000000, due_date: '2028-06-10' },
  { name: 'QA local · Parceiro em prospecção', tier: 'bronze', negotiation_status: 'prospeccao', projected_free_cents: 5000000 },
].map(payload => save('sponsorship', { responsible_name: 'Equipe de patrocínios (QA local)', ...payload }));
const obligation = record => run(`SELECT json_build_object('id',id) FROM financial_obligations WHERE source_id='${record.id}'`);
const receipt = (record, amount) => run(`SELECT financial_record_movement('${org}',${json({ edition_id: edition, kind: 'recebimento', direction: 'entrada', amount_cents: amount, occurred_on: '2028-05-09' })},${json([{ obligation_id: obligation(record).id, amount_cents: amount }])},'${randomUUID()}')`);
receipt(revenues[0], 6000000);
receipt(revenues[1], 3500000);
receipt(revenues[2], 8000000);
receipt(sponsorships[0], 6000000);
// A receipt and its complete reversal make net settlement visibly different from gross inflow.
const reversed = receipt(revenues[0], 1000000);
run(`SELECT financial_reverse_movement('${org}','${reversed.id}','QA local · Estorno de recebimento','2028-05-10','${randomUUID()}')`);
const summary = run(`SELECT financial_edition_summary('${org}','${edition}')`);
assert.deepEqual(summary.revenues, { projected_cents: 77000000, confirmed_cents: 54000000, received_cents: 23500000, receivable_open_cents: 30500000, overdue_count: 2 });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'seed-summary.json'), JSON.stringify({ boundary: 'Synthetic loopback QA; financial RPCs, obligations and movements are real.', editionId: edition, revenues, sponsorships, summary }, null, 2));
console.log(JSON.stringify({ expenses: 30, manualRevenues: revenues.length, sponsorships: sponsorships.length, totals: summary.revenues }));
