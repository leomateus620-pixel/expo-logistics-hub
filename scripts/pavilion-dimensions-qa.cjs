// Production scene and camera with local canonical fixtures; no backend writes.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.argv[2] || 'after';
const output = path.resolve('docs/validation/pavilion-dimensions', phase);
const pavilions = { B1: 1, B6: 3, B8: 5, B4: 8, B3: 12, B2: 14 };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  const matrixPath = path.join(output, 'matrix.json');
  const report = (process.env.QA_PROFILE || process.env.QA_PAVILION) && fs.existsSync(matrixPath)
    ? JSON.parse(fs.readFileSync(matrixPath)).filter(row => (process.env.QA_PROFILE && row.profile !== process.env.QA_PROFILE) || (process.env.QA_PAVILION && row.id !== process.env.QA_PAVILION)) : [];
  try {
    for (const [profile, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }).filter(([name]) => !process.env.QA_PROFILE || name === process.env.QA_PROFILE)) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: profile === 'mobile', hasTouch: profile === 'mobile' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:4201/scripts/pavilion-plan-qa.html?pavilion=B1', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true', null, { timeout: 120000 });
      for (const [id, number] of Object.entries(pavilions).filter(([key]) => !process.env.QA_PAVILION || key === process.env.QA_PAVILION)) {
        await page.getByLabel('Pavilhão QA').selectOption(id);
        await page.waitForTimeout(1000);
        for (const [action, label] of [['vertical', 'Visualizar pavilhão na vertical'], ['horizontal', 'Visualizar pavilhão na horizontal'], ['inspect', 'Aproximar lotes']]) {
          await page.getByRole('button', { name: label, exact: true }).click();
          await page.waitForTimeout(1200);
          const snapshot = await page.evaluate(async id => {
            const { COMMERCIAL_PAVILION_MODULE_PLANS: plans } = await import('/src/features/commercial-map/utils/commercialPavilionModules.ts');
            const { OFFICIAL_REFERENCE_DATA: data } = await import('/src/features/commercial-map/data/officialReference2026.ts');
            const entity = data.entities.find(e => e.publicIdentifier === id);
            const entities = data.entities.filter(e => e.id === entity.id || e.parentEntityId === entity.id);
            const ids = new Set(entities.map(e => e.id));
            return {
              canvasCount: document.querySelectorAll('canvas').length,
              canvas: { ...document.querySelector('canvas').dataset },
              resources: window.__commercialMapRuntimeDiagnostics?.capture(),
              cells: plans[id].cells, entities, lots: data.lots.filter(l => ids.has(l.entityId)),
              annotations: [...document.querySelectorAll('[data-dimension-id]')].map(e => ({ id: e.dataset.dimensionId, visible: getComputedStyle(e).display !== 'none', text: e.textContent, rect: e.getBoundingClientRect().toJSON() })),
              accesses: [...document.querySelectorAll('[data-wayfinding-id]')].map(e => ({ id: e.dataset.wayfindingId, edge: e.dataset.wayfindingEdge, kind: e.dataset.wayfindingKind, rect: e.getBoundingClientRect().toJSON() })),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          }, id);
          const commercial = { cellCount: snapshot.cells.length, nominalArea: snapshot.cells.reduce((total, cell) => total + (cell.areaM2 || 0), 0) };
          for (const field of ['cells', 'entities', 'lots']) {
            commercial[field + 'Hash'] = createHash('sha256').update(JSON.stringify(snapshot[field])).digest('hex');
            delete snapshot[field];
          }
          snapshot.commercial = commercial;
          await page.screenshot({ path: path.join(output, `${profile}-p${number}-${action}.png`) });
          report.push({ profile, viewport, id, number, action, errors: [...errors], ...snapshot });
          fs.writeFileSync(path.join(output, 'matrix.json'), JSON.stringify(report, null, 2));
          console.log(`${phase} ${profile} P${number} ${action}: ${commercial.cellCount} cells, ${snapshot.annotations.filter(a => a.visible).map(a => a.text).join('; ')}, ${snapshot.accesses.length} accesses`);
        }
      }
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
