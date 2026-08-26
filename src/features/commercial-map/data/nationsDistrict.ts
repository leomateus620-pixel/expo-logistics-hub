import type { Coordinate, MapEntity } from '../types';
import { officialPdfPointToLocal } from './officialReference2026';

type PdfPoint = readonly [number, number];
export type NationsDistrictPoint = readonly [number, number];

interface NationsDistrictSource {
  id: string;
  fileName: string;
  role: 'current-map' | 'satellite' | 'interpreted-plan';
  notes: string;
}

export interface NationsDistrictIsland {
  id: string;
  center: NationsDistrictPoint;
  width: number;
  depth: number;
  insetScale: number;
  stairBands: number;
}

export interface NationsDistrictTree {
  id: string;
  sourcePosition: readonly [number, number];
  position: NationsDistrictPoint;
  scale: number;
  rotation: number;
}

const toMapPoint = (source: PdfPoint): NationsDistrictPoint => (
  officialPdfPointToLocal(source) as NationsDistrictPoint
);

const toMapPolygon = (source: readonly PdfPoint[]): readonly NationsDistrictPoint[] => (
  source.map(toMapPoint)
);

const mapLengthX = (sourceLength: number) => {
  const start = toMapPoint([600, 900]);
  const end = toMapPoint([600 + sourceLength, 900]);
  return Math.abs(end[0] - start[0]);
};

const mapLengthZ = (sourceLength: number) => {
  const start = toMapPoint([600, 900]);
  const end = toMapPoint([600, 900 + sourceLength]);
  return Math.abs(end[1] - start[1]);
};

export const NATIONS_DISTRICT_REFERENCE = {
  revision: '2026.5-nations.1',
  interpretation: 'satellite-and-annotated-plan',
  sources: [
    {
      id: 'annex-1',
      fileName: 'IMG_9667.jpeg',
      role: 'current-map',
      notes: 'Estado anterior em perspectiva, usado apenas para auditar os blocos e bases genéricas.',
    },
    {
      id: 'annex-2',
      fileName: 'IMG_9668.jpeg',
      role: 'current-map',
      notes: 'Estado anterior em visão ampla, usado para conferir a relação com o estacionamento ao norte.',
    },
    {
      id: 'annex-3',
      fileName: 'IMG_9669.jpeg',
      role: 'current-map',
      notes: 'Estado anterior pelo sul, usado para conferir rótulos e eixo de chegada.',
    },
    {
      id: 'annex-4',
      fileName: 'IMG_9670 (1).jpeg',
      role: 'satellite',
      notes: 'Leitura aérea real do maciço vegetal, coberturas, vazio central e limites pavimentados.',
    },
    {
      id: 'annex-5',
      fileName: 'IMG_9671.jpeg',
      role: 'interpreted-plan',
      notes: 'Implantação anotada usada para relações, orientação e estimativa do Palco.',
    },
  ] satisfies readonly NationsDistrictSource[],
  confidence: {
    existingStructureCenters: 'HIGH',
    stageCenterAndFootprint: 'INTERPRETED_FROM_ANNEX_5',
    individualTreeCenters: 'FIELD_REVIEW_RECOMMENDED',
    altimetry: 'NOT_SURVEYED',
  },
} as const;

export const NATIONS_DISTRICT_REQUIRED_IDENTIFIERS = [
  'B20',
  'B29',
  'C5',
  'C6',
  'C7',
  'C8',
  'PORTICO-NACOES',
] as const;

export const NATIONS_DISTRICT_PRESENTATION_SURFACE_IDENTIFIERS = [
  'B20',
  'ESPACO-ETNIA-RUSSA',
  'ESPACO-ETNIA-ARABE',
  'ESPACO-ETNIA-PORTUGUESA',
] as const;

const presentationSurfaceIdentifiers = new Set<string>(
  NATIONS_DISTRICT_PRESENTATION_SURFACE_IDENTIFIERS,
);

export function isNationsDistrictPresentationSurface(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): boolean {
  return presentationSurfaceIdentifiers.has(entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR'));
}

export function shouldRenderNationsDistrict(
  entities: readonly Pick<MapEntity, 'publicIdentifier'>[],
): boolean {
  const identifiers = new Set(entities.map((entity) => (
    entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR')
  )));
  return NATIONS_DISTRICT_REQUIRED_IDENTIFIERS.every((identifier) => identifiers.has(identifier));
}

export const NATIONS_DISTRICT_LAYOUT = {
  center: toMapPoint([4935, 4610]),
  grassBoundary: toMapPolygon([
    [4495, 4270],
    [4770, 4270],
    [4820, 4235],
    [5050, 4235],
    [5100, 4270],
    [5335, 4270],
    [5350, 4925],
    [5300, 5105],
    [5105, 5160],
    [4740, 5160],
    [4490, 5070],
  ]),
  mainAsphalt: toMapPolygon([
    [4792, 4320],
    [5058, 4320],
    [5090, 4352],
    [5090, 4833],
    [5058, 4865],
    [4792, 4865],
    [4760, 4833],
    [4760, 4352],
  ]),
  civicPaving: toMapPolygon([
    [4868, 4380],
    [5002, 4380],
    [5025, 4404],
    [5025, 4816],
    [5002, 4840],
    [4868, 4840],
    [4845, 4816],
    [4845, 4404],
  ]),
  northApproach: toMapPolygon([
    [4890, 4245],
    [4980, 4245],
    [4980, 4382],
    [4890, 4382],
  ]),
  southApproach: toMapPolygon([
    [4850, 4830],
    [5020, 4830],
    [5020, 5010],
    [4850, 5010],
  ]),
  stageApron: toMapPolygon([
    [4828, 4895],
    [5042, 4895],
    [5070, 4930],
    [5070, 5078],
    [4800, 5078],
    [4800, 4930],
  ]),
  islands: [
    {
      id: 'north',
      center: toMapPoint([4933, 4396]),
      width: mapLengthX(96),
      depth: mapLengthZ(147),
      insetScale: 0.62,
      stairBands: 6,
    },
    {
      id: 'center',
      center: toMapPoint([4935, 4537]),
      width: mapLengthX(90),
      depth: mapLengthZ(151),
      insetScale: 0.56,
      stairBands: 5,
    },
    {
      id: 'south',
      center: toMapPoint([4932, 4687]),
      width: mapLengthX(118),
      depth: mapLengthZ(164),
      insetScale: 0.64,
      stairBands: 6,
    },
  ] satisfies readonly NationsDistrictIsland[],
  stage: {
    center: toMapPoint([4931, 4972]),
    width: mapLengthX(182),
    depth: mapLengthZ(131),
    height: 1.86,
    facingRadians: Math.PI,
    sourcePdfBounds: [4840, 4906, 5022, 5037] as const,
  },
  trees: [
    [4525, 4282], [4610, 4264], [4702, 4272], [4750, 4315],
    [5122, 4280], [5208, 4260], [5292, 4290],
    [5312, 4390], [5320, 4485], [5310, 4580], [5318, 4685], [5302, 4795], [5285, 4895], [5310, 5000],
    [5220, 5088], [5145, 5122], [5055, 5140], [4960, 5148], [4868, 5138], [4778, 5120], [4690, 5092],
    [4518, 4455], [4508, 4608], [4532, 4765], [4515, 4920],
  ].map(([x, z], index) => ({
    id: `nations-tree-${String(index + 1).padStart(2, '0')}`,
    sourcePosition: [x, z] as const,
    position: toMapPoint([x, z]),
    scale: 0.84 + (index * 17 % 29) / 100,
    rotation: (index * 2.399963229728653) % (Math.PI * 2),
  })) satisfies readonly NationsDistrictTree[],
} as const;

export const NATIONS_DISTRICT_RENDER_BUDGET = {
  district: {
    baseDrawCalls: 14,
    detailedDrawCalls: 18,
    treeInstances: NATIONS_DISTRICT_LAYOUT.trees.length,
    animatedDrawCalls: 0,
  },
  africanPavilion: {
    baseDrawCalls: 10,
    detailedDrawCalls: 14,
  },
  rotaryHouse: {
    baseDrawCalls: 9,
    detailedDrawCalls: 13,
  },
} as const;

export const NATIONS_DISTRICT_STAGE_CENTER: Coordinate = [
  NATIONS_DISTRICT_LAYOUT.stage.center[0],
  NATIONS_DISTRICT_LAYOUT.stage.center[1],
];
