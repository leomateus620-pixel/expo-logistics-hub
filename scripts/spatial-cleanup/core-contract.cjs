const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.resolve(process.argv[2] || '.');
const { outputFiles } = require('esbuild').buildSync({ stdin: {
  contents: "import {OFFICIAL_REFERENCE_DATA} from './src/features/commercial-map/data/officialReference2026'; module.exports = OFFICIAL_REFERENCE_DATA;",
  resolveDir: root,
}, bundle: true, platform: 'node', format: 'cjs', write: false });
const result = { exports: {} };
vm.runInNewContext(outputFiles[0].text, { module: result, exports: result.exports, require });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contract = { base: '42e89d1b', entities: result.exports.entities.map(e => ({ id: e.publicIdentifier, sha256: hash(e) })), lots: hash(result.exports.lots), calibration: hash(result.exports.calibration) };
fs.writeFileSync('docs/validation/spatial-cleanup/core-baseline.json', JSON.stringify(contract, null, 2));
console.log(`Recorded ${contract.entities.length} canonical entity records, lot and calibration hashes`);
