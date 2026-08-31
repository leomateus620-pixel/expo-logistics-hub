import type { Coordinate } from '../types';
import { officialPdfPointToLocal } from './officialReference2026';

export type QuadrasABGroundMaterialId =
  | 'maintained-grass'
  | 'dry-grass'
  | 'exposed-soil'
  | 'shaded-ground';

export interface QuadrasABGroundMaterialDefinition {
  id: QuadrasABGroundMaterialId;
  surface: 'landscapeGrass' | 'parkingGrassDryMix' | 'compactedSoil';
  color: string;
  roughness: number;
  elevation: number;
  tileWorldSize: number;
  normalScale: number;
}

const sourceRectangle = (
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
) => Object.freeze([
  [minimumX, minimumZ],
  [maximumX, minimumZ],
  [maximumX, maximumZ],
  [minimumX, maximumZ],
] as const satisfies readonly Coordinate[]);

const toLocalPolygon = (polygon: readonly Coordinate[]) => Object.freeze(
  polygon.map((point) => Object.freeze(officialPdfPointToLocal(point)) as Coordinate),
);

const quadra = (
  identifier: 'QUADRA-A' | 'QUADRA-B',
  sourceBounds: readonly [number, number, number, number],
) => {
  const sourcePolygon = sourceRectangle(...sourceBounds);
  return Object.freeze({
    identifier,
    sourceBounds,
    sourcePolygon,
    polygon: toLocalPolygon(sourcePolygon),
  });
};

export const QUADRAS_AB_GROUND_MATERIALS = Object.freeze({
  'maintained-grass': Object.freeze({
    id: 'maintained-grass',
    surface: 'landscapeGrass',
    color: '#647f52',
    roughness: 1,
    elevation: 0.0305,
    tileWorldSize: 6.8,
    normalScale: 0.14,
  }),
  'dry-grass': Object.freeze({
    id: 'dry-grass',
    surface: 'parkingGrassDryMix',
    color: '#7c8057',
    roughness: 1,
    elevation: 0.031,
    tileWorldSize: 7.8,
    normalScale: 0.16,
  }),
  'exposed-soil': Object.freeze({
    id: 'exposed-soil',
    surface: 'compactedSoil',
    color: '#786c50',
    roughness: 1,
    elevation: 0.032,
    tileWorldSize: 5.4,
    normalScale: 0.2,
  }),
  'shaded-ground': Object.freeze({
    id: 'shaded-ground',
    surface: 'compactedSoil',
    color: '#515c46',
    roughness: 1,
    elevation: 0.0315,
    tileWorldSize: 6.2,
    normalScale: 0.15,
  }),
} satisfies Record<QuadrasABGroundMaterialId, QuadrasABGroundMaterialDefinition>);

export const QUADRAS_AB_SPATIAL_REFERENCE = Object.freeze({
  revision: '2026.8-quadras-ab-satellite.1',
  sourceReference: 'WhatsApp Image 2026-08-30 at 23.40.19.jpeg',
  interpretation: 'SATELLITE_NORMALIZED_TO_OFFICIAL_2026_POLYGONS',
  quadraA: quadra('QUADRA-A', [4020, 3780, 4510, 4165]),
  quadraB: quadra('QUADRA-B', [4020, 3495, 4510, 3720]),
  boundaryRoadIdentifiers: Object.freeze([
    'RUA-URUGUAI-LESTE',
    'RUA-ARGENTINA-LESTE',
    'RUA-BRASILIA',
    'AV-IMIGRANTES',
  ]),
  protectedStructureIdentifiers: Object.freeze([
    'B12', 'B13', 'B18', 'B30', 'B42-02',
  ]),
  // Keep the already validated headquarters ground-contact treatment as the
  // sole visible surface wherever its rendered cells meet the new landscape.
  preservedSiteTreatmentOwnerIdentifiers: Object.freeze(['B12']),
  satelliteAnchors: Object.freeze([
    Object.freeze({ id: 'a-central-clearing', quadra: 'A', sourcePosition: [4268, 3970] as const, role: 'CLEARING' }),
    Object.freeze({ id: 'a-west-canopy', quadra: 'A', sourcePosition: [4090, 3950] as const, role: 'SHADE_MASS' }),
    Object.freeze({ id: 'a-east-canopy', quadra: 'A', sourcePosition: [4440, 3970] as const, role: 'SHADE_MASS' }),
    Object.freeze({ id: 'a-south-canopy', quadra: 'A', sourcePosition: [4290, 4090] as const, role: 'SHADE_MASS' }),
    Object.freeze({ id: 'b-east-canopy', quadra: 'B', sourcePosition: [4425, 3600] as const, role: 'SHADE_MASS' }),
    Object.freeze({ id: 'b-open-ground', quadra: 'B', sourcePosition: [4315, 3605] as const, role: 'CLEARING' }),
  ]),
  fullCellSize: 0.34,
  reducedCellSize: 0.56,
  renderBudget: Object.freeze({
    maximumFullCells: 1450,
    maximumReducedCells: 620,
    maximumMaterialDrawCalls: 4,
    maximumFullDetailAnchors: 34,
    maximumReducedDetailAnchors: 14,
    detailDrawCalls: 1,
    selectableObjects: 0,
  }),
  semanticPolicy: Object.freeze({
    presentationOnly: true,
    mutatesOfficialGeometry: false,
    createsMapEntities: false,
    createsSelectableObjects: false,
  }),
});
