import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BR344_RESERVED_ALIGNMENT,
  BR472_A5_HOOK,
  BR472_EAST_GAP_IN_HUB_WIDTHS,
  BR472_EXTERIOR_MAINLINE,
  BR472_EXTERIOR_SEGMENTS,
  BR472_NORTH_SOUTH_CENTERLINE,
  INTERCHANGE_ENVELOPES,
  PARK_LOCAL_BOUNDS,
  REGIONAL_HIGHWAY_PALETTE,
  REGIONAL_HIGHWAY_PROFILE,
  REGIONAL_HIGHWAY_REVISION,
  REGIONAL_HIGHWAY_WORLD_BOUNDS,
  br344ReservedZ,
  br472MainlineXAt,
  collectRegionalHighwayLayers,
  distanceToPolyline,
  expandFramingBoundsWithRegionalHighways,
  pointInInterchangeEnvelope,
} from '@/features/commercial-map/data/regional-highways';
import { officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import {
  REAR_CALIBRATED_AXES,
  REAR_OFFICIAL_ANCHORS,
} from '@/features/commercial-map/utils/rearSpatialCalibration';
import {
  GENERATED_REAR_ROAD_SEGMENTS,
  REAR_PARK_ROAD_NETWORK,
  rearRoadLocalPath,
  rearRoadLocalShoulderWidth,
  rearRoadLocalWidth,
} from '@/features/commercial-map/data/rearParkRoadNetwork';
import {
  REGIONAL_HIGHWAY_BUDGET,
  buildRegionalHighwayGeometries,
  disposeRegionalHighwayGeometries,
  resolveRegionalHighwayOwnerAtLocalPoint,
} from '@/features/commercial-map/utils/regionalHighwayMesh';
import {
  resolveCommercialMapCameraDistanceBounds,
  resolveCommercialMapCameraFarPlane,
} from '@/features/commercial-map/utils/viewport';
import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '@/features/commercial-map/constants';

const source = (path: string) => readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');

function interiorHighwayEastEdge() {
  const highway = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'br472-ramps-link')!;
  const [x] = officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.br472Junction);
  return x + rearRoadLocalWidth(highway) / 2 + rearRoadLocalShoulderWidth(highway);
}

function parkRectangleContains(x: number, z: number) {
  return x >= PARK_LOCAL_BOUNDS.minX
    && x <= PARK_LOCAL_BOUNDS.maxX
    && z >= PARK_LOCAL_BOUNDS.minZ
    && z <= PARK_LOCAL_BOUNDS.maxZ;
}

describe('rodovias regionais — contrato compartilhado e BR-472 exterior', () => {
  it('publica o idioma de malha/material para os agentes #2–#4 sem criar entidade nova', () => {
    expect(REGIONAL_HIGHWAY_REVISION).toBe('2026.10-regional-highways.1');
    expect(REGIONAL_HIGHWAY_PALETTE).toMatchObject({
      carriageway: '#2f9e44',
      shoulder: '#d4b896',
      edgeLine: '#f5d031',
    });
    expect(collectRegionalHighwayLayers().map((layer) => layer.id)).toEqual([
      'br472-exterior-mainline',
    ]);
    expect(BR344_RESERVED_ALIGNMENT.z).toBeCloseTo(br344ReservedZ(), 12);
    expect(BR344_RESERVED_ALIGNMENT.z).toBeCloseTo(
      PARK_LOCAL_BOUNDS.minZ - PARK_LOCAL_BOUNDS.depth * 1.5,
      8,
    );
    expect(pointInInterchangeEnvelope(
      [INTERCHANGE_ENVELOPES.neCloverleaf.center[0], INTERCHANGE_ENVELOPES.neCloverleaf.center[1]],
      'neCloverleaf',
    )).toBe(true);
    expect(pointInInterchangeEnvelope(
      [INTERCHANGE_ENVELOPES.seCloverleaf.center[0], INTERCHANGE_ENVELOPES.seCloverleaf.center[1]],
      'seCloverleaf',
    )).toBe(true);
  });

  it('coloca a BR-472 a ~0.5 larguras de hub a leste, com diagonal suave e braço sul E–W', () => {
    const mid = br472MainlineXAt(0);
    expect(mid).toBeCloseTo(
      PARK_LOCAL_BOUNDS.maxX + MAP_REFERENCE_WIDTH * BR472_EAST_GAP_IN_HUB_WIDTHS,
      12,
    );
    expect((mid - PARK_LOCAL_BOUNDS.maxX) / MAP_REFERENCE_WIDTH).toBeCloseTo(0.5, 12);
    expect(br472MainlineXAt(PARK_LOCAL_BOUNDS.maxZ)).toBeLessThan(br472MainlineXAt(PARK_LOCAL_BOUNDS.minZ));

    const a5Latitude = officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.br472Junction)[1];
    const atGate = BR472_NORTH_SOUTH_CENTERLINE.find(([, z]) => Math.abs(z - a5Latitude) < 0.2);
    expect(atGate).toBeTruthy();
    expect(atGate![0]).toBeCloseTo(br472MainlineXAt(a5Latitude), 6);

    expect(BR472_EXTERIOR_MAINLINE.seAttachment).toEqual(INTERCHANGE_ENVELOPES.seCloverleaf.center);
    expect(BR472_EXTERIOR_MAINLINE.southWest.at(-1)![0]).toBeLessThan(PARK_LOCAL_BOUNDS.minX);
    expect(BR472_EXTERIOR_MAINLINE.southWest.at(-1)![1]).toBeGreaterThan(PARK_LOCAL_BOUNDS.maxZ + 20);
    expect(BR472_EXTERIOR_MAINLINE.southThrough.at(-1)![1]).toBeGreaterThan(
      INTERCHANGE_ENVELOPES.seCloverleaf.center[1] + 20,
    );
    expect(BR472_EXTERIOR_MAINLINE.northSouth[0][1]).toBeLessThan(
      INTERCHANGE_ENVELOPES.neCloverleaf.center[1],
    );
  });

  it('aponta o gancho visual ao trevo A5 existente sem entrar no recorte do parque nem na fita interior', () => {
    const eastEdge = interiorHighwayEastEdge();
    const junction = officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.br472Junction);
    expect(BR472_A5_HOOK.aim.junction).toEqual(junction);
    expect(BR472_A5_HOOK.stem[0][0]).toBeGreaterThan(eastEdge);
    expect(BR472_A5_HOOK.stem[0][0] - REGIONAL_HIGHWAY_PROFILE.connectorWidth / 2)
      .toBeGreaterThanOrEqual(REGIONAL_HIGHWAY_PROFILE.interiorClearanceX - 1e-9);

    const hookPoints = [
      ...BR472_A5_HOOK.stem,
      ...BR472_A5_HOOK.northMerge,
      ...BR472_A5_HOOK.southMerge,
    ];
    hookPoints.forEach(([x, z]) => {
      expect(x, `hook ${x},${z}`).toBeGreaterThan(eastEdge);
      expect(parkRectangleContains(x, z)).toBe(false);
    });

    const parkRun = BR472_NORTH_SOUTH_CENTERLINE.filter(([, z]) => (
      z >= PARK_LOCAL_BOUNDS.minZ && z <= PARK_LOCAL_BOUNDS.maxZ
    ));
    parkRun.forEach(([x]) => {
      expect(x).toBeGreaterThan(PARK_LOCAL_BOUNDS.maxX + MAP_REFERENCE_WIDTH * 0.4);
    });
  });

  it('preserva byte-a-byte o trevo interior A5 / BR-472 e não edita os módulos protegidos', () => {
    expect(REAR_OFFICIAL_ANCHORS.br472Junction).toEqual([6120, 3678]);
    expect(REAR_OFFICIAL_ANCHORS.br472NorthRampJunction).toEqual([6112, 3520]);
    expect(REAR_OFFICIAL_ANCHORS.br472SouthRampJunction).toEqual([6126, 3840]);
    expect(REAR_CALIBRATED_AXES.br472NorthRampToSouthRamp).toEqual([
      [6112, 3520],
      [6120, 3678],
      [6126, 3840],
    ]);
    expect(REAR_CALIBRATED_AXES.br472NorthToNorthRamp[0]).toEqual([6046, 1300]);
    expect(REAR_CALIBRATED_AXES.br472SouthRampToSouth.at(-1)).toEqual([6146, 4400]);
    expect(GENERATED_REAR_ROAD_SEGMENTS.filter((road) => road.roadId === 'ACESSO-A5-BR472').map((road) => road.id))
      .toEqual([
        'portao5-north-approach',
        'gate5-internal-approach',
        'a5-trevo-trunk',
        'a5-br472-north-ramp',
        'a5-br472-south-ramp',
      ]);

    [
      'src/features/commercial-map/data/rearParkRoadNetwork.ts',
      'src/features/commercial-map/data/annexSpatialCorrections.ts',
      'src/features/commercial-map/utils/rearSpatialCalibration.ts',
    ].forEach((path) => {
      const contents = source(path);
      expect(contents).not.toContain('regional-highways');
      expect(contents).not.toContain('RegionalHighwayNetwork');
      expect(contents).not.toContain('br472MainlineLayer');
    });

    const interiorPoints = GENERATED_REAR_ROAD_SEGMENTS
      .filter((road) => road.roadId === 'RODOVIA-RS-472' || road.roadId === 'ACESSO-A5-BR472')
      .flatMap((road) => rearRoadLocalPath(road));
    BR472_EXTERIOR_SEGMENTS.forEach((segment) => {
      segment.centerline.forEach((point) => {
        const nearest = Math.min(...interiorPoints.map((interior) => (
          Math.hypot(interior[0] - point[0], interior[1] - point[1])
        )));
        expect(nearest, `${segment.id} ${point.join(',')}`).toBeGreaterThan(1.1);
      });
    });
  });

  it('expande zoom/pan regionais e mantém o enquadramento padrão no parque', () => {
    const park = {
      minX: -MAP_REFERENCE_WIDTH / 2,
      maxX: MAP_REFERENCE_WIDTH / 2,
      minZ: -MAP_REFERENCE_HEIGHT / 2,
      maxZ: MAP_REFERENCE_HEIGHT / 2,
      maxHeight: 24,
      width: MAP_REFERENCE_WIDTH,
      depth: MAP_REFERENCE_HEIGHT,
      centerX: 0,
      centerZ: 0,
      diagonal: Math.hypot(MAP_REFERENCE_WIDTH, MAP_REFERENCE_HEIGHT),
    };
    const regional = expandFramingBoundsWithRegionalHighways(park);
    expect(regional.maxX).toBeGreaterThan(park.maxX + 40);
    expect(regional.minZ).toBeLessThan(BR344_RESERVED_ALIGNMENT.z + 1);
    expect(regional.maxZ).toBeGreaterThan(INTERCHANGE_ENVELOPES.seCloverleaf.center[1]);
    expect(regional.centerX).not.toBeCloseTo(0, 1);

    const parkCamera = resolveCommercialMapCameraDistanceBounds({
      bounds: park,
      verticalFovDegrees: 38,
      aspect: 1440 / 900,
    });
    const regionalCamera = resolveCommercialMapCameraDistanceBounds({
      bounds: regional,
      verticalFovDegrees: 38,
      aspect: 1440 / 900,
    });
    expect(regionalCamera.maxDistance).toBeGreaterThan(parkCamera.maxDistance * 1.35);
    expect(resolveCommercialMapCameraFarPlane(regional, regionalCamera.maxDistance))
      .toBeGreaterThan(resolveCommercialMapCameraFarPlane(park, parkCamera.maxDistance));

    const canvas = source('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    expect(canvas).toContain('expandFramingBoundsWithRegionalHighways');
    expect(canvas).toContain('<RegionalHighwayNetwork');
    expect(canvas).toContain('Rua Brasília is intentionally retained');
    expect(canvas).toContain('fitDistanceForDirection(\n      extent,');
    expect(canvas).toContain('maxDistance: Math.max(parkCameraDistanceBounds.maxDistance, regional.maxDistance)');
  });

  it('constroi a malha verde/tan/amarela dentro do orçamento e mapeia hit-test à RS-472', () => {
    const network = buildRegionalHighwayGeometries();
    expect(network.carriageway).not.toBeNull();
    expect(network.shoulders).not.toBeNull();
    expect(network.edgeLines).not.toBeNull();
    expect(network.labels.some((label) => label.text === 'BR-472')).toBe(true);
    expect(network.diagnostics.triangleCount).toBeLessThan(REGIONAL_HIGHWAY_BUDGET.maximumTriangles);
    expect(network.diagnostics.estimatedBaseDrawCalls).toBeLessThanOrEqual(
      REGIONAL_HIGHWAY_BUDGET.maximumBaseDrawCalls,
    );

    const mid = BR472_NORTH_SOUTH_CENTERLINE.find(([, z]) => Math.abs(z) < 2)!;
    expect(resolveRegionalHighwayOwnerAtLocalPoint(mid)).toBe('BR-472');
    expect(resolveRegionalHighwayOwnerAtLocalPoint([0, 0])).toBeNull();
    expect(distanceToPolyline(mid, BR472_NORTH_SOUTH_CENTERLINE)).toBeLessThan(0.2);

    const reduced = buildRegionalHighwayGeometries({ reducedGraphics: true });
    expect(reduced.diagnostics.triangleCount).toBeLessThan(network.diagnostics.triangleCount);
    disposeRegionalHighwayGeometries(network);
    disposeRegionalHighwayGeometries(reduced);
  });

  it('não invade lotes, Via Expressa, Lactalis, tenda, tanques, supabase nem parque de diversões', () => {
    [
      'src/features/commercial-map/utils/viaExpressa.ts',
      'src/features/commercial-map/utils/livestockTent.ts',
      'src/features/commercial-map/utils/lactalisStage.ts',
      'src/features/commercial-map/utils/cooperativismWaterTanks.ts',
      'src/features/commercial-map/utils/landmarks.ts',
      'src/features/commercial-map/components/canvas/AmusementPark.tsx',
    ].forEach((path) => {
      expect(source(path)).not.toContain('regional-highways');
    });
    expect(REGIONAL_HIGHWAY_WORLD_BOUNDS.minX).toBeLessThan(PARK_LOCAL_BOUNDS.minX);
    expect(source('src/features/commercial-map/data/commercialMapEnvironment.ts'))
      .toContain('minimumWorldSize: 2_400');
  });
});
