// Lossless archival of large raw reports; never alters or removes the originals.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const root = path.join(__dirname, 'evidence');
const rows = [];
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (!entry.name.endsWith('.json') || fs.statSync(file).size < 150000) continue;
    const raw = fs.readFileSync(file), packed = zlib.gzipSync(raw, { level: 9 });
    if (!zlib.gunzipSync(packed).equals(raw)) throw Error('Evidence round-trip failed: ' + file);
    fs.writeFileSync(file + '.gz', packed);
    rows.push({ source: path.relative(root, file).replaceAll('\\', '/'), rawBytes: raw.length,
      gzipBytes: packed.length, sha256: crypto.createHash('sha256').update(raw).digest('hex') });
  }
}
visit(root);
fs.writeFileSync(path.join(root, 'archives.json'), JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ files: rows.length, rawBytes: rows.reduce((n, r) => n + r.rawBytes, 0),
  gzipBytes: rows.reduce((n, r) => n + r.gzipBytes, 0) }));
