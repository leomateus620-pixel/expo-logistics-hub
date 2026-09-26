import fs from 'node:fs';
import { OFFICIAL_REFERENCE_DATA } from '../../src/features/commercial-map/data/officialReference2026';
import { createExporural2028Preview } from '../../src/features/commercial-map/data/exporuralReference2028';
import { scopeCommercialMapData } from '../../src/features/commercial-map/utils/areaScope';
for (const data of [OFFICIAL_REFERENCE_DATA, createExporural2028Preview()]) {
  const scoped=scopeCommercialMapData(data,'exporural');
  console.log(scoped.entities.length,scoped.lots.length,scoped.entities.filter(e=>e.classification!=='SELLABLE_LOT').map(e=>[e.publicIdentifier,e.classification]));
}
const data=createExporural2028Preview();
fs.writeFileSync('docs/exporural/2028-revisao-2026-09-25/payload_preview.json',JSON.stringify({
  warning:'LOCAL SYNTHETIC FIXTURE ONLY. DO NOT PASS TO A PERSISTENCE RPC.',
  entities:scopeCommercialMapData(data,'exporural').entities,
  lots:scopeCommercialMapData(data,'exporural').lots,
},null,2));
