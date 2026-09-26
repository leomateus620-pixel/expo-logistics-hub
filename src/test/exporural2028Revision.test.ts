import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import clipping from 'polygon-clipping';
import { OFFICIAL_REFERENCE_DATA, OFFICIAL_REFERENCE_REVISION } from '@/features/commercial-map/data/officialReference2026';
import { EXPORURAL_GEOMETRY_REVISION } from '@/features/commercial-map/data/exporuralReference2026';
import { createExporural2028Preview, EXPORURAL_2028_MANIFEST, EXPORURAL_2028_INVENTORY, EXPORURAL_2028_REVISION } from '@/features/commercial-map/data/exporuralReference2028';
import shapes from '@/features/commercial-map/data/exporural2028/geometrias_lotes.json';
import roads from '@/features/commercial-map/data/exporural2028/geometria_vias.json';
import bands from '@/features/commercial-map/data/exporural2028/topologia.json';
import { validateGeometry, polygonAreaMapUnits } from '@/features/commercial-map/utils/geometry';
import { scopeCommercialMapData, exporuralMetrics } from '@/features/commercial-map/utils/areaScope';
import { isCommissionInventoryConsistent } from '@/features/commercial-map/utils/commissionInventory';
import { reconcileExporuralReference } from '@/features/commercial-map/data/reconcileExporuralReference';
import { buildEntityExplorerIndex, filterAndSortEntityExplorerItems } from '@/features/commercial-map/utils/entityExplorer';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { changedExporuralSelections, exporuralSelectionSnapshot } from '@/features/commercial-map/utils/exporuralRevisionSelection';
import { buildExporuralLandscape } from '@/features/commercial-map/utils/exporuralLandscape';
import { hasRevisedExporuralNumbers, lotNumberAnchor } from '@/features/commercial-map/utils/exporuralRevisionPresentation';
import type { Coordinate, CommercialMapData } from '@/features/commercial-map/types';

const after = createExporural2028Preview();
const scope = scopeCommercialMapData(after, 'exporural');
const byCode = new Map(after.entities.map(e => [e.publicIdentifier, e]));
const folder = 'docs/exporural/2028-revisao-2026-09-25/';
function inside([x,y]: number[], ring: number[][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi,yi] = ring[i], [xj,yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) hit = !hit;
  }
  return hit;
}
function overlap(a: number[][][], b: number[][][]) {
  return clipping.intersection(a as Coordinate[][], b as Coordinate[][]).reduce((total, polygon) =>
    total + polygonAreaMapUnits({ coordinates: polygon as Coordinate[][] }), 0);
}
function cents(value: string) { return BigInt(value.replace('.', '')); }

describe('proposta Exporural 2028, isolada da referência persistida', () => {
  it('numera somente a revisão nova e usa a âncora interna da mesma entidade', () => {
    expect(OFFICIAL_REFERENCE_DATA.entities.filter(hasRevisedExporuralNumbers)).toHaveLength(0);
    const numbered = after.entities.filter(hasRevisedExporuralNumbers);
    expect(numbered).toHaveLength(100);
    for (const entity of numbered) {
      expect(lotNumberAnchor(entity)).toEqual(entity.metadata.labelAnchor);
      expect(inside(lotNumberAnchor(entity), entity.geometry.coordinates[0])).toBe(true);
    }
  });
  it('contém 100 códigos explícitos e somas decimais exatas, sem R66/S36/área sem número', () => {
    const rows = EXPORURAL_2028_MANIFEST;
    expect(rows).toHaveLength(100);
    expect(new Set(rows.map(r => r.public_identifier)).size).toBe(100);
    for (const [block,count,area] of [['R',65,2956426n],['S',35,1620353n]] as const) {
      const entries = rows.filter(r => r.block === block);
      expect(entries.map(r => r.public_identifier)).toEqual(Array.from({length:count},(_,i) => `Q-${block}-${String(i+1).padStart(2,'0')}`));
      expect(entries.reduce((n,r) => n + cents(r.official_area_sqm),0n)).toBe(area);
    }
    expect(rows.reduce((n,r) => n + cents(r.official_area_sqm),0n)).toBe(4576779n);
    expect(rows.some(r => r.official_area_sqm === '568.78')).toBe(false);
    expect(JSON.parse(fs.readFileSync(folder+'manifesto_lotes.json','utf8'))).toEqual(rows);
  });
  it('preserva a revisão global, não modifica banco e rejeita fixture sobre dados persistidos', () => {
    expect(OFFICIAL_REFERENCE_REVISION).toBe('2026.4');
    expect(EXPORURAL_GEOMETRY_REVISION).toBe('2026.4-exporural.1');
    const persisted: CommercialMapData = { ...OFFICIAL_REFERENCE_DATA, source:'database' };
    expect(() => createExporural2028Preview(persisted)).toThrow('REJECTS_PERSISTED_DATA');
    const read = reconcileExporuralReference(persisted);
    expect(read.entities).toBe(persisted.entities);
    expect(read.lots).toBe(persisted.lots);
    expect(read.lots.find(l => l.publicIdentifier === 'Q-R-56')?.officialAreaSqm).toBe(471);
    expect(after.project).toBe(OFFICIAL_REFERENCE_DATA.project);
    expect(after.calibration).toBe(OFFICIAL_REFERENCE_DATA.calibration);
  });
  it('é determinística, somente leitura e não reutiliza identidade nominal para R56', () => {
    expect(createExporural2028Preview()).toEqual(after);
    const row = scope.lots.find(l => l.publicIdentifier === 'Q-R-56')!;
    expect(row.officialAreaSqm).toBe(249.03);
    expect(row.entityId).not.toBe(OFFICIAL_REFERENCE_DATA.lots.find(l => l.publicIdentifier === 'Q-R-56')!.entityId);
    for (const lot of scope.lots) {
      const entity = after.entities.find(e => e.id === lot.entityId)!;
      expect(entity.publicIdentifier).toBe(lot.publicIdentifier);
      expect(entity.metadata.officialAreaSqm).toBe(lot.officialAreaSqm);
      expect(entity.metadata.geometryRevision).toBe(EXPORURAL_2028_REVISION);
      expect(entity.isSellable).toBe(false);
      expect(lot).toMatchObject({status:'BLOCKED',pricingMode:'NOT_FOR_SALE',askingPrice:null,pricePerSqm:null,areaValidationStatus:'UNVALIDATED'});
    }
  });
  it('conta entidades e lotes separadamente, incluindo três superfícies viárias novas', () => {
    expect(scope.lots).toHaveLength(EXPORURAL_2028_INVENTORY.lotCount);
    expect(scope.entities).toHaveLength(EXPORURAL_2028_INVENTORY.entityCount);
    expect(scope.entities.filter(e => e.classification === 'ROAD')).toHaveLength(10);
    expect(isCommissionInventoryConsistent({ expectedEntityCount:116,expectedLotCount:100,
      entityIds:scope.entities.map(e => e.id),lotEntityIds:scope.lots.map(l => l.entityId) })).toBe(true);
    expect(isCommissionInventoryConsistent({ expectedEntityCount:113,expectedLotCount:100,
      entityIds:scope.entities.map(e => e.id),lotEntityIds:scope.lots.map(l => l.entityId) })).toBe(false);
    expect(exporuralMetrics(scope.lots).totalOfficialAreaSqm).toBeCloseTo(45767.79,6);
  });
  it('mantém todas as entidades, áreas e identidades fora do escopo por referência', () => {
    const changed = new Set([...EXPORURAL_2028_MANIFEST.map(m => m.public_identifier), ...roads.map(r => r.public_identifier), 'Q-S-36']);
    for (const entity of OFFICIAL_REFERENCE_DATA.entities.filter(e => !changed.has(e.publicIdentifier))) {
      expect(byCode.get(entity.publicIdentifier)).toBe(entity);
    }
    for (const lot of OFFICIAL_REFERENCE_DATA.lots.filter(l => !/^Q-[RS]-/.test(l.publicIdentifier))) {
      expect(after.lots.find(l => l.id === lot.id)).toBe(lot);
    }
  });
  it('valida anéis, hashes e labels internos sem equiparar área impressa à área calculada', () => {
    for (const shape of shapes) {
      const entity = byCode.get(shape.public_identifier)!;
      expect(validateGeometry(entity.geometry),shape.public_identifier).toMatchObject({valid:true});
      const ring = shape.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring.at(-1));
      expect(inside(shape.label_anchor,ring),shape.public_identifier).toBe(true);
      expect(createHash('sha256').update(JSON.stringify(shape.geometry)).digest('hex')).toBe(shape.geometry_sha256);
      expect(polygonAreaMapUnits(entity.geometry)/.15**2).toBeCloseTo(shape.calculated_area_sqm,5);
    }
  });
  it('preserva sequência geométrica de todas as faixas e a dupla R01/R02', () => {
    for (const codes of Object.values(bands)) {
      const xs = codes.map(code => shapes.find(g => g.public_identifier === code)!.label_anchor[0]);
      expect(xs).toEqual([...xs].sort((a,b) => a-b));
    }
    expect(shapes.find(g=>g.public_identifier==='Q-R-01')!.label_anchor[1]).toBeLessThan(shapes.find(g=>g.public_identifier==='Q-R-02')!.label_anchor[1]);
    expect(shapes.find(g=>g.public_identifier==='Q-R-03')!.label_anchor[1]).toBeLessThan(shapes.find(g=>g.public_identifier==='Q-R-04')!.label_anchor[1]);
  });
  it('não apresenta auto-interseção, lotes sobrepostos ou invasão de vias e estruturas protegidas', () => {
    const obstacles = [...after.entities.filter(e => e.classification === 'ROAD' || e.classification === 'PEDESTRIAN_PATH'), ...['B7','B8','D3','B37','B38','C4'].map(c=>byCode.get(c)!)];
    shapes.forEach((a,i) => {
      shapes.slice(0,i).forEach(b => expect(overlap(a.geometry.coordinates,b.geometry.coordinates),`${a.public_identifier}/${b.public_identifier}`).toBeLessThan(1e-8));
      obstacles.forEach(b => expect(overlap(a.geometry.coordinates,b.geometry.coordinates),`${a.public_identifier}/${b.publicIdentifier}`).toBeLessThan(1e-8));
    });
    roads.forEach(r=>expect(validateGeometry(byCode.get(r.public_identifier)!.geometry),r.public_identifier).toMatchObject({valid:true}));
  });
  it('conecta a transversal às três ruas e a mantém nos três pares corretos', () => {
    const road = roads.find(r=>r.public_identifier==='EXPORURAL-ACESSO-TRANSVERSAL-01')!;
    for (const code of ['RUA-BRUNO-SCHWARTZ','RUA-JOHAN-MULLER','RUA-GUSTAVO-BESSEL']) {
      expect(overlap(road.geometry.coordinates,roads.find(r=>r.public_identifier===code)!.geometry.coordinates)).toBeGreaterThan(.001);
    }
    for (const [left,right] of [['Q-S-04','Q-S-05'],['Q-R-31','Q-R-32'],['Q-R-22','Q-R-23']]) {
      const l=shapes.find(g=>g.public_identifier===left)!, r=shapes.find(g=>g.public_identifier===right)!;
      const x=(Math.max(...l.geometry.coordinates[0].map(p=>p[0]))+Math.min(...r.geometry.coordinates[0].map(p=>p[0])))/2;
      const y=(l.label_anchor[1]+r.label_anchor[1])/2;
      expect(inside([x,y],road.geometry.coordinates[0]),`${left}/${right}`).toBe(true);
    }
    expect(road.name).toBe('Via interna — denominação a confirmar');
    expect(road.documented_width_m).toBe(6);
  });
  it('mantém 15 de Novembro à esquerda da ilha e divisórias horizontais compartilhadas sem ruas', () => {
    const quinze=roads.find(r=>r.public_identifier==='RUA-15-NOVEMBRO')!;
    const passage=roads.find(r=>r.public_identifier==='EXPORURAL-PASSAGEM-INTERNA-01')!;
    expect(quinze.label_anchor[0]).toBeLessThan(shapes.find(g=>g.public_identifier==='Q-R-48')!.label_anchor[0]);
    expect(passage.label_anchor[0]).toBeGreaterThan(shapes.find(g=>g.public_identifier==='Q-R-50')!.label_anchor[0]);
    expect(passage.label_anchor[0]).toBeLessThan(shapes.find(g=>g.public_identifier==='Q-R-51')!.label_anchor[0]);
    for (let n=48;n<=54;n++) {
      const a=shapes.find(g=>g.public_identifier===`Q-R-${n}`)!.geometry.coordinates[0];
      const b=shapes.find(g=>g.public_identifier===`Q-R-${n+7}`)!.geometry.coordinates[0];
      expect(a.filter(p=>b.some(q=>p[0]===q[0]&&p[1]===q[1])).length,`divisa ${n}/${n+7}`).toBeGreaterThanOrEqual(2);
    }
    for (let n=62;n<=65;n++) {
      const p=shapes.find(g=>g.public_identifier===`Q-R-${n}`)!.geometry.coordinates[0];
      expect(new Set(p.map(q=>q[1])).size).toBeGreaterThan(2);
    }
  });
  it('cobre todos os pais e filhos sem inventar UUIDs ou identidade jurídica', () => {
    const crosswalk=JSON.parse(fs.readFileSync(folder+'crosswalk_linhagem.json','utf8'));
    expect(crosswalk.flatMap((r:{previous_codes:string[]})=>r.previous_codes).sort()).toEqual(OFFICIAL_REFERENCE_DATA.lots.filter(l=>/^[RS]$/.test(l.block ?? '')).map(l=>l.publicIdentifier).sort());
    expect(crosswalk.flatMap((r:{proposed_codes:string[]})=>r.proposed_codes).sort()).toEqual(EXPORURAL_2028_MANIFEST.map(m=>m.public_identifier).sort());
    expect(crosswalk.every((r:{status:string;production_entity_ids:null})=>r.status==='PENDING_APPROVAL'&&r.production_entity_ids===null)).toBe(true);
    expect(crosswalk.find((r:{previous_codes:string[]})=>r.previous_codes.includes('Q-R-56')).proposed_codes).toEqual(['Q-R-62']);
  });
  it('busca/lista/dashboard usam as mesmas 100 entidades e a área proposta de R56', () => {
    const index=buildEntityExplorerIndex(scope.entities,scope.lots);
    const matches=filterAndSortEntityExplorerItems(index,{query:'Q-R-56',statusFilters:[],classificationFilters:[],locationFilter:null,verificationFilters:[],sortOrder:'relevance'});
    expect(matches).toHaveLength(1);
    expect(matches[0].lot?.officialAreaSqm).toBe(249.03);
    expect(matches[0].lot?.entityId).toBe(matches[0].entity.id);
    const dashboard=buildCommercialDashboardSnapshot(scope);
    expect(dashboard.overall.totalLots).toBe(100);
    expect(dashboard.overall.totalAreaSqm).toBeCloseTo(45767.79,6);
    expect(dashboard.overall.availableAreaSqm).toBe(0);
    expect(dashboard.overall.knownValueLots).toBe(0);
  });
  it('invalida seleção por mudança física/versionada, preservando recargas idênticas', () => {
    const before=exporuralSelectionSnapshot(OFFICIAL_REFERENCE_DATA);
    expect(changedExporuralSelections(before,exporuralSelectionSnapshot(OFFICIAL_REFERENCE_DATA))).toEqual([]);
    expect(changedExporuralSelections(before,exporuralSelectionSnapshot(after))).toHaveLength(95);
    const sameIds={...OFFICIAL_REFERENCE_DATA,entities:OFFICIAL_REFERENCE_DATA.entities.map(e=>e.publicIdentifier==='Q-R-56'
      ? {...e,publicIdentifier:'Q-R-62',metadata:{...e.metadata,geometryRevision:EXPORURAL_2028_REVISION}} : e)};
    const changed=changedExporuralSelections(before,exporuralSelectionSnapshot(sameIds));
    expect(changed).toHaveLength(1);
    expect(changed[0].lotId).toBe(OFFICIAL_REFERENCE_DATA.lots.find(l=>l.publicIdentifier==='Q-R-56')!.id);
  });
  it('gera paisagismo finito e limitado com anéis rotacionados e junções adicionais', () => {
    const model=buildExporuralLandscape(after.entities);
    for (const geometry of Object.values(model)) {
      if (!geometry) continue;
      const positions=geometry.getAttribute('position');
      expect(positions.count).toBeLessThan(150000);
      let finite=true,maxX=0,maxZ=0;
      for (let i=0;i<positions.count;i++) {
        finite &&= Number.isFinite(positions.getX(i)+positions.getY(i)+positions.getZ(i));
        maxX=Math.max(maxX,Math.abs(positions.getX(i)));
        maxZ=Math.max(maxZ,Math.abs(positions.getZ(i)));
      }
      expect(finite).toBe(true);
      expect(maxX).toBeLessThan(65);
      expect(maxZ).toBeLessThan(45);
      geometry.dispose();
    }
  });
});
