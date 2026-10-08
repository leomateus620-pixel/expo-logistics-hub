// Audit the presentation-only diff against the merged PR #189 baseline.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const base = process.env.DASHBOARD_BASE_REF || '4fb76b4ceab1cabded26be99b2097496bcc8820f';
const git = (...args) => execFileSync('git', args, { encoding:'utf8',windowsHide:true }).trim();
const normalize = value => value.replaceAll('\r\n','\n');
const hash = value => crypto.createHash('sha256').update(normalize(value)).digest('hex');
const directory = 'src/features/commercial-map/dashboard/';
const allowed = new Set(['CommercialDashboardCharts.tsx','CommercialDashboardPavilion.tsx','CommercialDashboardSpaces.tsx',
  'CommercialMiniMap.tsx','commercialDashboardGeometry.ts','commercialDashboardPavilionGeometry.ts',
  'CommercialDashboardLotContextCard.tsx','commercialDashboardPavilionFrame.ts',
  'commercial-dashboard-pavilion-inspection.css','commercial-dashboard-workspace-analysis.css'].map(file => directory+file));
const changed = [...new Set([...git('diff','--name-only',base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')])].filter(Boolean);
const production = changed.filter(file => file.startsWith('src/') && !file.startsWith('src/test/'));
assert(production.every(file => allowed.has(file)),`Unexpected production files: ${production.filter(file => !allowed.has(file))}`);
const forbidden = changed.filter(file => /^(supabase\/|src\/integrations\/supabase\/)/.test(file)
  || /(^|\/)(package(-lock)?\.json|vite\.config\.ts|AGENTS\.md)$/.test(file));
assert.deepEqual(forbidden,[]);
const protectedFiles = [
  directory+'commercialDashboardAnalytics.ts',directory+'commercialDashboardClassification.ts',directory+'commercialDashboardTypes.ts',
  directory+'commercial-dashboard.css',directory+'commercial-dashboard-overview.css',directory+'commercial-dashboard-scope-cards.css',
  directory+'CommercialDashboard.tsx',directory+'CommercialDashboardScopeCard.tsx',directory+'CommercialDashboardAreaCard.tsx',
  directory+'CommercialDashboardSalesSummary.tsx',directory+'CommercialSalesProgress.tsx',directory+'useCommercialDashboardSync.ts',
  'src/features/commercial-map/CommercialMapPage.tsx','src/features/commercial-map/types.ts',
  'src/features/commercial-map/data/officialReference2026.ts','src/features/commercial-map/data/commercialPavilionReference.ts',
  'src/features/commercial-map/data/pavilion8CommercialReference.ts','src/features/commercial-map/data/pavilion13CommercialReference.ts',
  'src/features/commercial-map/utils/commercialPavilions.ts','src/features/commercial-map/utils/commercialPavilionModules.ts',
  'src/features/commercial-map/utils/lotPricing2028.ts','src/features/commercial-map/utils/lotTooltipPresentation.ts',
  'src/features/commercial-map/hooks/useCommercialMap.ts','src/features/commercial-map/services/commercialMapService.ts',
];
const proof = protectedFiles.map(file => {
  const before=hash(git('show',`${base}:${file}`)),after=hash(fs.readFileSync(file,'utf8').trim());
  assert.equal(after,before,`${file} must remain unchanged`);
  return {file,before,after,unchanged:true};
});
const portions = [
  {file:directory+'CommercialDashboardCharts.tsx',marker:'export function CommercialDashboardValueChart('},
  {file:directory+'commercialDashboardGeometry.ts',marker:'/** Size labels'},
].map(({file,marker}) => {
  const before = normalize(git('show',`${base}:${file}`)).split(marker)[1];
  const after = normalize(fs.readFileSync(file,'utf8').trim()).split(marker)[1];
  assert(before && after); assert.equal(after,before,`${file}: protected implementation`);
  return {file,from:marker,sha256:hash(after),unchanged:true};
});
const out=path.resolve('docs/validation/dashboard-pavilion-inspection/scope-proof.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify({base,production,forbidden,protectedFiles:proof,protectedImplementations:portions,
  constraints:{databaseUnchanged:true,supabaseUnchanged:true,routesUnchanged:true,commercialRulesUnchanged:true,pricingResolutionUnchanged:true,refreshMechanismUnchanged:true,externalProjectionUnchanged:true,financialChartUnchanged:true}},null,2));
console.log(`Presentation scope verified: ${production.length} production files; ${proof.length} protected files; ${portions.length} protected implementations.`);
