import fs from 'node:fs';
import { OFFICIAL_REFERENCE_DATA } from '../../src/features/commercial-map/data/officialReference2026';
const data = OFFICIAL_REFERENCE_DATA;
const identifiers = new Set(['B7', 'B8', 'D3', 'RUA-UBIRETAMA-LATERAL-R55', 'RUA-LESTE-EXPORURAL']);
fs.writeFileSync('docs/exporural/2028-revisao-2026-09-25/referencia_anterior.json', JSON.stringify({
  provenance: 'Repository reference at 552f06fe86d928921fe3e9fa455b8972bfa3dca9; not a database snapshot',
  project: data.project,
  entities: data.entities.filter(e => e.metadata.areaCode === 'EXPORURAL' || identifiers.has(e.publicIdentifier)),
  lots: data.lots.filter(l => l.block === 'R' || l.block === 'S'),
}, null, 2) + '\n');
