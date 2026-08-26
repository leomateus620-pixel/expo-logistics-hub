import {
  createCommercialPavilionReferenceProjectionFrame,
  projectCommercialPavilionReferencePoint,
  projectCommercialPavilionReferenceRect,
  transformCommercialPavilionReferenceWallEdge,
  type CommercialPavilionReferenceSourcePrecision,
  type CommercialPavilionReferenceWallAccess,
  type CommercialPavilionReferenceWallEdge,
} from '../data/commercialPavilionReference';
import type {
  CommercialPavilionModulePlan,
} from './commercialPavilionModules';

export type CommercialPavilionWayfindingMarkerKind =
  | 'entrance'
  | 'exit'
  | 'bidirectional'
  | 'emergency'
  | 'connection';

export interface CommercialPavilionWayfindingMarker {
  id: string;
  label: string;
  kind: CommercialPavilionWayfindingMarkerKind;
  edge: CommercialPavilionReferenceWallEdge;
  position: readonly [x: number, z: number];
  span: number;
  sourcePrecision: CommercialPavilionReferenceSourcePrecision;
  targetPublicIdentifier?: string;
}

function markerKind(
  access: CommercialPavilionReferenceWallAccess,
): CommercialPavilionWayfindingMarkerKind | null {
  if (access.connectsTo) return 'connection';
  if (access.kind === 'entrance') return 'entrance';
  if (access.kind === 'exit') return 'exit';
  if (access.kind === 'gate') return 'bidirectional';
  if (access.kind === 'emergency') return 'emergency';
  return null;
}

function markerLabel(
  access: CommercialPavilionReferenceWallAccess,
  kind: CommercialPavilionWayfindingMarkerKind,
): string {
  if (access.label) return access.label;
  if (kind === 'entrance') return 'Entrada';
  if (kind === 'exit') return 'Saída';
  if (kind === 'bidirectional') return 'Entrada e saída';
  if (kind === 'emergency') return 'Saída de emergência';
  return 'Acesso entre pavilhões';
}

function markerAtEdge({
  access,
  kind,
  edge,
  centerX,
  centerZ,
  span,
}: {
  access: CommercialPavilionReferenceWallAccess;
  kind: CommercialPavilionWayfindingMarkerKind;
  edge: CommercialPavilionReferenceWallEdge;
  centerX: number;
  centerZ: number;
  span: number;
}): CommercialPavilionWayfindingMarker {
  return {
    id: access.id,
    label: markerLabel(access, kind),
    kind,
    edge,
    position: [centerX, centerZ],
    span,
    sourcePrecision: access.sourcePrecision,
    ...(access.connectsTo ? { targetPublicIdentifier: access.connectsTo } : {}),
  };
}

/**
 * Projects the plan-owned access points into the same pavilion-local frame as
 * modules and corridors. It is display-only and never mutates pavilion data.
 */
export function resolveCommercialPavilionWayfindingMarkers(
  plan: Pick<
    CommercialPavilionModulePlan,
    'publicIdentifier' | 'projection' | 'corridors' | 'wallAccesses'
  >,
  footprint: { width: number; depth: number },
): CommercialPavilionWayfindingMarker[] {
  const frame = createCommercialPavilionReferenceProjectionFrame(plan.projection, footprint);
  const corridorById = new Map(plan.corridors.map((corridor) => [corridor.id, corridor]));
  const metricWidthM = plan.projection.metricWidthM;
  const metricDepthM = plan.projection.metricDepthM;

  return plan.wallAccesses.flatMap((access) => {
    if (access.structuralOpening !== false) return [];
    const kind = markerKind(access);
    if (!kind) return [];

    if ('corridorId' in access) {
      const corridor = corridorById.get(access.corridorId);
      if (!corridor) {
        throw new Error(`Acesso visual ${access.id} referencia corredor inexistente.`);
      }
      const projected = projectCommercialPavilionReferenceRect(corridor, frame);
      return access.edges.map((edge) => {
        const frontOrRear = edge === 'front' || edge === 'rear';
        return markerAtEdge({
          access,
          kind,
          edge,
          centerX: frontOrRear
            ? projected.centerX
            : edge === 'left'
              ? frame.centerX - frame.width / 2
              : frame.centerX + frame.width / 2,
          centerZ: frontOrRear
            ? edge === 'front'
              ? frame.centerZ + frame.depth / 2
              : frame.centerZ - frame.depth / 2
            : projected.centerZ,
          span: frontOrRear ? projected.width : projected.depth,
        });
      });
    }

    if (!metricWidthM || !metricDepthM) {
      throw new Error(`Acesso visual métrico ${access.id} exige dimensões oficiais no plano.`);
    }
    const sourcePoint = access.wall === 'front'
      ? [access.centerAlongWallM / metricWidthM, 1] as const
      : access.wall === 'rear'
        ? [access.centerAlongWallM / metricWidthM, 0] as const
        : access.wall === 'left'
          ? [0, access.centerAlongWallM / metricDepthM] as const
          : [1, access.centerAlongWallM / metricDepthM] as const;
    const sourceSpanRect = access.wall === 'front' || access.wall === 'rear'
      ? {
          centerX: sourcePoint[0],
          centerZ: sourcePoint[1],
          width: access.openingWidthM / metricWidthM,
          depth: 0,
        }
      : {
          centerX: sourcePoint[0],
          centerZ: sourcePoint[1],
          width: 0,
          depth: access.openingWidthM / metricDepthM,
        };
    const [centerX, centerZ] = projectCommercialPavilionReferencePoint(sourcePoint, frame);
    const projectedSpan = projectCommercialPavilionReferenceRect(sourceSpanRect, frame);
    const edge = transformCommercialPavilionReferenceWallEdge(
      access.wall,
      plan.projection.coordinateTransform,
    );
    return [markerAtEdge({
      access,
      kind,
      edge,
      centerX,
      centerZ,
      span: Math.max(projectedSpan.width, projectedSpan.depth),
    })];
  });
}
