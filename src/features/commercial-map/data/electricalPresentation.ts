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
  revision: '2026.09.01-arena-br472-clearance.3',
  verificationStatus: 'FIELD_REVIEW_REQUIRED',
  offsets: Object.freeze({
    'pole-ref-225': [-1, 0], // BR-472: park-side verge, beyond shoulder.
    'pole-ref-342': [0, 0.25], // Ubiretama: margem sul junto ao acesso A5.
    'pole-ref-363': [0, 0.5], // Cruzamento Brasília–Ubiretama: margem sul.
  } satisfies Readonly<Record<string, readonly [number, number]>>),
});

export function resolveRearRoadElectricalClearancePosition(node: CommercialElectricalNode): Coordinate | null {
  if (node.mountMode !== 'GROUND_POLE') return null;
  const offsets: Readonly<Record<string, readonly [number, number]>>
    = REAR_ROAD_ELECTRICAL_CLEARANCE_PRESENTATION.offsets;
  const offset = offsets[node.sourceMarkerId];
  return offset ? [node.position[0] + offset[0], node.position[1] + offset[1]] : null;
}
