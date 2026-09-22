import type { MapEntity } from '../types';
import type { CommercialMapTree } from '../data/commercialTrees';
import { COMMERCIAL_MAP_SPATIAL_BOUNDS } from '../data/commercialMapSpatialBounds';
import { PARK_ACCESS_SPATIAL_PLAN } from '../data/parkAccessSpatialPlan';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '../utils/parkAccessSpatialPlanAdapter';
import { buildParkAccessArchitectureModel } from '../utils/parkAccessArchitecture';
import { resolveParkAccessEnvironmentPresentation } from '../data/parkAccessEnvironment';
import { TERRITORY_BUILDINGS, TERRITORY_TREES, TERRITORY_PATCHES } from '../data/territorialEnvironment';
import { buildRearTreeInstances } from '../data/rearParkEnvironment';
import { buildLateralResidentialRenderPlan } from '../utils/lateralResidentialGeometry';
import { resolveStrategicLandmarkKind, strategicLandmarkVisualHeight, strategicLandmarkBounds, strategicLandmarkFacingRadians } from '../utils/landmarks';
import { commercialTreeGroundElevation } from '../utils/treeLayer';
import { complexLocalToWorld, complexWorldPolygon, FENASOJA_COMPLEX } from '../data/fenasojaComplexReconstruction';
import { ARENA_FRONT_LAYOUT, sourceBoundsToLocal, sourcePolygonToLocal } from '../data/parkEnvironment';
import { MIRANTE_COMPLEX } from '../data/miranteComplexReconstruction';
import { arenaVegetationAllowed } from '../data/arenaCanonicalLayout';
import { arenaTerrainElevation } from '../data/arenaTerrain';
import { treeIntersectsGeneratedRearRoadCorridor } from '../utils/rearRoadTreeClearance';
import { createArenaAccessLayout } from '../utils/arenaAccessStructure';
import { GATE_FOUR_DISTRICT_LAYOUT } from '../data/gateFourDistrict';
import { NATIONS_DISTRICT_LAYOUT } from '../data/nationsDistrict';
import { VisitCollisionSystem } from './VisitCollisionSystem';
import { VisitGroundingSystem, buildVisitGroundSurfaces, visitGroundSurface, visitBoundsRing, visitTerrainOccluded, visitTerrainCameraFraction } from './VisitGroundingSystem';
import { visitRingBounds } from './VisitSpatialIndex';
import { VISIT_CHARACTER_RADIUS, VISIT_CHARACTER_HEIGHT, type VisitBounds, type VisitCollider, type VisitPoint2, type VisitRing, type VisitVector3 } from './visitTypes';
import type { ResolvedElectricalNodePlacement } from '../utils/electricalInfrastructure';
import { createGastronomicAlamedaLayout, fitRotatedStructureBounds } from '../utils/fenasojaReferenceStructures';
import { EXPORURAL_WELL, isExporuralLandscapeLot } from '../utils/exporuralLandscape';
import { visitPointInRing } from './VisitSpatialIndex';
import { SOY_RESTROOM_PRESENTATION } from '../utils/soyGateArchitecture';

const SOLID_CLASSIFICATIONS = new Set(['PAVILION', 'BUILDING', 'RESTAURANT', 'RESTROOM', 'CHEMICAL_RESTROOM', 'ADMINISTRATION', 'SECURITY', 'EMERGENCY', 'SERVICE', 'EVENT_VENUE']);

/** Yaw follows THREE's right-handed Y rotation. */
export function visitBoxPolygon(x: number, z: number, width: number, depth: number, yaw = 0): VisitRing {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c] as const);
}

export function visitPolygonCollider(id: string, polygon: VisitRing, minY: number, maxY: number): VisitCollider {
  return { id, kind: 'polygon', polygon, minY, maxY, ...visitRingBounds(polygon) };
}

export function visitCircleCollider(id: string, x: number, z: number, radius: number, minY: number, maxY: number): VisitCollider {
  return { id, kind: 'circle', x, z, radius, minY, maxY, minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius };
}

export interface VisitWorld {
  bounds: VisitBounds;
  maxHeight: number;
  ground: VisitGroundingSystem;
  collisions: VisitCollisionSystem;
  /** Mutates and returns the same object; caller keeps its stable ref. */
  move(position: VisitVector3, dx: number, dz: number, radius?: number, height?: number): VisitVector3;
  resolveSpawn(preferred: VisitPoint2): VisitVector3;
  cameraProbe(from: VisitVector3, to: VisitVector3, radius?: number): number;
  occluded(from: VisitVector3, to: VisitVector3, ignoreId?: string): boolean;
}

/** Complete source-owned architectural blockers, built only on visit entry.
 * The structure entity's ground footprint is deliberately solid: interior access
 * is an explicit navigation action, never an accidental walk through a facade.
 * Open gates and freestanding canopies instead retain individual piers/walls. */
export function buildVisitWorld({ entities, trees, electricalPlacements = [], siteEnvironmentEntities = entities, includeContext = entities.some(entity => ['A1', 'F', 'B12', 'EXPORURAL'].includes(entity.publicIdentifier)) }: {
  entities: readonly MapEntity[];
  trees: readonly CommercialMapTree[];
  electricalPlacements?: readonly ResolvedElectricalNodePlacement[];
  siteEnvironmentEntities?: readonly MapEntity[];
  includeContext?: boolean;
}): VisitWorld {
  const colliders: VisitCollider[] = [];
  const surfaces = buildVisitGroundSurfaces(entities, includeContext, siteEnvironmentEntities);
  const identifiers = new Set(entities.map(entity => entity.publicIdentifier));
  const polygon = (id: string, ring: VisitRing, base: number, height: number) => {
    if (ring.length >= 3 && ring.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])) && height > 0) colliders.push(visitPolygonCollider(id, ring, base, base + height));
  };
  const box = (id: string, x: number, y: number, z: number, width: number, height: number, depth: number, yaw = 0) => {
    polygon(id, visitBoxPolygon(x, z, width, depth, yaw), y - height / 2, height);
  };
  const trunk = (id: string, x: number, z: number, radius: number, base: number, height: number) => {
    colliders.push(visitCircleCollider(id, x, z, Math.max(0.008, radius), base, base + height));
  };
  const crown = (id: string, x: number, z: number, radius: number, bottom: number, top: number) => {
    colliders.push({ ...visitCircleCollider(`${id}:crown`, x, z, radius, bottom, top), cameraOnly: true });
  };
  for (const entity of entities) {
    if (entity.isArchived) continue;
    const kind = resolveStrategicLandmarkKind(entity);
    if (entity.classification === 'SELLABLE_LOT' || entity.classification === 'INTERNAL_STAND') continue;
    if (kind === 'lunar-tree') {
      const bounds = strategicLandmarkBounds(entity);
      trunk(entity.id, bounds.centerX, bounds.centerZ, 0.14, entity.geometry.elevation, 2.4);
      crown(entity.id, bounds.centerX, bounds.centerZ, Math.max(bounds.width, bounds.depth) * 0.55, entity.geometry.elevation + 1.7, entity.geometry.elevation + (strategicLandmarkVisualHeight(entity) ?? 4.8));
      continue;
    }
    if (kind === 'fenasoja-headquarters') {
      // B12 geometry is its landscaped site, not its walls. Taking its whole
      // selectable polygon would block the front garden and entrance path.
      polygon(entity.id, complexWorldPolygon('headquarters', 'footprint'), entity.geometry.elevation, strategicLandmarkVisualHeight(entity) ?? 1.3);
      const monument = complexLocalToWorld(FENASOJA_COMPLEX.headquarters.monument.position, 'headquarters');
      trunk(`${entity.id}:monument`, monument[0], monument[1], 0.11, entity.geometry.elevation, 0.44);
      continue;
    }
    if (kind === 'soy-restroom') {
      const b = strategicLandmarkBounds(entity), yaw = strategicLandmarkFacingRadians(entity), base = entity.geometry.elevation;
      // E-07 is the local 1.3 x 1.8 model in map units, rotated by its owner. The
      // raised presentation roof height comes from the same landmark contract.
      const h = SOY_RESTROOM_PRESENTATION.visualHeight;
      box(entity.id, b.centerX, base + h / 2, b.centerZ, 1.3, h, 1.8, yaw);
      surfaces.push(visitGroundSurface(`${entity.id}:platform`, visitBoxPolygon(b.centerX, b.centerZ, 1.46, 2.08, yaw), base + .036));
      continue;
    }
    if (kind === 'gastronomic-alameda') {
      const b = strategicLandmarkBounds(entity), yaw = strategicLandmarkFacingRadians(entity), base = entity.geometry.elevation;
      const layout = createGastronomicAlamedaLayout(fitRotatedStructureBounds(b, yaw), strategicLandmarkVisualHeight(entity) ?? undefined);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const point = (x: number, z: number): [number, number] => [b.centerX + x * c + z * s, b.centerZ - x * s + z * c];
      const part = (id: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
        const p = point(x, z); box(id, p[0], base + y, p[1], w, h, d, yaw);
      };
      const floor = (id: string, x: number, z: number, w: number, d: number, y: number | ((localZ: number) => number)) => {
        const p = point(x, z);
        surfaces.push(visitGroundSurface(id, visitBoxPolygon(p[0], p[1], w, d, yaw), typeof y === 'number' ? base + y : (wx, wz) => base + y((wx - b.centerX) * s + (wz - b.centerZ) * c), undefined, typeof y === 'number' ? base + y : base + Math.max(y(z - d / 2), y(z + d / 2))));
      };
      const porchZ = layout.platform.frontZ - .18;
      const porchEave = layout.roof.ridgeY - (porchZ - layout.building.centerZ) * Math.tan(layout.roof.angle);
      const roofBack = layout.building.centerZ - layout.roof.halfSpan, roofTop = layout.roof.ridgeY + .08;
      part(entity.id, 0, (layout.platform.topY + roofTop) / 2, layout.building.centerZ, layout.building.width, roofTop - layout.platform.topY, layout.building.depth);
      // The roof volume is above the walkable porch, not an invisible wall
      // across the whole selectable envelope.
      const roofBottom = Math.min(porchEave, layout.roof.eaveY) - layout.roof.thickness;
      part(`${entity.id}:roof`, 0, (roofBottom + roofTop) / 2, (roofBack + porchZ) / 2, layout.roof.width, roofTop - roofBottom, porchZ - roofBack);
      for (let i = 0; i <= layout.building.bayCount; i++) {
        const p = point(-layout.building.width / 2 + layout.building.width * i / layout.building.bayCount, porchZ);
        trunk(`${entity.id}:porch-pier:${i}`, ...p, layout.building.columnRadius, base + layout.platform.topY, porchEave - layout.platform.topY);
      }
      const front = layout.platform.frontZ, back = layout.platform.centerZ - layout.platform.depth / 2;
      const stairBack = front - layout.access.stairRun, rearFront = Math.min(stairBack, layout.building.frontZ + .12);
      const half = layout.platform.width / 2, rampLeft = layout.access.rampCenterX - layout.access.rampWidth / 2, rampRight = layout.access.rampCenterX + layout.access.rampWidth / 2;
      const spans = [[-half, rampLeft], [rampRight, -layout.access.stairWidth / 2], [layout.access.stairWidth / 2, half]];
      floor(`${entity.id}:foundation-rear`, 0, (back + rearFront) / 2, half * 2, rearFront - back, layout.platform.topY);
      for (let i = 0; i < spans.length; i++) {
        const [left, right] = spans[i]; if (right <= left) continue;
        floor(`${entity.id}:foundation:${i}`, (left + right) / 2, (rearFront + front) / 2, right - left, front - rearFront, layout.platform.topY);
        part(`${entity.id}:porch-rail:${i}`, (left + right) / 2, layout.platform.topY + layout.access.railingHeight / 2, front - .09, right - left, layout.access.railingHeight, .019);
      }
      for (let i = 0; i < layout.access.stepCount; i++) floor(`${entity.id}:step:${i}`, 0, front - layout.access.stepDepth * (i + .5), layout.access.stairWidth, layout.access.stepDepth + .01, layout.access.stepRise * (i + 1));
      const rampBack = layout.building.frontZ + .12, rampRun = front - rampBack, rampAngle = Math.atan2(layout.platform.topY, rampRun);
      const rampLength = Math.hypot(layout.platform.topY - .025, rampRun), rampCenterZ = (front + rampBack) / 2;
      floor(`${entity.id}:ramp`, layout.access.rampCenterX, rampCenterZ + .035 * Math.sin(rampAngle), layout.access.rampWidth, rampLength * Math.cos(rampAngle), z => layout.platform.topY / 2 + .035 / Math.cos(rampAngle) - Math.tan(rampAngle) * (z - rampCenterZ));
      for (const side of [-1, 1]) {
        part(`${entity.id}:side-rail:${side}`, side * half, layout.platform.topY + layout.access.railingHeight / 2, (front - .09 + layout.building.frontZ) / 2, .018, layout.access.railingHeight, front - .09 - layout.building.frontZ);
        part(`${entity.id}:stair-rail:${side}`, side * layout.access.stairWidth / 2, (layout.platform.topY + layout.access.railingHeight) / 2, (front + layout.building.frontZ) / 2, .025, layout.platform.topY + layout.access.railingHeight, front - layout.building.frontZ);
        part(`${entity.id}:ramp-rail:${side}`, layout.access.rampCenterX + side * layout.access.rampWidth / 2, (layout.platform.topY + layout.access.railingHeight) / 2, rampCenterZ, .025, layout.platform.topY + layout.access.railingHeight, rampRun);
      }
      layout.flagpoles.positionsX.forEach((x, i) => {
        const p = point(x, layout.flagpoles.lineZ);
        trunk(`${entity.id}:flagpole:${i}`, ...p, layout.flagpoles.radius, base, layout.flagpoles.heights[i]);
      });
      continue;
    }
    if (kind === 'nations-portico') {
      const b = strategicLandmarkBounds(entity), h = strategicLandmarkVisualHeight(entity) ?? 2;
      const pierWidth = b.width * 0.18, depth = b.depth * 0.58, base = entity.geometry.elevation;
      for (const side of [-1, 1]) {
        const x = b.centerX + side * (b.width * 0.3 + pierWidth * 0.52);
        box(entity.id, x, base + h * 0.25 + 0.08, b.centerZ, pierWidth, h * 0.5, depth);
        box(entity.id, x, base + 0.14, b.centerZ, pierWidth * 1.32, 0.22, depth * 1.18);
      }
      box(entity.id, b.centerX, base + h * 0.68, b.centerZ, b.width * 0.79, h * 0.36, depth);
      surfaces.push(visitGroundSurface(`${entity.id}:base`, visitBoxPolygon(b.centerX, b.centerZ, b.width * 0.98, b.depth * 0.98), base + 0.1));
      continue;
    }
    if (kind === 'gate-four') {
      const p = GATE_FOUR_DISTRICT_LAYOUT.gate4, b = strategicLandmarkBounds(entity), base = entity.geometry.elevation;
      const pier = Math.max(0.18, p.width * 0.13), clearHalf = p.width * 0.31;
      for (const side of [-1, 1]) for (const depthSide of [-1, 1]) {
        box(entity.id, p.center[0] + side * (clearHalf + pier * 0.5), base + p.portalClearHeight / 2 + 0.07, p.center[1] + depthSide * p.depth * 0.42, pier, p.portalClearHeight, pier);
      }
      const h = p.canopyHeight - p.portalClearHeight;
      box(entity.id, p.center[0], base + p.portalClearHeight + h / 2, p.center[1], p.width, h, p.depth);
      const guardWidth = Math.max(Math.max(b.width, p.width) * 0.25, 0.48), guardDepth = Math.max(Math.max(b.depth, p.depth) * 0.42, 0.5);
      box(entity.id, p.center[0] + clearHalf + pier + guardWidth * 0.52, base + p.canopyHeight * 0.18 + 0.07, p.center[1] + p.depth * 0.05, guardWidth, p.canopyHeight * 0.36, guardDepth);
      continue;
    }
    if (kind === 'amusement-park') {
      const b = strategicLandmarkBounds(entity), scale = Math.min(b.width / 7.3, b.depth / 6), base = entity.geometry.elevation;
      // Dynamic rides keep their complete swept operating envelope inaccessible.
      // This is three simple volumes, not a collider per animated cabin/vehicle.
      for (const [name, x, z, width, depth, height] of [['wheel', -2.05, 0, 2.25, 1.1, 2.9], ['kamikaze', 1.82, -0.28, 1.55, 1.2, 3.2], ['bumper', 0.35, 1.62, 2.82, 1.96, 1.2]] as const) {
        box(`${entity.id}:${name}`, b.centerX + x * scale, base + height * scale / 2, b.centerZ + z * scale, width * scale, height * scale, depth * scale);
      }
      surfaces.push(visitGroundSurface(`${entity.id}:ground`, entity.geometry.coordinates[0], base + 0.035 * scale));
      const halfW = b.width / 2 - 0.14 * scale, halfD = b.depth / 2 - 0.14 * scale;
      const edges = [[[-halfW, -halfD], [halfW, -halfD]], [[halfW, -halfD], [halfW, halfD]], [[halfW, halfD], [-halfW, halfD]], [[-halfW, halfD], [-halfW, -halfD]]] as const;
      edges.forEach(([a, c], edge) => {
        const count = Math.max(2, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1]) / (0.55 * scale)));
        for (let i = 0; i <= count; i++) {
          const x = a[0] + (c[0] - a[0]) * i / count, z = a[1] + (c[1] - a[1]) * i / count;
          if (edge === 0 && Math.abs(x) < 0.85 * scale) continue;
          box(`${entity.id}:fence:${edge}:${i}`, b.centerX + x, base + 0.11 * scale, b.centerZ + z, 0.05 * scale, 0.22 * scale, 0.05 * scale);
        }
      });
      continue;
    }
    if (kind === 'campeira-track' || kind === 'nations-square' || entity.classification === 'GATE') continue;
    if (SOLID_CLASSIFICATIONS.has(entity.classification) || (kind && entity.classification !== 'GREEN_AREA')) {
      const base = entity.geometry.elevation;
      polygon(entity.id, entity.geometry.coordinates[0] ?? [], base, Math.max(0.3, strategicLandmarkVisualHeight(entity) ?? entity.geometry.extrusionHeight));
    } else if (entity.classification === 'WATER') {
      // Water is not a walkable shortcut, even though the display plane is flat.
      polygon(entity.id, entity.geometry.coordinates[0] ?? [], -2, 3);
    } else if (entity.classification === 'TREE') {
      const bounds = strategicLandmarkBounds(entity);
      trunk(entity.id, bounds.centerX, bounds.centerZ, Math.min(0.16, bounds.width * 0.08), entity.geometry.elevation, 1.8);
    }
  }
  for (const tree of trees) {
    const base = commercialTreeGroundElevation(tree, entities);
    trunk(tree.id, tree.position[0], tree.position[1], tree.trunkRadius, base, tree.trunkHeight);
    crown(tree.id, tree.position[0], tree.position[1], tree.canopyRadius, base + tree.trunkHeight * 0.85, base + tree.trunkHeight + tree.crownHeight);
  }
  const wellLot = entities.find(entity => entity.publicIdentifier === 'Q-R-02' && isExporuralLandscapeLot(entity) && visitPointInRing(...EXPORURAL_WELL.position, entity.geometry.coordinates[0]));
  if (wellLot) {
    const base = wellLot.geometry.elevation + wellLot.geometry.extrusionHeight, [x, z] = EXPORURAL_WELL.position;
    // The 0.56-square fence is a closed physical enclosure within a traversable
    // lot. Keep its small footprint, never make the whole lot inaccessible.
    box('exporural:well-fence', x, base + .2, z, .578, .4, .578);
    trunk('exporural:well-pole', x - .12, z - .12, .023, base, 1.3);
    surfaces.push(visitGroundSurface('exporural:well-base', visitBoxPolygon(x, z, .66, .66), base + .0265));
  }
  for (const placement of electricalPlacements) {
    const { node, renderPosition: [x, z], groundElevation: y, rotationRadians: yaw } = placement;
    if (node.type === 'POLE') trunk(node.id, x, z, node.radius, y, node.height);
    else {
      box(node.id, x, y + .05 + node.height / 2, z, node.radius * 1.72, node.height + .1, node.radius * 1.55, yaw);
      box(`${node.id}:plinth`, x, y + .025, z, node.radius * 2, .05, node.radius * 1.55, yaw);
    }
  }

  if (includeContext) {
    const input = PARK_ACCESS_INFRASTRUCTURE_INPUT;
    const gates = buildParkAccessArchitectureModel(input.gates, null);
    for (const part of [...gates.opaque, ...gates.glass, ...gates.metal]) {
      const q = part.quaternion;
      const yaw = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] ** 2 + q[2] ** 2));
      box(part.featureId, ...part.position, part.scale[0], part.scale[1], part.scale[2], yaw);
    }
    const costeiros = input.costeiros;
    if (costeiros) box('costeiros-building', costeiros.anchor[0], 0.3, costeiros.anchor[1], costeiros.width, 0.6, costeiros.depth, costeiros.rotationRadians);
    const environment = resolveParkAccessEnvironmentPresentation(false);
    for (let i = 0; i < environment.ambientTrees.length; i++) {
      const tree = environment.ambientTrees[i];
      trunk(`park-access-tree:${i}`, tree.position[0], tree.position[1], 0.145 * Math.max(tree.scale[0], tree.scale[2]), 0.015, 1.38 * tree.scale[1]);
      crown(`park-access-tree:${i}`, tree.position[0], tree.position[1], Math.max(tree.scale[0], tree.scale[2]), 0.015 + 1.1 * tree.scale[1], 0.015 + 3 * tree.scale[1]);
    }
    for (const tree of buildRearTreeInstances(false)) {
      const id = `rear-tree:${tree.x}:${tree.z}`;
      const leafHalfHeight = tree.scale * .5 * (.85 + tree.tint * .5);
      const leafBottom = tree.scale * .92 - leafHalfHeight, leafTop = tree.scale * .92 + leafHalfHeight;
      trunk(id, tree.x, tree.z, 0.085 * tree.scale * 0.16, -0.01 * tree.scale, tree.scale * 0.7);
      crown(id, tree.x, tree.z, 0.5 * tree.scale, leafBottom, leafTop);
      // The authored scrub species is a low bush, with leaves at body/eye
      // height. Its small physical foliage volume prevents walking inside it.
      // This exception never expands an ordinary tree to its overhead crown.
      if (tree.species === 'scrub') colliders.push(visitCircleCollider(`${id}:scrub`, tree.x, tree.z, .5 * tree.scale, leafBottom, leafTop));
    }
    for (const building of TERRITORY_BUILDINGS) box(building.id, building.center[0], building.height / 2, building.center[1], building.size[0], building.height, building.size[1], building.rotation);
    for (let i = 0; i < TERRITORY_TREES.length; i++) {
      const tree = TERRITORY_TREES[i];
      trunk(`territory-tree:${i}`, tree.center[0], tree.center[1], tree.radius * 0.062, -0.075, tree.height * 0.63);
      crown(`territory-tree:${i}`, tree.center[0], tree.center[1], tree.radius, -0.075 + tree.height * 0.39, -0.075 + tree.height);
    }
    for (const patch of TERRITORY_PATCHES) if (patch.kind === 'water') polygon(patch.id, patch.ring, -2, 3);
    for (const cell of buildLateralResidentialRenderPlan()) {
      for (const part of cell.batches.masonry) box(part.id, ...part.position, ...part.scale, part.rotation[1]);
      for (const part of cell.batches.trunk) trunk(part.id, part.position[0], part.position[2], Math.max(part.scale[0], part.scale[2]) / 2, part.position[1] - part.scale[1] / 2, part.scale[1]);
      for (const part of [...cell.batches.canopy, ...cell.batches.palm]) crown(part.id, part.position[0], part.position[2], Math.max(part.scale[0], part.scale[2]) / 2, part.position[1] - part.scale[1] / 2, part.position[1] + part.scale[1] / 2);
      for (const surface of cell.surfaces) surfaces.push(visitGroundSurface(surface.id, surface.polygon, surface.elevation));
      for (const batch of [cell.batches.poolRect, cell.batches.poolRounded, cell.batches.poolKidney]) {
        for (const part of batch) if (part.id.endsWith('-pool-water')) box(part.id, part.position[0], part.position[1], part.position[2], part.scale[0], 0.4, part.scale[2], part.rotation[1]);
      }
    }
  }
  if (identifiers.has('D5')) {
    const crioulos = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
    crioulos.fence.segments.forEach((segment, index) => {
      const a = segment[0], b = segment[1], dx = b[0] - a[0], dz = b[1] - a[1];
      box(`crioulos-fence:${index}`, (a[0] + b[0]) / 2, 0.15, (a[1] + b[1]) / 2, Math.hypot(dx, dz), 0.3, 0.035, -Math.atan2(dz, dx));
    });
  }
  if (identifiers.has('B20')) {
    const s = NATIONS_DISTRICT_LAYOUT.stage;
    box('nations-stage', s.center[0], s.height / 2, s.center[1], s.width * 1.08, s.height, s.depth * 1.05, s.facingRadians);
  }
  if (identifiers.has('F')) {
    const bounds = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.accessCanopy.sourceBounds);
    const canopy = createArenaAccessLayout(bounds, MIRANTE_COMPLEX.levels.deck);
    for (const part of canopy.boxes) {
      const [x, y, z] = part.position;
      if (part.role === 'PLATFORM') surfaces.push(visitGroundSurface(part.id, visitBoxPolygon(bounds.centerX + x, bounds.centerZ + z, part.scale[0], part.scale[2]), y + part.scale[1] / 2));
      else box(part.id, bounds.centerX + x, y, bounds.centerZ + z, ...part.scale, part.rotation?.[1] ?? 0);
    }
    for (const part of canopy.segments) {
      if (part.role === 'ROOF_TRUSS' || part.role === 'LONGITUDINAL_TRUSS') continue;
      const a = part.start, b = part.end, dx = b[0] - a[0], dz = b[2] - a[2];
      box(part.id, bounds.centerX + (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, bounds.centerZ + (a[2] + b[2]) / 2, Math.max(part.thickness, Math.hypot(dx, dz)), Math.abs(b[1] - a[1]) + part.thickness, part.thickness, -Math.atan2(dz, dx));
    }
    for (const tree of ARENA_FRONT_LAYOUT.treeClusters) {
      const [x, z] = sourcePolygonToLocal([tree.sourcePosition])[0];
      if (!arenaVegetationAllowed([x, z], tree.scale * 0.3) || treeIntersectsGeneratedRearRoadCorridor({ position: [x, z], canopyRadius: tree.scale * 0.3 })) continue;
      const base = arenaTerrainElevation(x, z), trunkHeight = tree.scale * 0.34, crownRadius = tree.scale * 0.3;
      trunk(`arena-tree:${x}:${z}`, x, z, 0.045 * tree.scale, base, trunkHeight);
      crown(`arena-tree:${x}:${z}`, x, z, crownRadius, base + trunkHeight - crownRadius * 0.14, base + trunkHeight + crownRadius * 1.58);
    }
    for (const spec of [MIRANTE_COMPLEX.sidewalk, MIRANTE_COMPLEX.southApron]) surfaces.push(visitGroundSurface(`mirante:${spec.sourceBounds.join(':')}`, visitBoundsRing(sourceBoundsToLocal(spec.sourceBounds)), MIRANTE_COMPLEX.levels.sidewalk));
    const stairs = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.stairs.sourceBounds), config = ARENA_FRONT_LAYOUT.stairs;
    const bankDepth = stairs.depth / config.bankCount;
    const startX = stairs.maxX - config.lowerLandingDepth, endX = stairs.minX + config.upperLandingDepth;
    for (let bank = 0; bank <= config.bankCount; bank++) {
      const z = bank === 0 ? stairs.minZ + config.retainingWallWidth / 2 : bank === config.bankCount ? stairs.maxZ - config.retainingWallWidth / 2 : stairs.minZ + bank * bankDepth;
      const height = (MIRANTE_COMPLEX.levels.deck - ARENA_FRONT_LAYOUT.plaza.elevation) * 0.55;
      box(`arena-stair-wall:${bank}`, (startX + endX) / 2, ARENA_FRONT_LAYOUT.plaza.elevation + height / 2, z, startX - endX, height, config.retainingWallWidth);
    }
  }
  const bounds: VisitBounds = { ...COMMERCIAL_MAP_SPATIAL_BOUNDS.nearContextBounds };
  const ground = new VisitGroundingSystem(surfaces);
  const collisions = new VisitCollisionSystem(colliders, bounds);
  let maxHeight = 1;
  for (const collider of colliders) maxHeight = Math.max(maxHeight, collider.maxY);
  const world: VisitWorld = {
    bounds, maxHeight, ground, collisions,
    move: (position, dx, dz, radius = VISIT_CHARACTER_RADIUS, height = VISIT_CHARACTER_HEIGHT) => collisions.move(position, dx, dz, radius, height, ground.heightAt, ground.supportAt),
    cameraProbe: (from, to, radius = .025) => visitTerrainCameraFraction(ground, from, to, radius, collisions.cameraProbe(from, to, radius)),
    occluded: (from, to, ignoreId) => collisions.occluded(from, to, ignoreId) || visitTerrainOccluded(ground, from, to),
    resolveSpawn(preferred) {
      const x = Math.max(bounds.minX + 0.1, Math.min(bounds.maxX - 0.1, Number.isFinite(preferred.x) ? preferred.x : 0));
      const z = Math.max(bounds.minZ + 0.1, Math.min(bounds.maxZ - 0.1, Number.isFinite(preferred.z) ? preferred.z : 0));
      const result = { x, y: ground.supportAt(x, z).height, z };
      const arrivalTop = { x, y: maxHeight + 1, z }, arrivalEye = { x, y: result.y + 0.24, z };
      const valid = () => {
        if (!collisions.isFree(result)) return false;
        arrivalTop.x = arrivalEye.x = result.x; arrivalTop.z = arrivalEye.z = result.z; arrivalEye.y = result.y + 0.24;
        return collisions.cameraProbe(arrivalTop, arrivalEye, 0.035) === 1;
      };
      if (valid()) return result;
      // Nearest-free rings keep a requested lot/entrance nearby; never emit a
      // point inside a wall, even when the requested centroid is a pavilion.
      for (let ring = 1; ring <= 120; ring++) {
        const radius = ring * 0.15, samples = Math.max(12, Math.ceil(radius * 35));
        for (let sample = 0; sample < samples; sample++) {
          const angle = sample / samples * Math.PI * 2;
          result.x = x + Math.cos(angle) * radius; result.z = z + Math.sin(angle) * radius;
          result.y = ground.supportAt(result.x, result.z).height;
          if (valid()) return result;
        }
      }
      // A malformed giant collider fails explicitly instead of placing someone
      // inside it or silently teleporting them into another region.
      throw new Error('Nenhum ponto livre de visita foi encontrado perto deste espaço.');
    },
  };
  return world;
}

export function defaultVisitSpawn(): VisitPoint2 {
  const gate = PARK_ACCESS_SPATIAL_PLAN.gates.gate1;
  return { x: gate.anchor[0] + Math.cos(gate.approachHeadingRadians) * 0.9, z: gate.anchor[1] + Math.sin(gate.approachHeadingRadians) * 0.9 };
}
