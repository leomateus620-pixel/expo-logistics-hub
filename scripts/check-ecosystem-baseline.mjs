// Reproduce the old presentation with the exact same diagnostic input, locally.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ref = process.argv[2] || '8c4dd121';
const base = process.argv[3] || 'http://127.0.0.1:4183';
const destination = 'artifacts/ecosystem-baseline';
const evidence = 'docs/evidence/ecosystem-hierarchy';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const prefix = 'src/features/alvorada/organizational/';
for (const file of git('ls-tree', '-r', '--name-only', ref, '--', prefix).trim().split('\n')) {
  if (/\.test\./.test(file)) continue;
  const target = path.join(destination, 'organizational', file.slice(prefix.length));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, git('show', `${ref}:${file}`));
}
let fixture = await fs.readFile('scripts/alvorada-qa.tsx', 'utf8');
fixture = fixture.replaceAll('../src/', '/src/')
  .replace("import('/src/features/alvorada/FenasojaEcosystemExperience')", "import('./organizational/components/OrganizationalEcosystem')")
  .replace("import('/src/features/alvorada/organizational/resolver')", "import('./organizational/resolver')")
  .replace('{ FenasojaEcosystemExperienceView }', '{ OrganizationalEcosystem }');
const start = fixture.indexOf('  function GraphDiagnostic()');
const end = fixture.indexOf('\n});', start);
assert.ok(start >= 0 && end > start);
fixture = fixture.slice(0, start) + `  return { default: () => <div className="alvorada-overlay alvorada-overlay--ready">
    <OrganizationalEcosystem graph={graph} />
    <button className="alvorada-overlay__close" aria-label="Fechar Ecossistema Fenasoja"><X aria-hidden="true" /></button>
  </div> };` + fixture.slice(end);
fixture = "import { X } from 'lucide-react';\nimport '/src/features/alvorada/alvorada.css';\n" + fixture;
await fs.writeFile(`${destination}/baseline.tsx`, fixture);
await fs.writeFile(`${destination}/index.html`, '<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="./baseline.tsx"></script></body></html>');
await fs.mkdir(evidence, { recursive: true });
const layoutModule = source => {
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports.calculateOrganizationalLayout;
};
const oldLayout = layoutModule(git('show', `${ref}:${prefix}layout/organizationalLayout.ts`));
const newLayout = layoutModule(await fs.readFile(`${prefix}layout/organizationalLayout.ts`, 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const reports = [];
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844], ['landscape', 844, 390]]) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: name !== 'desktop', hasTouch: name !== 'desktop' });
  await page.goto(`${base}/${destination}/index.html?graph`);
  await page.locator('.org-node').first().waitFor();
  await page.waitForTimeout(1400);
  const oldGraph = await page.evaluate(() => window.__alvoradaQaGraph);
  await page.screenshot({ path: `${evidence}/${name}-before.png` });
  if (name === 'desktop') {
    await page.locator('.org-node[data-node-type="central-commission"] button').click();
    await page.waitForTimeout(650);
    await page.screenshot({ path: `${evidence}/central-before.png` });
  }
  await page.goto(`${base}/scripts/alvorada-qa.html?graph`);
  await page.locator('.org-node').first().waitFor();
  await page.waitForTimeout(1400);
  const newGraph = await page.evaluate(() => window.__alvoradaQaGraph);
  const lower = graph => graph.nodes.filter(n => n.authorityLevel === 4);
  assert.deepEqual(lower(newGraph), lower(oldGraph));
  assert.deepEqual(newGraph.people, oldGraph.people);
  const oldPositions = oldLayout(oldGraph.nodes, oldGraph.edges, { viewportWidth: width, viewportHeight: height });
  const newPositions = newLayout(newGraph.nodes, newGraph.edges, { viewportWidth: width, viewportHeight: height });
  const order = layout => Array.from(layout.nodes.filter(n => n.node.authorityLevel === 4), n => n.node.id);
  assert.deepEqual(order(newPositions), order(oldPositions));
  const dx = (newPositions.bounds.width - oldPositions.bounds.width) / 2;
  for (const n of lower(newGraph)) assert.equal(newPositions.nodeById.get(n.id).x - oldPositions.nodeById.get(n.id).x, dx);
  reports.push({ name, viewport: { width, height }, lowerNodesUnchanged: lower(newGraph).length, peopleUnchanged: Object.keys(newGraph.people).length, orderPreserved: true, horizontalTranslation: dx });
  await page.close();
}
await browser.close();
await fs.writeFile(`${evidence}/baseline-audit.json`, JSON.stringify({ baselineCommit: git('rev-parse', ref).trim(), reports }, null, 2));
console.log('Baseline comparison passed: people, lower nodes, responsibilities, ordering and columns preserved.');
