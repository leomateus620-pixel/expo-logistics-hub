const fs = require('node:fs');
const path = require('node:path');

const folder = path.resolve(process.env.VISIT_OUTPUT || 'docs/validation/visit-vehicles/regression');
const report = JSON.parse(fs.readFileSync(path.join(folder, 'cycles.json'), 'utf8'));
const first = report.rows[0], last = report.rows.at(-1);
if (!first || !last) throw Error('No visit cycle samples');
const delta = {
  geometries: last.returned.environment.geometries - first.returned.environment.geometries,
  textures: last.returned.environment.textures - first.returned.environment.textures,
  programs: last.returned.environment.programs - first.returned.environment.programs,
  nodes: last.dom.nodes - first.dom.nodes,
  listeners: last.dom.jsEventListeners - first.dom.jsEventListeners,
  heapBytes: last.heap.usedSize - first.heap.usedSize,
};
const passed = report.rows.length >= 20 && !report.errors.length
  && delta.geometries <= 2 && delta.textures <= 1 && delta.programs <= 1
  && delta.nodes === 0 && delta.listeners === 0
  && report.rows.every(row => row.returned.identity.canvasMounts === 1
    && row.returned.identity.rendererCreates === 1 && row.returned.identity.controlsCreates === 1);
const result = { passed, cycles: report.rows.length, delta, first: {
  geometries: first.returned.environment.geometries, textures: first.returned.environment.textures,
  programs: first.returned.environment.programs, heapBytes: first.heap.usedSize,
}, last: {
  geometries: last.returned.environment.geometries, textures: last.returned.environment.textures,
  programs: last.returned.environment.programs, heapBytes: last.heap.usedSize,
} };
fs.writeFileSync(path.join(folder, 'cycle-audit.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (!passed) process.exitCode = 1;
