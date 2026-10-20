/** Rasterize actual React SVG artifacts. This is not browser automation or a
 * screenshot: browser/fullscreen layout must be verified separately. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { default: sharp } = process.env.SHARP_MODULE ? await import(pathToFileURL(process.env.SHARP_MODULE).href) : await import('sharp');
const output = path.resolve(process.env.OCCUPANCY_QA_OUTPUT || 'docs/validation/pavilion-company-grouping');
const checks = [];
const lots = svg => [...svg.matchAll(/<path\b[^>]*data-entity-id="([^"]+)"[^>]*>/g)].map(([tag, id]) => ({
  id, path: tag.match(/\bd="([^"]+)"/)[1], status: tag.match(/data-status="([^"]+)"/)[1], fill: tag.match(/\bfill="([^"]+)"/)[1],
})).sort((a, b) => a.id.localeCompare(b.id));
for (const pavilion of [12, 13]) {
  const baseline = await fs.readFile(path.join(output, 'baseline-svg', `pavilion-${pavilion}-default.svg`), 'utf8');
  const current = await fs.readFile(path.join(output, `pavilion-${pavilion}-default.svg`), 'utf8');
  assert.deepEqual(lots(current), lots(baseline));
  const beforeLabels = [...baseline.matchAll(/class="pavilion-annotation-label"/g)].length;
  const afterLabels = [...current.matchAll(/data-company-label="/g)].length;
  assert.equal(afterLabels, pavilion === 12 ? 3 : 2);
  const labelIds = [...current.matchAll(/data-company-label="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(labelIds).size, afterLabels);
  for (const [name, svg] of [['before', baseline], ['after', current]]) {
    await sharp(Buffer.from(svg)).flatten({ background: '#f5f7f3' }).png().toFile(path.join(output, `${name}-pavilion-${pavilion}-svg.png`));
  }
  checks.push({ pavilion, officialLots: lots(current).length, beforeLabels, afterLabels, exactLotIdsPathsStatusAndFillsPreserved: true, uniqueCompanyLabels: true });
}
for (const file of await fs.readdir(output)) {
  if (file.endsWith('-contract.svg')) await sharp(path.join(output, file)).flatten({ background: '#f5f7f3' }).png().toFile(path.join(output, file.replace('.svg', '.png')));
}
const report = { passed: true, boundary: 'Actual SVG emitted from mounted React components in jsdom and rasterized by librsvg. Does not validate browser CSS layout, responsive sizing or screenshots.', checks };
await fs.writeFile(path.join(output, 'svg-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
