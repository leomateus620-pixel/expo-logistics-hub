import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera } from 'three';
import { PUBLIC_MAP_AREAS } from '@/features/commercial-map/public/publicAreaRegistry';
import type { PublicLot } from '@/features/commercial-map/public/publicMapTypes';
import type { Coordinate, MapEntity } from '@/features/commercial-map/types';
import { lotPointClearance } from '@/features/commercial-map/utils/soldLotPresentation';
import { comparePublicLotNumbers, createPublicLotNumberProjector, preparePublicLotNumberSurfaces,
  readPublicLotNumbers } from '@/features/commercial-map/components/canvas/publicLotNumberProjection';
import { PublicMapLabelLayout } from '@/features/commercial-map/components/canvas/publicMapLabelLayout';

const rectangle: Coordinate[] = [[-5, -4], [5, -4], [5, 4], [-5, 4]];
const parcel = (id: string, coordinates = [rectangle], metadata = {}) => ({
  id, metadata, classification: 'SELLABLE_LOT', geometry: { coordinates, elevation: 0, extrusionHeight: 0.05 },
} as MapEntity);
const lot = (entityId: string, lotNumber: string | null, availability: PublicLot['availability']) => ({
  entityId, lotNumber, availability, publicIdentifier: `${entityId}-911`, displayName: 'Lote 911',
} as PublicLot);

function view(pixelsPerUnit: number, azimuth = 0, tilt = 0) {
  const viewport = { width: 400, height: 280 };
  const camera = new OrthographicCamera(-200 / pixelsPerUnit, 200 / pixelsPerUnit,
    140 / pixelsPerUnit, -140 / pixelsPerUnit, 0.1, 100);
  camera.position.set(Math.sin(tilt) * Math.sin(azimuth) * 30, Math.cos(tilt) * 30, Math.sin(tilt) * Math.cos(azimuth) * 30);
  camera.up.set(Math.sin(azimuth), 0, Math.cos(azimuth));
  camera.lookAt(0, 0, 0);
  const frame = new PublicMapLabelLayout();
  frame.update(camera, viewport.width, viewport.height);
  return { camera, frame, ...viewport };
}

describe('public cadastral lot numbers', () => {
  it('enables the policy only on the three public exterior areas', () => {
    expect(PUBLIC_MAP_AREAS.filter(area => area.lotNumbers === 'projected').map(area => area.slug)).toEqual([
      'exporural', 'industria-comercio-servicos-externo', 'espaco-automovel',
    ]);
  });

  it('preserves official text and the public status without falling back to an identifier', () => {
    const numbers = readPublicLotNumbers([
      lot('a', '007-A', 'AVAILABLE'), lot('b', '07B.2', 'SOLD'), lot('c', '09', 'UNAVAILABLE'),
      lot('d', null, 'AVAILABLE'), lot('e', '  ', 'AVAILABLE'), lot('f', '010', 'RESERVED'), lot('g', '11', 'SALE_OPEN'),
    ]);
    expect([...numbers]).toEqual([
      ['a', { text: '007-A', status: 'AVAILABLE' }], ['b', { text: '07B.2', status: 'SOLD' }],
      ['c', { text: '09', status: 'UNAVAILABLE' }], ['f', { text: '010', status: 'UNAVAILABLE' }],
      ['g', { text: '11', status: 'SOLD' }],
    ]);
    expect([...numbers].map(([entityId, value]) => ({ entityId, ...value })).reverse().sort(comparePublicLotNumbers)
      .map(label => label.entityId)).toEqual(['a', 'b', 'g', 'c', 'f']);
  });

  it('uses only inventory geometry even when context has the missing UUID or a similar identifier', () => {
    const allowed = parcel('a');
    const visibleContext = [allowed, parcel('a-2'), parcel('context-911')];
    const surfaces = preparePublicLotNumberSurfaces([allowed, parcel('hidden')], visibleContext);
    expect(surfaces.map(surface => surface.entityId)).toEqual(['a']);
    expect(preparePublicLotNumberSurfaces([parcel('a', [])], visibleContext)).toEqual([]);
  });

  it('keeps a valid official anchor and finds one for concave parcels with cadastral holes', () => {
    const hole: Coordinate[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const concave: Coordinate[] = [[-5, -5], [5, -5], [5, -2], [-2, -2], [-2, 5], [-5, 5]];
    const revision = { areaCode: 'EXPORURAL', geometryRevision: '2028-exporural-revision' };
    const parcels = [parcel('a', [rectangle, hole], { ...revision, labelAnchor: [3, 0] }),
      parcel('b', [rectangle, hole], { ...revision, labelAnchor: [0, 0] }), parcel('c', [concave])];
    const surfaces = preparePublicLotNumberSurfaces(parcels, parcels);
    expect(surfaces).toHaveLength(3);
    expect(surfaces[0]).toMatchObject({ x: 3, z: 0 });
    for (const surface of surfaces) expect(lotPointClearance([surface.x, surface.z], surface.rings)).toBeGreaterThan(0);
  });

  it('honors projected clearance in both dimensions with hysteresis and a selected priority', () => {
    const entity = parcel('a');
    const [surface] = preparePublicLotNumberSurfaces([entity], [entity]);
    const project = createPublicLotNumberProjector();
    expect(project(surface, view(4.5).frame, 40, false)).toBe(false);
    expect(project(surface, view(4.5).frame, 40, true)).toBe(true);
    expect(project(surface, view(5.5).frame, 40, false)).toBe(true);
    expect(surface.detailed).toBe(false);
    surface.visible = true;
    expect(project(surface, view(4.5).frame, 40, false)).toBe(true);
    expect(project(surface, view(4.2).frame, 40, false)).toBe(false);
    expect(project(surface, view(8.5).frame, 40, false)).toBe(true);
    expect(surface.detailed).toBe(true);
    expect(project(surface, view(5.5, 0, 1.2).frame, 40, false)).toBe(false);
  });

  it('rejects obscured screen edges and cameras pointing away, and keeps the same size from opposite azimuths', () => {
    const entity = parcel('a');
    const [surface] = preparePublicLotNumberSurfaces([entity], [entity]);
    const project = createPublicLotNumberProjector();
    for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      expect(project(surface, view(10, angle, 0.65).frame, 40, false)).toBe(true);
      expect(surface.rect.x1 - surface.rect.x0).toBeCloseTo(40);
      expect(surface.rect.y1 - surface.rect.y0).toBeCloseTo(18);
    }
    const camera = new PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 10, 20);
    const frame = new PublicMapLabelLayout();
    frame.update(camera, 300, 300);
    expect(project(surface, frame, 40, false)).toBe(false);
    const topDown = view(10);
    topDown.camera.position.x += 30;
    topDown.frame.update(topDown.camera, topDown.width, topDown.height);
    expect(project(surface, topDown.frame, 40, false)).toBe(false);
  });

  it('resolves neighboring boxes and group captions in one stable frame', () => {
    const { camera, frame, width, height } = view(10);
    const selected = { x0: 15, x1: 45, y0: 40, y1: 60 };
    const neighbor = { x0: 46, x1: 76, y0: 40, y1: 60 };
    const memberOne = { x0: 120, x1: 150, y0: 40, y1: 60 };
    const memberTwo = { x0: 155, x1: 185, y0: 40, y1: 60 };
    const company = { x0: 140, x1: 195, y0: 35, y1: 65 };
    const visible: string[] = [];
    const reserve = (layout: PublicMapLabelLayout, name: string, rect: typeof selected) => {
      if (layout.isOccupied(rect)) return;
      layout.reserve(rect);
      visible.push(name);
    };
    let near = false;
    frame.register('lots', layout => {
      reserve(layout, 'neighbor', neighbor);
      reserve(layout, 'member-1', memberOne);
      reserve(layout, 'member-2', memberTwo);
    });
    frame.register('companies', layout => {
      expect(layout.isOccupied(selected)).toBe(true);
      if (!layout.coversDetailedLot(company, ['member-1', 'member-2'])) reserve(layout, 'company', company);
    });
    frame.register('selectedLot', layout => {
      visible.length = 0;
      reserve(layout, 'selected', selected);
      if (near) layout.detailedLots.set('member-1', memberOne);
    });
    frame.update(camera, width, height);
    expect(visible).toEqual(['selected', 'company']);
    near = true;
    frame.update(camera, width + 1, height);
    expect(visible).toEqual(['selected', 'member-1', 'member-2']);
    frame.update(camera, width, height);
    expect(visible).not.toContain('neighbor');
  });
});
