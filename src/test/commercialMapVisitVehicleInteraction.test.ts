import { describe, expect, it, vi } from 'vitest';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';
import { buildVisitPOIs } from '@/features/commercial-map/visit/VisitPOIManager';
import { VisitVehicleInteraction } from '@/features/commercial-map/visit/vehicles/VisitVehicleInteraction';

function entity(id: string, x: number, z: number, classification: MapEntity['classification'] = 'BUILDING'): MapEntity {
  return {
    id, publicIdentifier: id, projectId: 'project', layerId: 'structures', parentEntityId: null,
    name: id, description: id, classification, verificationStatus: 'VERIFIED',
    isSellable: classification === 'SELLABLE_LOT', isArchived: false, metadata: {},
    geometry: {
      id: null, type: 'Polygon', coordinates: [[[x - 1, z - 1], [x + 1, z - 1], [x + 1, z + 1], [x - 1, z + 1], [x - 1, z - 1]]],
      elevation: 0, extrusionHeight: classification === 'SELLABLE_LOT' ? .05 : 2,
      rotation: 0, geometryVersion: 1, calibrationVersion: 1,
    },
  };
}

const visible = { occluded: vi.fn(() => false) };

describe('vehicle click/tap picking', () => {
  it('picks a facade from a cart and returns the same authorized POI/card identity', () => {
    const source = entity('PAVILION-3', 0, 6, 'PAVILION');
    const [poi] = buildVisitPOIs([source], [], 1);
    const picker = new VisitVehicleInteraction([poi], 1);
    expect(picker.pick({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, visible)).toBe(poi);
    expect(picker.focusPosition.z).toBeCloseTo(5);
    expect(picker.diagnostics.candidates).toBe(1);
  });

  it('picks an elevated official lot from above without copying its commercial values', () => {
    const source = entity('Q-M-12', 0, 0, 'SELLABLE_LOT');
    const lot = { id: 'lot-12', entityId: source.id, officialAreaSqm: 24, askingPrice: 12000, status: 'AVAILABLE' } as CommercialLot;
    const [poi] = buildVisitPOIs([source], [lot], 1, () => .47);
    const picker = new VisitVehicleInteraction([poi], 1);
    expect(picker.pick({ x: 0, y: 6, z: 0 }, { x: 0, y: -1, z: 0 }, visible)).toBe(poi);
    expect(picker.focusPosition.y).toBeCloseTo(.52);
    expect(picker.pick({ x: 3, y: 6, z: 0 }, { x: 0, y: -1, z: 0 }, visible)).toBeNull();
    expect(poi.lot).toBe(lot);
  });

  it('rejects a cadastral hole and anything hidden by the visit world', () => {
    const source = entity('courtyard', 0, 0);
    source.geometry.coordinates.push([[-.4, -.4], [.4, -.4], [.4, .4], [-.4, .4], [-.4, -.4]]);
    const [poi] = buildVisitPOIs([source], [], 1);
    const picker = new VisitVehicleInteraction([poi], 1);
    expect(picker.pick({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, visible)).toBeNull();
    const occluded = vi.fn(() => true);
    expect(picker.pick({ x: .7, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, { occluded })).toBeNull();
    expect(occluded).toHaveBeenCalledWith(expect.anything(), expect.anything(), source.id);
  });

  it('queries only local indexed candidates for a downward tap and ignores invalid rays', () => {
    const near = entity('near', 0, 0);
    const far = Array.from({ length: 600 }, (_, i) => entity(`far-${i}`, 500 + i * 4, 500));
    const picker = new VisitVehicleInteraction(buildVisitPOIs([near, ...far], [], 1), 1);
    expect(picker.pick({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, visible)?.id).toBe('near');
    expect(picker.diagnostics.candidates).toBe(1);
    expect(picker.pick({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, visible)).toBeNull();
    expect(picker.diagnostics.visibilityQueries).toBe(0);
  });

  it('keeps a long diagonal click in a narrow spatial corridor', () => {
    const target = entity('on-ray', 30, 30);
    const offRay = entity('inside-wide-box', 5, 50);
    const picker = new VisitVehicleInteraction(buildVisitPOIs([target, offRay], [], 1), 1);
    expect(picker.pick({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 1 }, visible)?.id).toBe('on-ray');
    expect(picker.diagnostics.candidates).toBe(1);
  });
});
