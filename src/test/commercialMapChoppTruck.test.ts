import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createChoppTruckBatches } from '@/features/commercial-map/components/canvas/ChoppTruck';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '@/features/commercial-map/constants';
import { COMMERCIAL_ELECTRICAL_NODES } from '@/features/commercial-map/data/electricalInfrastructure';
import { MIRANTE_COMPLEX } from '@/features/commercial-map/data/miranteComplexReconstruction';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import {
  CHOPP_TRUCK_IDENTIFIER,
  CHOPP_TRUCK_MODEL_SIZE,
  CHOPP_TRUCK_SITE,
  choppTruckRoofAnchor,
  resolveChoppTruckTransform,
  withChoppTruckReference,
} from '@/features/commercial-map/utils/choppTruck';
import { polygonInteriorsOverlap } from '@/features/commercial-map/utils/geometry';
import { resolveStrategicLandmarkKind, strategicLandmarkFocusDirection } from '@/features/commercial-map/utils/landmarks';
import { presentCommercialMapData } from '@/features/commercial-map/utils/presentCommercialMapData';
import { buildVisitGroundSurfaces } from '@/features/commercial-map/visit/VisitGroundingSystem';

const map = presentCommercialMapData(OFFICIAL_REFERENCE_DATA);
const truck = map.entities.find(({ publicIdentifier }) => publicIdentifier === CHOPP_TRUCK_IDENTIFIER)!;
const transform = resolveChoppTruckTransform(truck);

describe('implantação do Caminhão de Chopp', () => {
  it('limita a referência de contingência à estrutura física', () => {
    expect(resolveStrategicLandmarkKind(truck)).toBe('chopp-truck');
    expect(truck.isSellable).toBe(false);
    expect(map.lots).toBe(OFFICIAL_REFERENCE_DATA.lots);
    expect(withChoppTruckReference(map)).toBe(map);
    const database = { ...OFFICIAL_REFERENCE_DATA, source: 'database' as const };
    expect(withChoppTruckReference(database)).toBe(database);
  });

  it('mantém o teto fora das superfícies caminháveis', () => {
    expect(buildVisitGroundSurfaces([truck], false).some(({ id }) => id === truck.id)).toBe(false);
  });

  it('reproduz o perímetro, a cota e o teto da geometria da migration', () => {
    const migration = readFileSync('supabase/migrations/20261116180000_commercial_gastronomy_via_expressa_chopp.sql', 'utf8');
    const seed = migration.match(/'(\{"type":"Polygon","coordinates":\[.*\]\})'::jsonb,\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    expect(seed).not.toBeNull();
    const [, polygon, elevation, extrusionHeight, rotation] = seed!;
    const persisted = {
      ...truck.geometry,
      coordinates: JSON.parse(polygon).coordinates as typeof truck.geometry.coordinates,
      elevation: Number(elevation),
      extrusionHeight: Number(extrusionHeight),
      rotation: Number(rotation),
    };
    expect(truck.geometry.elevation).toBe(persisted.elevation);
    expect(truck.geometry.extrusionHeight).toBe(persisted.extrusionHeight);
    expect(truck.geometry.rotation).toBe(persisted.rotation);
    truck.geometry.coordinates[0].forEach(([x, z], index) => {
      expect(x).toBeCloseTo(persisted.coordinates[0][index][0], 9);
      expect(z).toBeCloseTo(persisted.coordinates[0][index][1], 9);
    });
    choppTruckRoofAnchor({ geometry: persisted }).forEach((value, index) =>
      expect(value).toBeCloseTo(choppTruckRoofAnchor(truck)[index], 9));
  });

  it('mantém a envoltória paralela às ruas e livre de edificações e postes', () => {
    const [minX, minZ, maxX, maxZ] = CHOPP_TRUCK_SITE.lawnBoundsPdf;
    const [left, north] = officialPdfPointToLocal([minX, minZ]);
    const [right, south] = officialPdfPointToLocal([maxX, maxZ]);
    const [first, second] = truck.geometry.coordinates[0];
    expect(first[1]).toBe(second[1]);
    for (const [x, z] of truck.geometry.coordinates[0]) {
      expect(x).toBeGreaterThan(left + 0.35);
      expect(x).toBeLessThan(right - 0.35);
      expect(z).toBeGreaterThan(north + 0.35);
      expect(z).toBeLessThan(south - 0.35);
    }
    for (const id of ['D1', 'D2', 'D3', 'B7', 'RUA-BOLIVIA', 'RUA-BRASILIA', 'RUA-PARAGUAI']) {
      const obstacle = map.entities.find(({ publicIdentifier }) => publicIdentifier === id)!;
      expect(polygonInteriorsOverlap(truck.geometry, obstacle.geometry), id).toBe(false);
    }
    const { width, depth } = CHOPP_TRUCK_SITE.size;
    for (const { position: [x, z], radius, sourceMarkerId } of COMMERCIAL_ELECTRICAL_NODES) {
      const dx = Math.max(Math.abs(x - transform.center[0]) - width / 2, 0);
      const dz = Math.max(Math.abs(z - transform.center[1]) - depth / 2, 0);
      expect(Math.hypot(dx, dz), sourceMarkerId).toBeGreaterThan(radius + 0.35);
    }
  });

  it('enquadra a abertura voltada ao passeio oeste do Mirante e ancora o marcador no baú', () => {
    const [westEdge, , eastEdge] = MIRANTE_COMPLEX.sidewalk.sourceBounds;
    const { miranteAccessPdf: [accessX, accessZ] } = CHOPP_TRUCK_SITE;
    expect(accessX).toBeGreaterThan(westEdge);
    expect(accessX).toBeLessThan(eastEdge);
    expect(accessZ).toBeGreaterThan(MIRANTE_COMPLEX.mirante.platformSourceMinZ);
    expect(accessZ).toBeLessThan(MIRANTE_COMPLEX.mirante.sourceBounds[3]);
    const access = officialPdfPointToLocal(CHOPP_TRUCK_SITE.miranteAccessPdf);
    const [nx, nz] = transform.serviceNormal;
    const vx = access[0] - transform.serviceOrigin[0];
    const vz = access[1] - transform.serviceOrigin[1];
    expect(nx * vz - nz * vx).toBeCloseTo(0, 8);
    expect(nx * vx + nz * vz).toBeGreaterThan(0);
    const [cabX, cabZ] = transform.cabHeading;
    expect(cabX).toBe(-1);
    expect(cabX * (access[0] - transform.center[0]) + cabZ * (access[1] - transform.center[1]))
      .toBeLessThan(0);
    expect(strategicLandmarkFocusDirection(truck)).toEqual([nx, 0.36, nz]);
    expect(choppTruckRoofAnchor(truck)[1]).toBeCloseTo(
      COMMERCIAL_MAP_GROUND_ELEVATION + truck.geometry.extrusionHeight,
    );
  });

  it.each([true, false])('mantém todas as peças na envoltória e apoia os pneus com detalhe %s', (detailed) => {
    const batches = createChoppTruckBatches(transform.serviceYaw, transform.localServiceOrigin, detailed);
    const triangles = batches.reduce((sum, { geometry }) => sum + geometry.attributes.position.count / 3, 0);
    expect(batches.length + 2).toBeLessThanOrEqual(15); // Placa e sombra de contato.
    expect(triangles).toBeLessThan(detailed ? 17500 : 11500);
    const { width, height, depth } = CHOPP_TRUCK_MODEL_SIZE;
    for (const { geometry, surface } of batches) {
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox!;
      expect(min.x, surface).toBeGreaterThanOrEqual(-width / 2 - 0.0001);
      expect(max.x, surface).toBeLessThanOrEqual(width / 2 + 0.0001);
      expect(min.z, surface).toBeGreaterThanOrEqual(-depth / 2 - 0.0001);
      expect(max.z, surface).toBeLessThanOrEqual(depth / 2 + 0.0001);
      expect(min.y, surface).toBeGreaterThanOrEqual(-0.0001);
      expect(max.y, surface).toBeLessThanOrEqual(height + 0.0001);
      if (surface === 'dark') expect(min.y).toBeCloseTo(0, 6);
      geometry.dispose();
    }
  });
});
