import type { Coordinate } from '../types';
import { GATE_FOUR_DISTRICT_LAYOUT } from './gateFourDistrict';
import { officialPdfPointToLocal } from './officialReference2026';

export type CommercialSiteEnvironmentMaterialId =
  | 'foundation-contact'
  | 'concrete-apron'
  | 'compacted-ground'
  | 'grass-dry-mix';

export type CommercialSiteEnvironmentTreatmentId =
  | 'site-environment:B8+B9'
  | 'site-environment:B11'
  | 'site-environment:B12'
  | 'site-environment:B14'
  | 'site-environment:PAVILHAO-09';

export interface CommercialSiteEnvironmentMaterialDefinition {
  id: CommercialSiteEnvironmentMaterialId;
  color: string;
  roughness: number;
  elevation: number;
  colorVariation: number;
  polygonOffsetFactor: number;
}

export interface CommercialSiteEnvironmentMaterialBand {
  /** Maximum distance, in local map units, from the protected host footprint. */
  maximumDistance: number;
  materialId: CommercialSiteEnvironmentMaterialId;
}

export interface CommercialSiteEnvironmentTreatmentDefinition {
  id: CommercialSiteEnvironmentTreatmentId;
  officialOwnerIdentifiers: readonly string[];
  purpose: 'FUNCTIONAL_PAVILION_EDGE' | 'ADMINISTRATIVE_GROUND_CONTACT' | 'CIVIC_APRON' | 'EXISTING_APRON_EDGE';
  envelopeSourcePdf: readonly Coordinate[];
  envelope: readonly Coordinate[];
  hostGeometry: 'OFFICIAL_FOOTPRINTS' | 'EXISTING_PAVILION_09_SERVICE_APRON';
  materialBands: readonly CommercialSiteEnvironmentMaterialBand[];
  fullCellSize: number;
  reducedCellSize: number;
  provenance: string;
}

const sourceRectangle = (
  minimumX: number,
  minimumY: number,
  maximumX: number,
  maximumY: number,
) => [
  [minimumX, minimumY],
  [maximumX, minimumY],
  [maximumX, maximumY],
  [minimumX, maximumY],
] as const satisfies readonly Coordinate[];

const sourcePolygonToLocal = (polygon: readonly Coordinate[]) => (
  polygon.map((point) => officialPdfPointToLocal(point))
);

const treatment = (
  definition: Omit<CommercialSiteEnvironmentTreatmentDefinition, 'envelope'>,
): CommercialSiteEnvironmentTreatmentDefinition => Object.freeze({
  ...definition,
  envelope: Object.freeze(sourcePolygonToLocal(definition.envelopeSourcePdf)),
});

/**
 * Four restrained, non-metal exterior materials. They are presentation tokens,
 * not new cadastral surfaces or selectable entities.
 */
export const COMMERCIAL_SITE_ENVIRONMENT_MATERIALS = Object.freeze({
  'foundation-contact': Object.freeze({
    id: 'foundation-contact',
    color: '#6f705a',
    roughness: 1,
    elevation: 0.033,
    colorVariation: 0.045,
    polygonOffsetFactor: -0.55,
  }),
  'concrete-apron': Object.freeze({
    id: 'concrete-apron',
    color: '#aaa99d',
    roughness: 0.94,
    elevation: 0.041,
    colorVariation: 0.035,
    polygonOffsetFactor: -0.9,
  }),
  'compacted-ground': Object.freeze({
    id: 'compacted-ground',
    color: '#9a8d6f',
    roughness: 0.99,
    elevation: 0.035,
    colorVariation: 0.055,
    polygonOffsetFactor: -0.65,
  }),
  'grass-dry-mix': Object.freeze({
    id: 'grass-dry-mix',
    color: '#718458',
    roughness: 1,
    elevation: 0.031,
    colorVariation: 0.07,
    polygonOffsetFactor: -0.45,
  }),
} satisfies Record<CommercialSiteEnvironmentMaterialId, CommercialSiteEnvironmentMaterialDefinition>);

/**
 * The five envelopes are conservative presentation zones measured in the same
 * official-PDF frame as their hosts. B8 and B9 deliberately share one envelope:
 * no second livestock/veterinary district is introduced.
 */
export const COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS = Object.freeze([
  treatment({
    id: 'site-environment:B8+B9',
    officialOwnerIdentifiers: Object.freeze(['B8', 'B9']),
    purpose: 'FUNCTIONAL_PAVILION_EDGE',
    envelopeSourcePdf: sourceRectangle(2288, 2185, 3442, 2435),
    hostGeometry: 'OFFICIAL_FOOTPRINTS',
    materialBands: Object.freeze([
      Object.freeze({ maximumDistance: 0.28, materialId: 'foundation-contact' }),
      Object.freeze({ maximumDistance: 0.84, materialId: 'compacted-ground' }),
      Object.freeze({ maximumDistance: 1.18, materialId: 'grass-dry-mix' }),
    ]),
    fullCellSize: 0.34,
    reducedCellSize: 0.52,
    provenance: 'Anel funcional externo aos footprints oficiais B8+B9; recortado pela Pista Campeira, Rua Paraguai, estacionamentos e demais superfícies duras.',
  }),
  treatment({
    id: 'site-environment:B11',
    officialOwnerIdentifiers: Object.freeze(['B11']),
    purpose: 'ADMINISTRATIVE_GROUND_CONTACT',
    envelopeSourcePdf: sourceRectangle(3688, 3815, 3902, 4164),
    hostGeometry: 'OFFICIAL_FOOTPRINTS',
    materialBands: Object.freeze([
      Object.freeze({ maximumDistance: 0.3, materialId: 'foundation-contact' }),
      Object.freeze({ maximumDistance: 0.94, materialId: 'grass-dry-mix' }),
    ]),
    fullCellSize: 0.3,
    reducedCellSize: 0.48,
    provenance: 'Contato externo do Centro Administrativo B11, sem pavimentar a Avenida Benvenuto, o apron do Portão 3 ou estruturas vizinhas.',
  }),
  treatment({
    id: 'site-environment:B12',
    officialOwnerIdentifiers: Object.freeze(['B12']),
    purpose: 'ADMINISTRATIVE_GROUND_CONTACT',
    envelopeSourcePdf: sourceRectangle(4005, 3595, 4205, 3765),
    hostGeometry: 'OFFICIAL_FOOTPRINTS',
    materialBands: Object.freeze([
      Object.freeze({ maximumDistance: 0.3, materialId: 'foundation-contact' }),
      Object.freeze({ maximumDistance: 1.02, materialId: 'grass-dry-mix' }),
    ]),
    fullCellSize: 0.3,
    reducedCellSize: 0.48,
    provenance: 'Anel de implantação da Sede Fenasoja B12 entre estruturas e vias oficiais; o interior arquitetônico existente permanece intocado.',
  }),
  treatment({
    id: 'site-environment:B14',
    officialOwnerIdentifiers: Object.freeze(['B14']),
    purpose: 'CIVIC_APRON',
    envelopeSourcePdf: sourceRectangle(3992, 3800, 4260, 4080),
    hostGeometry: 'OFFICIAL_FOOTPRINTS',
    materialBands: Object.freeze([
      Object.freeze({ maximumDistance: 0.42, materialId: 'foundation-contact' }),
      Object.freeze({ maximumDistance: 0.8, materialId: 'concrete-apron' }),
      Object.freeze({ maximumDistance: 1.28, materialId: 'grass-dry-mix' }),
    ]),
    fullCellSize: 0.3,
    reducedCellSize: 0.48,
    provenance: 'Apron cívico e borda gramada recortados por B31, B32, Rua Brasília e todo inventário funcional existente.',
  }),
  treatment({
    id: 'site-environment:PAVILHAO-09',
    officialOwnerIdentifiers: Object.freeze(['PAVILHAO-09']),
    purpose: 'EXISTING_APRON_EDGE',
    envelopeSourcePdf: sourceRectangle(1650, 1816, 1960, 2422),
    hostGeometry: 'EXISTING_PAVILION_09_SERVICE_APRON',
    materialBands: Object.freeze([
      Object.freeze({ maximumDistance: 0.34, materialId: 'foundation-contact' }),
      Object.freeze({ maximumDistance: 0.86, materialId: 'grass-dry-mix' }),
    ]),
    fullCellSize: 0.3,
    reducedCellSize: 0.48,
    provenance: 'Derivação exclusiva do perímetro do serviceApron existente no GateFourDistrict; o apron não é recriado nem sobreposto.',
  }),
] satisfies readonly CommercialSiteEnvironmentTreatmentDefinition[]);

/** The existing apron is a protected input to the derivation, never output geometry. */
export const COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON = Object.freeze({
  id: 'existing-site:PAVILHAO-09:service-apron',
  officialOwnerIdentifier: 'PAVILHAO-09',
  polygon: GATE_FOUR_DISTRICT_LAYOUT.pavilion9.serviceApron.polygon,
  sourcePdfPolygon: GATE_FOUR_DISTRICT_LAYOUT.pavilion9.serviceApron.sourcePdfPolygon,
  source: 'GATE_FOUR_DISTRICT_LAYOUT.pavilion9.serviceApron',
});

export const COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET = Object.freeze({
  materialCount: 4,
  maximumFullDrawCalls: 6,
  maximumReducedDrawCalls: 4,
  maximumFullCells: 2600,
  maximumReducedCells: 1300,
  maximumVerticesPerCell: 4,
  independentMeshesPerCell: 0,
  textureAssets: 0,
});

export const COMMERCIAL_SITE_ENVIRONMENT_REFERENCE = Object.freeze({
  revision: '2026.8-commercial-site-environment.1',
  scope: 'PRESENTATION_ONLY',
  officialOwnerIdentifiers: Object.freeze(['B8', 'B9', 'B11', 'B12', 'B14', 'PAVILHAO-09']),
  createsMapEntities: false,
  createsSelectableObjects: false,
  mutatesOfficialGeometry: false,
  introducesCasaDaFenasoja: false,
  treatmentCount: COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS.length,
});
