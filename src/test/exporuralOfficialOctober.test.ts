import { describe, expect, it } from 'vitest';
import clipping from 'polygon-clipping';
import manifest from '@/features/commercial-map/data/exporural2028October/manifest.json';
import lots from '@/features/commercial-map/data/exporural2028October/lots.json';
import roads from '@/features/commercial-map/data/exporural2028October/roads.json';
import before from '../../docs/exporural/2028-revisao-2026-10-20/expected-before.json';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';
import { assertCommercialSnapshotRevision } from '@/features/commercial-map/utils/commercialSnapshotRevision';
import { getCommercialMiniMapGeometry } from '@/features/commercial-map/dashboard/commercialDashboardGeometry';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { changedExporuralSelections, exporuralSelectionSnapshot } from '@/features/commercial-map/utils/exporuralRevisionSelection';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT, withExporuralCadastralRoadOwnership } from '@/features/commercial-map/utils/parkAccessSpatialPlanAdapter';
import { buildRoadNetworkGeometries, disposeRoadNetworkGeometries } from '@/features/commercial-map/utils/roadInfrastructure';
import { prepareTerritorialOrientation, layoutTerritorialOrientation } from '@/features/commercial-map/utils/territorialOrientation';
import type { CommercialLot, CommercialMapData, Coordinate, MapEntity } from '@/features/commercial-map/types';

const revision = '2028-exporural-2026-10-20.1';
const poly = (coordinates: number[][][]) => coordinates as Coordinate[][];
const area = (rings: number[][][]) => Math.abs(rings[0].reduce((sum, p, i, ring) => {
  const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2);
const cents = (area: number, rate: number) => Math.round(Math.round(area * 100) * Math.round(rate * 100) / 100) / 100;

/** Synthetic test scenario, using persisted crosswalk UUIDs and the canonical
 * dashboard path. This is never imported by an application route. */
function snapshot(): CommercialMapData {
  const template = OFFICIAL_REFERENCE_DATA.lots[0];
  const entityTemplate = OFFICIAL_REFERENCE_DATA.entities.find(e => e.id === template.entityId)!;
  const entities: MapEntity[] = manifest.map(row => {
    const current = lots.find(t => t.code === row.code);
    const previous = OFFICIAL_REFERENCE_DATA.entities.find(e => e.publicIdentifier === row.code) ?? entityTemplate;
    return { ...previous, id: current?.entity_id ?? `test:${row.code}`, segmentId: 'exporural', segmentSource: 'database',
      publicIdentifier: row.code, metadata: { ...previous.metadata, areaCode: 'EXPORURAL', geometryRevision: revision,
        labelAnchor: current?.label_anchor }, geometry: { ...previous.geometry,
          coordinates: current ? poly(current.geometry.coordinates) : previous.geometry.coordinates } };
  });
  const records: CommercialLot[] = manifest.map((row, index) => {
    const current = lots.find(t => t.code === row.code), entity = entities[index];
    const id = current?.lot_id ?? `lot:test:${row.code}`;
    const rate = row.block === 'S' ? 14 : row.lot_number <= 12 ? 27.5 : row.lot_number <= 39 ? 24.2 : 16.5;
    const second = row.block === 'S' ? 15.4 : row.lot_number <= 12 ? 30.25 : row.lot_number <= 39 ? 26.6 : 18.15;
    return { ...template, id, entityId: entity.id, block: row.block, publicIdentifier: row.code,
      lotNumber: String(row.lot_number), officialAreaSqm: Number(row.official_area_sqm), status: 'AVAILABLE', archivedAt: null,
      sales: [], officialPricing2028: { lotId: id, entityId: entity.id, resolutionStatus: 'OK',
        renovacaoTotal: cents(Number(row.official_area_sqm), rate), segundaTotal: cents(Number(row.official_area_sqm), second),
        renovacaoIsManual: false, segundaIsManual: false } };
  });
  return { ...OFFICIAL_REFERENCE_DATA, source: 'database', entities, lots: records };
}

describe('official ExpoRural 20/10/2026 revision', () => {
  it('transcribes 107 numbered parcels and all 40 affected areas without folding in the unnumbered area', () => {
    expect(manifest).toHaveLength(107); expect(new Set(manifest.map(x => x.code)).size).toBe(107);
    expect(manifest.filter(x => x.block === 'R')).toHaveLength(72);
    expect(manifest.filter(x => x.block === 'S')).toHaveLength(35);
    expect(manifest.reduce((sum, x) => sum + Math.round(Number(x.official_area_sqm) * 100), 0)).toBe(4555786);
    expect(lots).toHaveLength(40);
    for (const lot of lots) expect(lot.official_area_sqm).toBe(manifest.find(x => x.code === lot.code)!.official_area_sqm);
    expect(lots.find(x => x.code === 'Q-R-47')!.official_area_sqm).toBe('333.34');
    expect(lots.find(x => x.code === 'Q-S-12')!.official_area_sqm).toBe('376.85');
    expect(lots.find(x => x.code === 'Q-S-14')!.official_area_sqm).toBe('506.30');
  });

  it('uses individual vector boundaries, interior anchors and disjoint commercial faces', () => {
    for (const [i, lot] of lots.entries()) {
      const ring = poly(lot.geometry.coordinates)[0];
      expect(ring[0]).toEqual(ring.at(-1));
      expect(pointInPolygon(lot.label_anchor as Coordinate, ring)).toBe(true);
      for (const other of lots.slice(0, i)) {
        const intersection = clipping.intersection(poly(lot.geometry.coordinates), poly(other.geometry.coordinates));
        expect(intersection.reduce((sum, p) => sum + area(p), 0)).toBeLessThan(1e-7);
      }
      for (const road of roads) {
        const intersection = clipping.intersection(poly(lot.geometry.coordinates), poly(road.geometry.coordinates));
        expect(intersection.reduce((sum, p) => sum + area(p), 0)).toBeLessThan(1e-7);
      }
    }
    const lateral = lots.find(x => x.code === 'Q-R-47')!;
    expect(lateral.geometry.coordinates[0].length).toBeGreaterThan(10);
    expect(lots.filter(x => x.code === lateral.code)).toHaveLength(1);
    expect(lots.some(x => x.origins.length > 1)).toBe(true);
  });

  it('retains the four lower UUIDs, geometry and area exactly, and the signed sale UUID becomes R/59', () => {
    for (let n = 69; n <= 72; n++) {
      const lot = lots.find(x => x.code === `Q-R-${n}`)!;
      const original = before.find(x => x.lot_id === lot.lot_id)!;
      expect(lot.previous_code).toBe(`Q-R-${n - 7}`);
      expect(lot.geometry).toEqual(original.geometry);
      expect(lot.official_area_sqm).toBe('471.00');
      expect(lot.preserve_geometry).toBe(true);
    }
    expect(lots.find(x => x.code === 'Q-R-59')!.lot_id).toBe('137a7fe9-1724-42b0-adc6-64c46b91a7e8');
    expect(lots.filter(x => x.action === 'create')).toHaveLength(15);
    expect(lots.every(x => !x.entity_id.startsWith('reference:'))).toBe(true);
  });

  it('refuses a response that straddles a commit while allowing unchanged snapshots', () => {
    expect(() => assertCommercialSnapshotRevision('a', 'b')).toThrow('revisão');
    expect(() => assertCommercialSnapshotRevision('a', 'a')).not.toThrow();
  });

  it('derives dashboard area and both stage totals from the same inventory used by the minimap', () => {
    const data = snapshot();
    const first = buildCommercialDashboardSnapshot(data, 'RENOVACAO');
    const second = buildCommercialDashboardSnapshot(data, 'SEGUNDA_ETAPA');
    expect(first.overall.commercialLots).toBe(107);
    expect(first.overall.totalAreaSqm).toBe(45557.86);
    expect(first.overall.totalKnownValue).toBe(886610.84);
    expect(second.overall.totalKnownValue).toBe(975008.19);
    const items = data.lots.map((lot, i) => ({ lot, entity: data.entities[i], value: lot.officialPricing2028!.renovacaoTotal }));
    const projected = getCommercialMiniMapGeometry(items);
    const moved = items.map((item, i) => i ? item : { ...item, entity: { ...item.entity, geometry: { ...item.entity.geometry,
      coordinates: item.entity.geometry.coordinates.map(r => r.map(([x, z]) => [x + .02, z] as Coordinate)) } } });
    expect(getCommercialMiniMapGeometry(moved).lots[0].path).not.toBe(projected.lots[0].path);
    const repriced = items.map((item, i) => i ? item : { ...item, value: 123.45 });
    const updated = getCommercialMiniMapGeometry(repriced);
    expect(updated.lots[0].path).toBe(projected.lots[0].path);
    expect(updated.lots[0].value).toBe(123.45);
    expect(updated.lotsByEntityId.get(lots.find(x => x.code === 'Q-R-47')!.entity_id)).toBeDefined();
  });

  it('keeps the C4 connector in the same cadastral asphalt batch and removes the elevated highway overlay', () => {
    const data = snapshot(), template = data.entities[0];
    const road = (code: string, metadata: Record<string, unknown> = {}): MapEntity => ({ ...template, id: code,
      publicIdentifier: code, classification: 'ROAD', isSellable: false, metadata });
    const entities = [road('RUA-EMANUEL-BRACHMANN', { exporuralSouthRoadPresentation: true }), road('EXPORURAL-PASSAGEM-INTERNA-02')];
    const result = withExporuralCadastralRoadOwnership(PARK_ACCESS_INFRASTRUCTURE_INPUT, entities);
    expect(PARK_ACCESS_INFRASTRUCTURE_INPUT.roadSurfaces.some(s=>s.id==='acesso-churrascaria')).toBe(true);
    expect(result.roadSurfaces.some(s=>s.id==='acesso-churrascaria')).toBe(false);
    expect(result.roadSurfaces).toEqual(PARK_ACCESS_INFRASTRUCTURE_INPUT.roadSurfaces.filter(s=>s.id!=='acesso-churrascaria'));
    expect(result.gates).toBe(PARK_ACCESS_INFRASTRUCTURE_INPUT.gates);
    expect(withExporuralCadastralRoadOwnership(PARK_ACCESS_INFRASTRUCTURE_INPUT,[])).toBe(PARK_ACCESS_INFRASTRUCTURE_INPUT);
  });

  it('keeps the 3 m passage paved without wide white curb ribbons or a technical-name atlas', () => {
    const template = snapshot().entities[0];
    const passage = roads.filter(r=>/PASSAGEM-(LESTE|INTERNA-01)/.test(r.code)).map(r=>({ ...template, id:r.entity_id,
      publicIdentifier:r.code, name:r.name, classification:'ROAD' as const, isSellable:false,
      metadata:{areaCode:'EXPORURAL',nameConfirmed:false,labelAnchor:r.label_anchor},
      geometry:{...template.geometry,coordinates:poly(r.geometry.coordinates),extrusionHeight:.032} }));
    const network=buildRoadNetworkGeometries(passage);
    try { expect(network.asphalt).not.toBeNull(); expect(network.curbs).toBeNull(); expect(network.gutters).toBeNull(); }
    finally { disposeRoadNetworkGeometries(network); }
    const labels=prepareTerritorialOrientation(passage,[]);
    expect(labels).toHaveLength(1); expect(labels[0].name).toBe('Passagem'); expect(labels[0].subdued).toBe(true);
    const laidOut=layoutTerritorialOrientation(labels,passage,new Map([[labels[0].id,3.8]]));
    expect(laidOut).toHaveLength(1); expect(laidOut[0].height).toBeLessThanOrEqual(.14);
    const legacy={...passage[0],publicIdentifier:'RUA-UBIRETAMA-LATERAL-R55',metadata:{street:'Rua Ubiretama (lateral do Q-R-55)'}};
    expect(prepareTerritorialOrientation([legacy],[])).toHaveLength(0);
  });

  it('invalidates cart entries after a price-only change, retaining the physical UUID', () => {
    const data = snapshot(), original = exporuralSelectionSnapshot(data);
    const changed = { ...data, lots: data.lots.map((lot, i) => i ? lot : { ...lot,
      officialPricing2028: { ...lot.officialPricing2028!, renovacaoTotal: 123.45 } }) };
    expect(changedExporuralSelections(original, exporuralSelectionSnapshot(changed))).toEqual([
      { lotId: data.lots[0].id, entityId: data.lots[0].entityId },
    ]);
  });
});
