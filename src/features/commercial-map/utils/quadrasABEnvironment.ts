import type { MapEntity } from '../types';
import {
  QUADRAS_AB_GROUND_MATERIALS,
  QUADRAS_AB_SPATIAL_REFERENCE,
  type QuadrasABGroundMaterialId,
} from '../data/quadrasABEnvironment';
import { OFFICIAL_RENDERED_ENTITIES } from '../data/officialReference2026';
import {
  buildCommercialSiteEnvironmentPlan,
  commercialSiteCellIntersectsHardMask,
  commercialSitePolygonBounds,
  commercialSitePolygonInteriorsOverlap,
  type CommercialSiteEnvironmentCell,
  type CommercialSiteHardSurfaceMask,
  type CommercialSitePoint,
} from './commercialSiteEnvironment';

export interface QuadrasABEnvironmentCell {
  id: string;
  quadra: 'A' | 'B';
  materialId: QuadrasABGroundMaterialId;
  polygon: readonly [CommercialSitePoint, CommercialSitePoint, CommercialSitePoint, CommercialSitePoint];
  center: CommercialSitePoint;
  elevation: number;
  colorVariation: number;
}

export interface QuadrasABEnvironmentPlan {
  cells: readonly QuadrasABEnvironmentCell[];
  cellsByMaterial: Readonly<Record<QuadrasABGroundMaterialId, readonly QuadrasABEnvironmentCell[]>>;
  hardSurfaceMasks: readonly CommercialSiteHardSurfaceMask[];
  preservedSiteTreatmentCells: readonly CommercialSiteEnvironmentCell[];
  detailAnchors: readonly CommercialSitePoint[];
  diagnostics: {
    cellCount: number;
    cellCountByQuadra: Readonly<Record<'A' | 'B', number>>;
    rejectedByHardMask: number;
    rejectedByPreservedTreatment: number;
    materialDrawCalls: number;
    maximumCells: number;
    withinCellBudget: boolean;
    withinDrawCallBudget: boolean;
    deterministicSignature: string;
  };
  semanticPolicy: typeof QUADRAS_AB_SPATIAL_REFERENCE.semanticPolicy;
}

const materialIds = Object.freeze(
  Object.keys(QUADRAS_AB_GROUND_MATERIALS) as QuadrasABGroundMaterialId[],
);

function deterministicUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function normalizedPosition(
  point: CommercialSitePoint,
  bounds: ReturnType<typeof commercialSitePolygonBounds>,
) {
  return [
    (point[0] - bounds.minimumX) / Math.max(1e-6, bounds.maximumX - bounds.minimumX),
    (point[1] - bounds.minimumZ) / Math.max(1e-6, bounds.maximumZ - bounds.minimumZ),
  ] as const;
}

function ellipseDistance(
  point: readonly [number, number],
  center: readonly [number, number],
  radius: readonly [number, number],
) {
  return Math.hypot((point[0] - center[0]) / radius[0], (point[1] - center[1]) / radius[1]);
}

function materialForCell(
  quadra: 'A' | 'B',
  center: CommercialSitePoint,
  bounds: ReturnType<typeof commercialSitePolygonBounds>,
  token: string,
): QuadrasABGroundMaterialId {
  const point = normalizedPosition(center, bounds);
  const noise = deterministicUnit(token);

  if (quadra === 'A') {
    const centralClearing = ellipseDistance(point, [0.52, 0.49], [0.24, 0.22]);
    const westShade = ellipseDistance(point, [0.13, 0.48], [0.18, 0.42]);
    const eastShade = ellipseDistance(point, [0.88, 0.5], [0.16, 0.4]);
    const southShade = ellipseDistance(point, [0.54, 0.88], [0.36, 0.15]);
    const northShade = ellipseDistance(point, [0.48, 0.08], [0.42, 0.13]);
    if (Math.min(westShade, eastShade, southShade, northShade) < 1 && noise > 0.18) return 'shaded-ground';
    if (centralClearing < 0.72 && noise > 0.22) return 'exposed-soil';
    if (centralClearing < 1.22 || noise > 0.68) return 'dry-grass';
    return 'maintained-grass';
  }

  const eastShade = ellipseDistance(point, [0.84, 0.49], [0.2, 0.48]);
  const northShade = ellipseDistance(point, [0.56, 0.09], [0.37, 0.15]);
  const openGround = ellipseDistance(point, [0.56, 0.54], [0.31, 0.34]);
  if (Math.min(eastShade, northShade) < 1 && noise > 0.24) return 'shaded-ground';
  if (openGround < 0.78 && noise > 0.48) return 'exposed-soil';
  if (openGround < 1.2 || noise > 0.72) return 'dry-grass';
  return 'maintained-grass';
}

function overlappingMasks(
  polygon: readonly CommercialSitePoint[],
  masks: readonly CommercialSiteHardSurfaceMask[],
) {
  const bounds = commercialSitePolygonBounds(polygon);
  return masks.filter((mask) => (
    mask.bounds.minimumX <= bounds.maximumX + mask.clearance
    && mask.bounds.maximumX + mask.clearance >= bounds.minimumX
    && mask.bounds.minimumZ <= bounds.maximumZ + mask.clearance
    && mask.bounds.maximumZ + mask.clearance >= bounds.minimumZ
    // Curved rear-road footprints can have large bounds but remain well away
    // from A/B. Reject them once per quadra, not once for every terrain cell.
    && commercialSiteCellIntersectsHardMask(polygon, mask)
  ));
}

function signature(cells: readonly QuadrasABEnvironmentCell[]) {
  let hash = 2166136261;
  cells.forEach((cell) => {
    const token = `${cell.id}|${cell.materialId}|${cell.center[0].toFixed(4)}|${cell.center[1].toFixed(4)}`;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  });
  return `quadras-ab-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Reserve each quadra's share before choosing spatially stratified litter points. */
function selectDetailAnchors(cells: readonly QuadrasABEnvironmentCell[], maximumAnchors: number) {
  const shaded = {
    A: cells.filter((cell) => cell.quadra === 'A' && cell.materialId === 'shaded-ground'),
    B: cells.filter((cell) => cell.quadra === 'B' && cell.materialId === 'shaded-ground'),
  };
  const total = shaded.A.length + shaded.B.length;
  if (total === 0) return Object.freeze([]) as readonly CommercialSitePoint[];
  const budget = Math.min(maximumAnchors, total);
  const countA = Math.min(shaded.A.length, Math.round(budget * shaded.A.length / total));
  const counts = { A: countA, B: Math.min(shaded.B.length, budget - countA) };

  return Object.freeze((['A', 'B'] as const).flatMap((quadra) => (
    Array.from({ length: counts[quadra] }, (_, index) => {
      // Cells are ordered north/south. One deterministic choice per interval
      // prevents a global slice from spending the complete budget in Quadra A.
      const start = Math.floor(index * shaded[quadra].length / counts[quadra]);
      const end = Math.floor((index + 1) * shaded[quadra].length / counts[quadra]);
      const candidates = shaded[quadra].slice(start, end);
      return candidates.reduce((selected, candidate) => (
        deterministicUnit(`${candidate.id}:detail`) > deterministicUnit(`${selected.id}:detail`)
          ? candidate : selected
      )).center;
    })
  )));
}

export function buildQuadrasABEnvironmentPlan({
  entities = OFFICIAL_RENDERED_ENTITIES,
  reducedGraphics = false,
}: {
  entities?: readonly MapEntity[];
  reducedGraphics?: boolean;
} = {}): QuadrasABEnvironmentPlan {
  // Reuse the exact existing plan, including its graphics-mode cell size,
  // instead of approximating the headquarters contact ring with another mesh.
  const sitePlan = buildCommercialSiteEnvironmentPlan({
    entities,
    reducedGraphics,
    treatmentOwnerIdentifiers: QUADRAS_AB_SPATIAL_REFERENCE.preservedSiteTreatmentOwnerIdentifiers,
  });
  const allMasks = sitePlan.hardSurfaceMasks;
  const preservedSiteTreatmentCells = Object.freeze(sitePlan.cells.filter((cell) => (
    cell.officialOwnerIdentifiers.some((identifier) => (
      QUADRAS_AB_SPATIAL_REFERENCE.preservedSiteTreatmentOwnerIdentifiers.includes(identifier)
    ))
    && [QUADRAS_AB_SPATIAL_REFERENCE.quadraA, QUADRAS_AB_SPATIAL_REFERENCE.quadraB]
      .some((reference) => commercialSitePolygonInteriorsOverlap(cell.polygon, reference.polygon))
  )));
  const preservedCellBounds = preservedSiteTreatmentCells.map((cell) => ({
    cell,
    bounds: commercialSitePolygonBounds(cell.polygon),
  }));
  const cells: QuadrasABEnvironmentCell[] = [];
  const relevantMasks = new Map<'A' | 'B', readonly CommercialSiteHardSurfaceMask[]>();
  let rejectedByHardMask = 0;
  let rejectedByPreservedTreatment = 0;

  ([['A', QUADRAS_AB_SPATIAL_REFERENCE.quadraA], ['B', QUADRAS_AB_SPATIAL_REFERENCE.quadraB]] as const)
    .forEach(([quadra, reference]) => {
      const bounds = commercialSitePolygonBounds(reference.polygon);
      const preservedCells = preservedCellBounds.filter(({ bounds: treatmentBounds }) => (
        treatmentBounds.minimumX < bounds.maximumX && treatmentBounds.maximumX > bounds.minimumX
        && treatmentBounds.minimumZ < bounds.maximumZ && treatmentBounds.maximumZ > bounds.minimumZ
      ));
      const masks = overlappingMasks(reference.polygon, allMasks);
      relevantMasks.set(quadra, masks);
      const cellSize = reducedGraphics
        ? QUADRAS_AB_SPATIAL_REFERENCE.reducedCellSize
        : QUADRAS_AB_SPATIAL_REFERENCE.fullCellSize;
      const columns = Math.floor((bounds.maximumX - bounds.minimumX) / cellSize);
      const rows = Math.floor((bounds.maximumZ - bounds.minimumZ) / cellSize);
      const offsetX = (bounds.maximumX - bounds.minimumX - columns * cellSize) / 2;
      const offsetZ = (bounds.maximumZ - bounds.minimumZ - rows * cellSize) / 2;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const minimumX = bounds.minimumX + offsetX + column * cellSize;
          const minimumZ = bounds.minimumZ + offsetZ + row * cellSize;
          const polygon = [
            [minimumX, minimumZ],
            [minimumX + cellSize, minimumZ],
            [minimumX + cellSize, minimumZ + cellSize],
            [minimumX, minimumZ + cellSize],
          ] as const satisfies readonly [CommercialSitePoint, CommercialSitePoint, CommercialSitePoint, CommercialSitePoint];
          if (masks.some((mask) => commercialSiteCellIntersectsHardMask(polygon, mask))) {
            rejectedByHardMask += 1;
            continue;
          }
          if (preservedCells.some(({ cell, bounds: treatmentBounds }) => (
            minimumX < treatmentBounds.maximumX && minimumX + cellSize > treatmentBounds.minimumX
            && minimumZ < treatmentBounds.maximumZ && minimumZ + cellSize > treatmentBounds.minimumZ
            && commercialSitePolygonInteriorsOverlap(polygon, cell.polygon)
          ))) {
            rejectedByPreservedTreatment += 1;
            continue;
          }
          const center: CommercialSitePoint = [minimumX + cellSize / 2, minimumZ + cellSize / 2];
          const id = `quadra-${quadra.toLowerCase()}:r${String(row).padStart(2, '0')}:c${String(column).padStart(2, '0')}`;
          const materialId = materialForCell(quadra, center, bounds, id);
          cells.push(Object.freeze({
            id,
            quadra,
            materialId,
            polygon: Object.freeze(polygon.map((point) => Object.freeze([...point]) as CommercialSitePoint)) as unknown as QuadrasABEnvironmentCell['polygon'],
            center,
            elevation: QUADRAS_AB_GROUND_MATERIALS[materialId].elevation + (deterministicUnit(`${id}:elevation`) - 0.5) * 0.0018,
            colorVariation: deterministicUnit(`${id}:color`) * 2 - 1,
          }));
        }
      }
    });

  const orderedCells = Object.freeze([...cells].sort((left, right) => left.id.localeCompare(right.id)));
  const cellsByMaterial = Object.freeze(Object.fromEntries(materialIds.map((materialId) => [
    materialId,
    Object.freeze(orderedCells.filter((cell) => cell.materialId === materialId)),
  ])) as Record<QuadrasABGroundMaterialId, readonly QuadrasABEnvironmentCell[]>);
  const materialDrawCalls = materialIds.filter((materialId) => cellsByMaterial[materialId].length > 0).length;
  const maximumCells = reducedGraphics
    ? QUADRAS_AB_SPATIAL_REFERENCE.renderBudget.maximumReducedCells
    : QUADRAS_AB_SPATIAL_REFERENCE.renderBudget.maximumFullCells;
  const hardSurfaceMasks = Object.freeze([...new Map(
    [...(relevantMasks.get('A') ?? []), ...(relevantMasks.get('B') ?? [])].map((mask) => [mask.id, mask]),
  ).values()].sort((left, right) => left.id.localeCompare(right.id)));
  const detailAnchors = selectDetailAnchors(orderedCells, reducedGraphics
    ? QUADRAS_AB_SPATIAL_REFERENCE.renderBudget.maximumReducedDetailAnchors
    : QUADRAS_AB_SPATIAL_REFERENCE.renderBudget.maximumFullDetailAnchors);

  return Object.freeze({
    cells: orderedCells,
    cellsByMaterial,
    hardSurfaceMasks,
    preservedSiteTreatmentCells,
    detailAnchors,
    diagnostics: Object.freeze({
      cellCount: orderedCells.length,
      cellCountByQuadra: Object.freeze({
        A: orderedCells.filter((cell) => cell.quadra === 'A').length,
        B: orderedCells.filter((cell) => cell.quadra === 'B').length,
      }),
      rejectedByHardMask,
      rejectedByPreservedTreatment,
      materialDrawCalls,
      maximumCells,
      withinCellBudget: orderedCells.length <= maximumCells,
      withinDrawCallBudget: materialDrawCalls <= QUADRAS_AB_SPATIAL_REFERENCE.renderBudget.maximumMaterialDrawCalls,
      deterministicSignature: signature(orderedCells),
    }),
    semanticPolicy: QUADRAS_AB_SPATIAL_REFERENCE.semanticPolicy,
  });
}
