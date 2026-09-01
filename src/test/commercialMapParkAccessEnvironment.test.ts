import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PARK_ACCESS_AMBIENT_TREE_FOOTPRINT_CLEARANCE,
  PARK_ACCESS_ENVIRONMENT_REVISION,
  PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES,
  isParkAccessPolygonFullyContained,
  resolveParkAccessEnvironmentPresentation,
  selectParkAccessCompatibleTreesForPresentation,
} from '@/features/commercial-map/data/parkAccessEnvironment';
import {
  PARK_ACCESS_SPATIAL_PLAN,
  parkAccessMetersToLocal,
  type ParkAccessPolygon,
} from '@/features/commercial-map/data/parkAccessSpatialPlan';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { OPEN_GROUND_PRESENTATION_HEIGHT } from '@/features/commercial-map/components/canvas/openGroundTextures';
import {
  PARK_ACCESS_ENVIRONMENT_PRIMARY_DRAW_CALL_BUDGET,
  createParkAccessPolylineRibbon,
  sampleParkAccessPolygonPlacements,
} from '@/features/commercial-map/utils/parkAccessEnvironment';
import {
  distanceToPolygon,
  pointInPolygon,
} from '@/features/commercial-map/utils/spatialSurface';

function officialFootprints(identifiers: readonly string[]) {
  return identifiers.map((identifier) => (
    OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === identifier)!
      .geometry.coordinates[0]
  ));
}

function protectedCommercialFootprints() {
  return officialFootprints(PARK_ACCESS_SPATIAL_PLAN.protectedCommercialGeometry.identifiers);
}

const DRIVABLE_ROADS = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces;

function expectCanopyOutsideEveryDrivableRoad(
  position: readonly [number, number],
  canopyRadius: number,
  label: string,
) {
  DRIVABLE_ROADS.forEach((road) => {
    expect(pointInPolygon(position, road.polygon), `${label}/${road.id}/trunk`).toBe(false);
    expect(distanceToPolygon(position, road.polygon), `${label}/${road.id}/canopy`)
      .toBeGreaterThanOrEqual(canopyRadius - 1e-6);
  });
}

function sideOfNearestSegment(
  point: readonly [number, number],
  centerline: readonly (readonly [number, number])[],
) {
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestSide = 0;
  centerline.slice(0, -1).forEach((from, index) => {
    const to = centerline[index + 1];
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const lengthSquared = dx * dx + dz * dz;
    const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point[0] - from[0]) * dx + (point[1] - from[1]) * dz) / lengthSquared,
    ));
    const nearest = [from[0] + dx * progress, from[1] + dz * progress] as const;
    const candidateDistance = Math.hypot(point[0] - nearest[0], point[1] - nearest[1]);
    if (candidateDistance < nearestDistance) {
      nearestDistance = candidateDistance;
      nearestSide = dx * (point[1] - nearest[1]) - dz * (point[0] - nearest[0]);
    }
  });
  return nearestSide;
}

function openPolygon(polygon: ParkAccessPolygon) {
  const first = polygon[0];
  const last = polygon.at(-1);
  return first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6
    ? polygon.slice(0, -1)
    : [...polygon];
}

function appendShapePath(path: THREE.Shape | THREE.Path, polygon: ParkAccessPolygon) {
  openPolygon(polygon).forEach(([x, z], index) => {
    if (index === 0) path.moveTo(x, -z);
    else path.lineTo(x, -z);
  });
  path.closePath();
}

describe('ambientação dos acessos, Caminho do Bosque e Sede Costeiros', () => {
  it('mantém as transições interpretadas abaixo das superfícies oficiais texturizadas', () => {
    const surfaces = resolveParkAccessEnvironmentPresentation(false).environmentalSurfaces;
    const overlappingDressing = [
      'costeiros-yard-exposed-soil',
      'costeiros-field-transition',
      'costeiros-forest-transition',
    ].map((id) => surfaces.find((surface) => surface.id === id)!);

    overlappingDressing.forEach((surface) => {
      expect(surface, surface.id).toBeDefined();
      expect(surface.elevation, surface.id).toBeLessThan(OPEN_GROUND_PRESENTATION_HEIGHT);
    });
  });

  it('deriva superfícies somente do contrato GIS e recorta clareira e footprints protegidos', () => {
    const presentation = resolveParkAccessEnvironmentPresentation(false);
    const woodlandFloor = presentation.environmentalSurfaces.find(
      (surface) => surface.id === 'park-access-woodland-floor',
    )!;
    const naturalEdge = presentation.environmentalSurfaces.find(
      (surface) => surface.id === 'woodland-path-natural-edge',
    )!;
    const trail = presentation.trailSurfaces.find(
      (surface) => surface.id === PARK_ACCESS_SPATIAL_PLAN.woodlandPath.id,
    )!;

    expect(presentation.revision).toBe(PARK_ACCESS_ENVIRONMENT_REVISION);
    expect(PARK_ACCESS_ENVIRONMENT_REVISION).toBe('2026.8-park-access-environment.r3');
    expect(presentation.diagnostics.sourceSpatialRevision).toBe(PARK_ACCESS_SPATIAL_PLAN.revision);
    expect(presentation.diagnostics.sourceSpatialRevision).toBe('2026.8-park-access-annexes.5');
    expect(woodlandFloor.polygon).toBe(PARK_ACCESS_SPATIAL_PLAN.woodlandMass.polygon);
    const candidateHoles = [
      PARK_ACCESS_SPATIAL_PLAN.woodlandMass.pathClearancePolygon,
      ...officialFootprints(PARK_ACCESS_SPATIAL_PLAN.woodlandMass.protectedFootprintIdentifiers),
    ];
    const expectedHoles = candidateHoles.filter((polygon) => isParkAccessPolygonFullyContained(
      polygon,
      woodlandFloor.polygon,
    ));
    expect(woodlandFloor.holes).toEqual(expectedHoles);
    expect(candidateHoles.some((polygon) => !isParkAccessPolygonFullyContained(
      polygon,
      woodlandFloor.polygon,
    ))).toBe(true);
    woodlandFloor.holes.forEach((hole) => {
      expect(isParkAccessPolygonFullyContained(hole, woodlandFloor.polygon)).toBe(true);
    });
    expect(naturalEdge.polygon).toBe(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.edgeBands[0].polygon);
    expect(naturalEdge.holes).toEqual([PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon]);
    expect(trail.polygon).toBe(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon);
    expect(trail.notes).toBe(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.notes);
    expect(PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES.join(' ')).toMatch(/Anexo 1/);
    expect(PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES.join(' ')).toMatch(/Anexo 3/);
    expect(PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES.join(' ')).toMatch(/Anexo 5/);
    expect(PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES.join(' ')).toMatch(/Anexo 6/);
    expect(PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES.join(' ')).toMatch(/Anexo 20/);
    expect(PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES.join(' ')).toMatch(/Anexo 21/);
    expect(PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES.join(' ')).toMatch(/Anexo 22/);
  });

  it('triangula o piso do bosque sem lançar faces fora do envelope ou dentro dos holes', () => {
    const woodlandFloor = resolveParkAccessEnvironmentPresentation(false).environmentalSurfaces.find(
      (surface) => surface.id === 'park-access-woodland-floor',
    )!;
    const shape = new THREE.Shape();
    appendShapePath(shape, woodlandFloor.polygon);
    woodlandFloor.holes.forEach((holePolygon) => {
      const hole = new THREE.Path();
      appendShapePath(hole, holePolygon);
      shape.holes.push(hole);
    });
    const geometry = new THREE.ShapeGeometry(shape, 1);

    try {
      const positions = geometry.getAttribute('position');
      const index = geometry.index;
      const elementCount = index?.count ?? positions.count;
      expect(elementCount).toBeGreaterThan(0);
      for (let offset = 0; offset < elementCount; offset += 3) {
        const vertexIndices = [0, 1, 2].map((triangleOffset) => (
          index?.getX(offset + triangleOffset) ?? offset + triangleOffset
        ));
        const centroid = [
          vertexIndices.reduce((sum, vertexIndex) => sum + positions.getX(vertexIndex), 0) / 3,
          -vertexIndices.reduce((sum, vertexIndex) => sum + positions.getY(vertexIndex), 0) / 3,
        ] as const;
        expect(pointInPolygon(centroid, woodlandFloor.polygon)).toBe(true);
        woodlandFloor.holes.forEach((hole) => {
          expect(pointInPolygon(centroid, hole)).toBe(false);
        });
      }
    } finally {
      geometry.dispose();
    }
  });

  it('abre a clareira do bosque apenas na apresentação e preserva o inventário canônico', () => {
    const inventorySnapshot = JSON.stringify(COMMERCIAL_MAP_TREES);
    const presentedTrees = selectParkAccessCompatibleTreesForPresentation(COMMERCIAL_MAP_TREES);
    const presentedTreeIds = new Set(presentedTrees.map((tree) => tree.id));
    const excludedTrees = COMMERCIAL_MAP_TREES.filter((tree) => !presentedTreeIds.has(tree.id));

    expect(excludedTrees.map((tree) => tree.id)).toEqual(expect.arrayContaining([
      'tree-pavilions-1-14-50',
      'tree-pavilions-1-14-52',
    ]));
    excludedTrees.forEach((tree) => {
      expect(
        pointInPolygon(tree.position, PARK_ACCESS_SPATIAL_PLAN.woodlandPath.clearancePolygon)
        || pointInPolygon(
          tree.position,
          PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting.accessClearancePolygon,
        )
        || Math.hypot(
          tree.position[0] - PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.center[0],
          tree.position[1] - PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.center[1],
        ) < PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.outerRadius + tree.canopyRadius
        || DRIVABLE_ROADS.some((road) => (
          pointInPolygon(tree.position, road.polygon)
          || distanceToPolygon(tree.position, road.polygon) < tree.canopyRadius
        )),
      ).toBe(true);
    });
    presentedTrees.forEach((tree) => {
      expect(pointInPolygon(
        tree.position,
        PARK_ACCESS_SPATIAL_PLAN.woodlandPath.clearancePolygon,
      )).toBe(false);
      expect(pointInPolygon(
        tree.position,
        PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting.accessClearancePolygon,
      )).toBe(false);
      expect(Math.hypot(
        tree.position[0] - PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.center[0],
        tree.position[1] - PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.center[1],
      )).toBeGreaterThanOrEqual(
        PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.outerRadius + tree.canopyRadius - 1e-6,
      );
      expectCanopyOutsideEveryDrivableRoad(tree.position, tree.canopyRadius, tree.id);
    });
    expect(JSON.stringify(COMMERCIAL_MAP_TREES)).toBe(inventorySnapshot);
  });

  it('enquadra o acesso de B22 com vegetação assimétrica e clearances sem mutar árvores oficiais', () => {
    const full = resolveParkAccessEnvironmentPresentation(false);
    const reduced = resolveParkAccessEnvironmentPresentation(true);
    const setting = PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting;
    const protectedFootprints = protectedCommercialFootprints();
    const canopyClearance = parkAccessMetersToLocal(setting.clearances.canopyMeters);
    const denseTrees = full.ambientTrees.filter(
      (placement) => placement.sourceZoneId === 'third-age-access-dense-tree-band',
    );
    const sparseTrees = full.ambientTrees.filter(
      (placement) => placement.sourceZoneId === 'third-age-access-sparse-tree-band',
    );
    const denseUnderstory = full.understory.filter(
      (placement) => placement.sourceZoneId === 'third-age-access-dense-understory',
    );
    const sparseUnderstory = full.understory.filter(
      (placement) => placement.sourceZoneId === 'third-age-access-sparse-understory',
    );

    expect(denseTrees.length).toBeGreaterThan(sparseTrees.length);
    expect(sparseTrees.length).toBeGreaterThan(0);
    expect(denseUnderstory.length).toBeGreaterThan(sparseUnderstory.length);
    expect(sparseUnderstory.length).toBeGreaterThan(0);
    [...denseTrees, ...sparseTrees].forEach((placement) => {
      expect(pointInPolygon(placement.position, setting.accessClearancePolygon)).toBe(false);
      expect(distanceToPolygon(placement.position, setting.accessClearancePolygon))
        .toBeGreaterThanOrEqual(canopyClearance - 1e-6);
      protectedFootprints.forEach((footprint) => {
        expect(pointInPolygon(placement.position, footprint)).toBe(false);
      });
      expectCanopyOutsideEveryDrivableRoad(
        placement.position,
        canopyClearance,
        placement.sourceZoneId,
      );
    });
    [...denseUnderstory, ...sparseUnderstory].forEach((placement) => {
      expect(pointInPolygon(placement.position, setting.accessClearancePolygon)).toBe(false);
      protectedFootprints.forEach((footprint) => {
        expect(pointInPolygon(placement.position, footprint)).toBe(false);
      });
    });
    expect(reduced.ambientTrees.filter((placement) => placement.sourceZoneId.startsWith('third-age-access-')).length)
      .toBeLessThan(denseTrees.length + sparseTrees.length);
    expect(reduced.understory.filter((placement) => placement.sourceZoneId.startsWith('third-age-access-')).length)
      .toBeLessThan(denseUnderstory.length + sparseUnderstory.length);
  });

  it('builds bilateral natural tree bands along the motorhome road without invading any road', () => {
    const full = resolveParkAccessEnvironmentPresentation(false);
    const reduced = resolveParkAccessEnvironmentPresentation(true);
    const setting = PARK_ACCESS_SPATIAL_PLAN.motorhomeSetting;
    const canopyClearance = parkAccessMetersToLocal(setting.clearances.canopyMeters);
    const forestTrees = full.ambientTrees.filter(
      (placement) => placement.sourceZoneId === 'motorhome-road-forest-side-trees',
    );
    const fieldTrees = full.ambientTrees.filter(
      (placement) => placement.sourceZoneId === 'motorhome-road-field-side-trees',
    );
    const reducedForestTrees = reduced.ambientTrees.filter(
      (placement) => placement.sourceZoneId === 'motorhome-road-forest-side-trees',
    );
    const reducedFieldTrees = reduced.ambientTrees.filter(
      (placement) => placement.sourceZoneId === 'motorhome-road-field-side-trees',
    );

    expect(forestTrees.length).toBeGreaterThan(fieldTrees.length);
    expect(fieldTrees.length).toBeGreaterThan(0);
    expect(forestTrees.length).toBeLessThanOrEqual(12);
    expect(fieldTrees.length).toBeLessThanOrEqual(7);
    expect(reducedForestTrees.length).toBeGreaterThan(0);
    expect(reducedFieldTrees.length).toBeGreaterThan(0);
    expect(reducedForestTrees.length).toBeLessThan(forestTrees.length);
    expect(reducedFieldTrees.length).toBeLessThan(fieldTrees.length);
    expect(forestTrees.reduce((sum, tree) => sum + tree.scale[0], 0) / forestTrees.length)
      .toBeGreaterThan(fieldTrees.reduce((sum, tree) => sum + tree.scale[0], 0) / fieldTrees.length);

    forestTrees.forEach((tree) => {
      expect(sideOfNearestSegment(tree.position, setting.accessCenterline), tree.sourceZoneId)
        .toBeLessThan(0);
    });
    fieldTrees.forEach((tree) => {
      expect(sideOfNearestSegment(tree.position, setting.accessCenterline), tree.sourceZoneId)
        .toBeGreaterThan(0);
    });
    [...forestTrees, ...fieldTrees].forEach((tree) => {
      expectCanopyOutsideEveryDrivableRoad(tree.position, canopyClearance, tree.sourceZoneId);
      expect(pointInPolygon(tree.position, setting.footprint), tree.sourceZoneId).toBe(false);
      expect(distanceToPolygon(tree.position, setting.footprint), tree.sourceZoneId)
        .toBeGreaterThanOrEqual(canopyClearance - 1e-6);
    });
  });

  it('mantém somente a faixa sul segura de B5 fora dos footprints e do estacionamento', () => {
    const presentation = resolveParkAccessEnvironmentPresentation(false);
    const treeSegments = PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.treeBand.segments;
    const pavilionTrees = presentation.ambientTrees.filter((placement) => (
      treeSegments.some((segment) => placement.sourceZoneId.startsWith(segment.id))
    ));
    const footprints = protectedCommercialFootprints();
    const northSidewalk = PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.find(
      (surface) => surface.id === 'benvenuto-north-sidewalk',
    )!.polygon;

    expect(treeSegments.map((segment) => segment.protectedIdentifier)).toEqual(['B5']);
    expect(pavilionTrees.length).toBeGreaterThan(0);
    expect(pavilionTrees.length).toBeLessThanOrEqual(
      treeSegments.reduce((sum, segment) => sum + segment.placementCountBudget, 0),
    );
    treeSegments.forEach((segment) => {
      expect(pavilionTrees.some((tree) => tree.sourceZoneId.startsWith(segment.id)), segment.id)
        .toBe(true);
    });
    pavilionTrees.forEach((tree) => {
      const segment = treeSegments.find((candidate) => tree.sourceZoneId.startsWith(candidate.id))!;
      const clearance = PARK_ACCESS_AMBIENT_TREE_FOOTPRINT_CLEARANCE.annexRelative;
      footprints.forEach((footprint) => {
        expect(pointInPolygon(tree.position, footprint), tree.sourceZoneId).toBe(false);
        expect(distanceToPolygon(tree.position, footprint), tree.sourceZoneId)
          .toBeGreaterThanOrEqual(clearance - 1e-6);
      });
      expect(pointInPolygon(
        tree.position,
        PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout,
      )).toBe(false);
      expect(pointInPolygon(tree.position, northSidewalk)).toBe(false);
    });
  });

  it('delimita o sub-bosque sem bloquear o piso do Caminho do Bosque', () => {
    const full = resolveParkAccessEnvironmentPresentation(false);
    const reduced = resolveParkAccessEnvironmentPresentation(true);
    const pathUnderstory = full.understory.filter(
      (placement) => placement.sourceZoneId === 'woodland-path-understory',
    );

    expect(pathUnderstory.length).toBeGreaterThan(0);
    pathUnderstory.forEach((placement) => {
      expect(pointInPolygon(
        placement.position,
        PARK_ACCESS_SPATIAL_PLAN.woodlandPath.edgeBands[0].polygon,
      )).toBe(true);
      expect(pointInPolygon(
        placement.position,
        PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon,
      )).toBe(false);
    });
    expect(reduced.understory.length).toBeLessThan(full.understory.length);
    expect(reduced.ambientTrees.length).toBeLessThan(full.ambientTrees.length);
  });

  it('respeita o orçamento estático de quatro draw calls e zero passe de sombra', () => {
    const full = resolveParkAccessEnvironmentPresentation(false);
    const reduced = resolveParkAccessEnvironmentPresentation(true);
    const minimumCanopyClearance = parkAccessMetersToLocal(Math.min(
      PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting.clearances.canopyMeters,
      PARK_ACCESS_SPATIAL_PLAN.motorhomeSetting.clearances.canopyMeters,
    ));

    [full, reduced].forEach((presentation) => {
      expect(presentation.diagnostics.primaryDrawCalls)
        .toBe(PARK_ACCESS_ENVIRONMENT_PRIMARY_DRAW_CALL_BUDGET);
      expect(presentation.diagnostics.shadowDrawCalls).toBe(0);
      expect(presentation.diagnostics.maximumPassDrawCalls)
        .toBe(PARK_ACCESS_ENVIRONMENT_PRIMARY_DRAW_CALL_BUDGET);
      expect(presentation.diagnostics.withinBudget).toBe(true);
      [...presentation.ambientTrees, ...presentation.understory].forEach((placement) => {
        expect(placement.position.every(Number.isFinite), placement.sourceZoneId).toBe(true);
        expect(placement.scale.every((value) => Number.isFinite(value) && value > 0), placement.sourceZoneId)
          .toBe(true);
      });
      presentation.ambientTrees.forEach((tree) => {
        expectCanopyOutsideEveryDrivableRoad(
          tree.position,
          minimumCanopyClearance,
          tree.sourceZoneId,
        );
      });
    });
  });

  it('gera ribbons e amostragem reprodutíveis sem deslocar o eixo recebido', () => {
    expect(createParkAccessPolylineRibbon([[0, 0], [10, 0]], 2)).toEqual([
      [0, 1],
      [10, 1],
      [10, -1],
      [0, -1],
    ]);
    const polygon = [[0, 0], [8, 0], [8, 6], [0, 6]] as const;
    const options = {
      sourceZoneId: 'deterministic-test',
      spacing: 1.4,
      jitter: 0.3,
      seed: 17,
      maximumCount: 12,
      minimumScale: 0.7,
      maximumScale: 1.1,
    } as const;
    const first = sampleParkAccessPolygonPlacements(polygon, options);
    const second = sampleParkAccessPolygonPlacements(polygon, options);
    expect(first).toEqual(second);
    expect(first).toHaveLength(options.maximumCount);
    first.forEach((placement) => expect(pointInPolygon(placement.position, polygon)).toBe(true));
  });

  it('mantém superfícies e vegetação independentes, não interativas e com descarte explícito', () => {
    const renderer = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/ParkAccessEnvironmentLayer.tsx',
    ), 'utf8');

    expect(renderer).toContain('surfacesVisible = true');
    expect(renderer).toContain('vegetationVisible = true');
    expect(renderer).toContain('new THREE.DataTexture');
    expect(renderer).toContain('toNonIndexedOwned');
    expect(renderer).toContain('geometry.toNonIndexed()');
    expect(renderer).toContain('<instancedMesh');
    expect(renderer).toContain('raycast={NO_RAYCAST}');
    expect(renderer).toContain('castShadow={false}');
    expect(renderer).toContain('geometry.dispose()');
    expect(renderer).toContain('material.dispose()');
    expect(renderer).toContain('texture.dispose()');
    expect(renderer.match(/renderOrder=\{0\}/g)).toHaveLength(2);
    expect(renderer).toContain('dispose={null}');
    expect(renderer).not.toContain('polygonOffset');
    expect(renderer).not.toContain('TextureLoader');
    expect(renderer).not.toContain('useFrame');
    expect(renderer).not.toContain('commercialTrees');
    expect(renderer).not.toContain('CommercialLot');
    expect(renderer).not.toContain('requestAnimationFrame');
  });
});
