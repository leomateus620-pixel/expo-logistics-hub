import type { Coordinate, MapEntity } from '../types';
import type { CommercialElectricalNode } from './electricalInfrastructure';

/**
 * Small presentation-only offsets for the reconstructed gate-four volumes.
 * The complete short gate alignment and the three poles beside pavilion 9
 * share their respective offset, preserving parallelism along each facade.
 * These are clearance adjustments, not surveyed corrections of the PDF.
 */
export const ELECTRICAL_ARCHITECTURE_CLEARANCE_PRESENTATION = {
  revision: '2026.08.27-gate-four-clearance.1',
  scope: 'PRESENTATION_ONLY',
  verificationStatus: 'FIELD_REVIEW_REQUIRED',
  sourceAnchorPreserved: true,
  topologyPreserved: true,
  groups: [
    {
      ownerIdentifier: 'A4',
      ownerClassification: 'GATE',
      sourceAlignmentChainId: 'AH-010',
      sourceMarkerIds: ['pole-ref-102', 'pole-ref-103', 'pole-ref-104'],
      offset: [0, -0.28],
      notes: 'Recuo ao norte do portal e da guarita; inclui a fase lateral e a folga de 0,22 unidades, sem deslocar a âncora oficial A4.',
    },
    {
      ownerIdentifier: 'PAVILHAO-09',
      ownerClassification: 'PAVILION',
      sourceAlignmentChainId: 'AV-018',
      sourceMarkerIds: ['pole-ref-129', 'pole-ref-154', 'pole-ref-178'],
      offset: [-0.08, 0],
      notes: 'Recuo paralelo a oeste do Pavilhão 9, dentro da faixa lateral, para proteger o envelope trifásico da nova fachada e cobertura.',
    },
  ],
} as const;

export function resolveElectricalArchitectureClearancePosition(
  node: CommercialElectricalNode,
  entityByIdentifier: ReadonlyMap<string, MapEntity>,
): Coordinate | null {
  if (node.mountMode !== 'GROUND_POLE') return null;
  const group = ELECTRICAL_ARCHITECTURE_CLEARANCE_PRESENTATION.groups.find((candidate) => (
    candidate.sourceMarkerIds.some((identifier) => identifier === node.sourceMarkerId)
    && entityByIdentifier.get(candidate.ownerIdentifier)?.classification === candidate.ownerClassification
  ));
  if (!group) return null;

  return [node.position[0] + group.offset[0], node.position[1] + group.offset[1]];
}

/** Presentation-only verge placement for poles intersecting the A6/A7 access ribbons. */
export const PARK_ACCESS_ELECTRICAL_CLEARANCE_PRESENTATION = {
  revision: '2026.09.01-gates-6-7-clearance.1',
  scope: 'PRESENTATION_ONLY',
  verificationStatus: 'FIELD_REVIEW_REQUIRED',
  sourceAnchorPreserved: true,
  topologyPreserved: true,
  groups: [
    {
      ownerIdentifier: 'A6',
      ownerClassification: 'GATE',
      roadSurfaceId: 'gate-6-gate-7-asphalt',
      sourceMarkerIds: ['pole-ref-026'],
      offset: [-0.5, -0.04],
      notes: 'Recuo curto para a margem oeste do eixo A6/A7; o marcador e a cadeia elétrica oficiais permanecem inalterados.',
    },
    {
      ownerIdentifier: 'RUA-GUSTAVO-BESSEL',
      ownerClassification: 'ROAD',
      roadSurfaceId: 'gate-7-gustavo-bessel-link',
      sourceMarkerIds: ['pole-ref-149'],
      offset: [-0.2, 0],
      notes: 'Recuo para a margem oeste do ramal sul, preservando o encaixe com a Rua Gustavo Bessel e a topologia elétrica.',
    },
  ],
} as const;

export function resolveParkAccessElectricalClearancePosition(
  node: CommercialElectricalNode,
  entityByIdentifier: ReadonlyMap<string, MapEntity>,
): Coordinate | null {
  if (node.mountMode !== 'GROUND_POLE') return null;
  const group = PARK_ACCESS_ELECTRICAL_CLEARANCE_PRESENTATION.groups.find((candidate) => (
    candidate.sourceMarkerIds.some((identifier) => identifier === node.sourceMarkerId)
    && entityByIdentifier.get(candidate.ownerIdentifier)?.classification === candidate.ownerClassification
  ));
  if (!group) return null;

  return [node.position[0] + group.offset[0], node.position[1] + group.offset[1]];
}

/** Ground-level rear-road QA: source markers and electrical topology stay intact.
 * These bounded display offsets apply only while the corrected rear roads render.
 * They are clearance decisions, not a revision of the official electrical survey. */
export const REAR_ROAD_ELECTRICAL_CLEARANCE_PRESENTATION = Object.freeze({
  revision: '2026.10-lateral-ubiretama-gate5.1',
  verificationStatus: 'FIELD_REVIEW_REQUIRED',
  offsets: Object.freeze({
    'pole-ref-222': [0.2, 0], // Brasília: margem leste na altura do pátio.
    'pole-ref-225': [-1, 0], // BR-472: park-side verge, beyond shoulder.
    'pole-ref-234': [0.32, 0], // Brasília: margem leste ao sul de D3.
    'pole-ref-145': [0.45, 0], // Ubiretama: margem leste na curva norte do acesso A5.
    'pole-ref-164': [0.45, 0], // Ubiretama: margem leste antes da curva dos estacionamentos.
    'pole-ref-321': [0, -0.12], // Uruguai: margem norte, sul do C1.
    'pole-ref-322': [0, -0.16],
    'pole-ref-323': [0, -0.22],
    'pole-ref-324': [0, -0.2],
    'pole-ref-330': [0, 0.26], // Ubiretama: margem sul no estacionamento.
    'pole-ref-336': [0, -0.32], // Ubiretama: margem norte na aproximação A5.
    'pole-ref-341': [0, 0.4], // Ubiretama: margem sul junto ao cadastro A5.
  } satisfies Readonly<Record<string, readonly [number, number]>>),
});

export function resolveRearRoadElectricalClearancePosition(node: CommercialElectricalNode): Coordinate | null {
  if (node.mountMode !== 'GROUND_POLE') return null;
  const offsets: Readonly<Record<string, readonly [number, number]>>
    = REAR_ROAD_ELECTRICAL_CLEARANCE_PRESENTATION.offsets;
  const offset = offsets[node.sourceMarkerId];
  return offset ? [node.position[0] + offset[0], node.position[1] + offset[1]] : null;
}
