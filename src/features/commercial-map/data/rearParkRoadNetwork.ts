import { EXPORURAL_ROAD_IDENTIFIERS } from './exporuralReference2026';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from './officialReference2026';
import {
  REAR_CALIBRATED_AXES,
  REAR_OFFICIAL_ANCHORS,
  rearAttachment5ReferencePointById,
} from '../utils/rearSpatialCalibration';

/**
 * Rede viária posterior — correção topológica 2026.9.8.
 *
 * As entidades cadastrais continuam sendo as únicas donas de busca, seleção e
 * metadados. A camada substitui somente as três apresentações incompatíveis:
 * Brasília, Ubiretama e a faixa esquemática da RS-472. Rua das Etnias conserva
 * sua superfície oficial e termina em P1. Nenhum eixo fecha uma alça pela mata.
 */

export type CanonicalRearRoadId =
  | 'RUA-BRASILIA'
  | 'RUA-UBIRETAMA'
  | 'RUA-DAS-ETNIAS'
  | 'RODOVIA-RS-472';
export type RearRoadFeatureId = CanonicalRearRoadId | 'ACESSO-A5-BR472';

export type RoadNodeId =
  | 'etnias-west'
  | 'etnias-terminus-1'
  | 'brasilia-south'
  | 'brasilia-reference-2'
  | 'brasilia-reference-3'
  | 'brasilia-ubiretama-junction-4'
  | 'ubiretama-reference-5'
  | 'gate-5'
  | 'a5-br-junction'
  | 'br472-north'
  | 'br472-south';

export type RoadCategory = 'federal-highway' | 'park-avenue' | 'internal-access';
export type RoadMarkings = 'highway' | 'internal' | 'none';
export type RoadPresentation = 'generated-surface' | 'official-surface';
export type SourcePoint = readonly [number, number];
export type LocalPoint = readonly [number, number];
export type WorldRoadPoint = readonly [number, number, number];

export interface RoadNode {
  id: RoadNodeId;
  /** Centro cadastral do nó. Para A5, é o centro da única entidade oficial. */
  sourcePoint: SourcePoint;
  /** Posição física da pista. Para A5, é a passagem veicular na borda. */
  roadAccessSourcePoint: SourcePoint;
  position: WorldRoadPoint;
  officialEntityIdentifier?: string;
}

export interface RoadSegment {
  id: string;
  roadId: RearRoadFeatureId;
  name: string;
  from: RoadNodeId;
  to: RoadNodeId;
  category: RoadCategory;
  controlPoints: readonly WorldRoadPoint[];
  sourceControlPoints: readonly SourcePoint[];
  width: number;
  shoulderWidth: number;
  elevationOffset: number;
  materialId: 'highway-asphalt' | 'park-asphalt';
  markings: RoadMarkings;
  presentation: RoadPresentation;
  officialOwnerIdentifier?: string;
  notes: string;
}

export interface RearRoadIdentity {
  id: CanonicalRearRoadId;
  name: 'Rua Brasília' | 'Rua Ubiretama' | 'Rua das Etnias' | 'BR-472';
  label: 'RUA BRASÍLIA' | 'RUA UBIRETAMA' | 'RUA DAS ETNIAS' | 'BR-472';
  officialOwnerIdentifier: 'RUA-BRASILIA' | 'RUA-UBIRETAMA' | 'AV-IMIGRANTES' | 'RODOVIA-RS-472';
}

export type RearContextualLabelOwner = RearRoadIdentity['officialOwnerIdentifier'] | 'A5';

export const REAR_PARK_ROAD_REVISION = '2026.9-area-posterior.8';

/** Escala uniforme do recorte oficial, usada apenas para larguras físicas. */
export const SOURCE_POINTS_PER_LOCAL_UNIT = 5500 / 120;

export function rearRoadSourceToLocalLength(sourceLength: number) {
  return sourceLength / SOURCE_POINTS_PER_LOCAL_UNIT;
}

export const PROTECTED_ROAD_IDENTIFIERS: readonly string[] = Object.freeze([
  ...EXPORURAL_ROAD_IDENTIFIERS,
  'RUA-BRASILIA',
  'AV-IMIGRANTES',
  'AV-BENVENUTO-CONTI',
  'RODOVIA-RS-472',
]);

/**
 * As geometrias oficiais permanecem no cadastro; somente a apresentação das
 * três vias incompatíveis é trocada pelos eixos calibrados desta camada.
 */
export const REPLACED_OFFICIAL_ROAD_IDENTIFIERS: readonly string[] = Object.freeze([
  'RUA-BRASILIA',
  'RUA-UBIRETAMA',
  'RODOVIA-RS-472',
]);

export const ETHNIC_QUARTER_SOURCE_BOUNDS = Object.freeze([4500, 4340, 5340, 5100] as const);

export const REAR_ROAD_IDENTITIES: readonly RearRoadIdentity[] = Object.freeze([
  Object.freeze({ id: 'RUA-BRASILIA', name: 'Rua Brasília', label: 'RUA BRASÍLIA', officialOwnerIdentifier: 'RUA-BRASILIA' }),
  Object.freeze({ id: 'RUA-UBIRETAMA', name: 'Rua Ubiretama', label: 'RUA UBIRETAMA', officialOwnerIdentifier: 'RUA-UBIRETAMA' }),
  Object.freeze({ id: 'RUA-DAS-ETNIAS', name: 'Rua das Etnias', label: 'RUA DAS ETNIAS', officialOwnerIdentifier: 'AV-IMIGRANTES' }),
  Object.freeze({ id: 'RODOVIA-RS-472', name: 'BR-472', label: 'BR-472', officialOwnerIdentifier: 'RODOVIA-RS-472' }),
]);

/** Textos exibidos apenas pelo EntityLabel contextual já existente. */
export const REAR_CONTEXTUAL_LABELS: Readonly<Record<RearContextualLabelOwner, string>> = Object.freeze({
  'RUA-BRASILIA': 'RUA BRASÍLIA',
  'RUA-UBIRETAMA': 'RUA UBIRETAMA',
  'AV-IMIGRANTES': 'RUA DAS ETNIAS',
  'RODOVIA-RS-472': 'BR-472',
  A5: 'PORTÃO 5',
});

export function rearContextualLabelForOfficialOwner(publicIdentifier: string) {
  const normalized = publicIdentifier.trim().toLocaleUpperCase('pt-BR') as RearContextualLabelOwner;
  return REAR_CONTEXTUAL_LABELS[normalized] ?? null;
}

export function rearRoadSearchNamesForOfficialOwner(publicIdentifier: string) {
  const normalized = publicIdentifier.trim().toLocaleUpperCase('pt-BR');
  const label = REAR_CONTEXTUAL_LABELS[normalized as RearContextualLabelOwner];
  if (!label) return [] as string[];
  const identity = REAR_ROAD_IDENTITIES.find((candidate) => candidate.officialOwnerIdentifier === normalized);
  return [...new Set([identity?.name, identity?.label, label].filter((value): value is string => Boolean(value)))];
}

export function rearRoadIdentityCountByName(name: string) {
  const normalized = name.trim().toLocaleUpperCase('pt-BR');
  return REAR_ROAD_IDENTITIES.filter((identity) => (
    identity.name.toLocaleUpperCase('pt-BR') === normalized
    || identity.label.toLocaleUpperCase('pt-BR') === normalized
  )).length;
}

export function rearRoadSourcePointToWorld([sourceX, sourceZ]: SourcePoint, elevation = 0): WorldRoadPoint {
  const [x, z] = officialPdfPointToLocal([sourceX, sourceZ]);
  return [x, elevation, z];
}

function worldToLocal([x, , z]: WorldRoadPoint): LocalPoint {
  return [x, z];
}

function officialEntity(identifier: string) {
  const matches = OFFICIAL_REFERENCE_DATA.entities.filter(
    (entity) => entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR') === identifier,
  );
  if (matches.length !== 1) {
    throw new Error(`A rede posterior exige exatamente uma entidade oficial ${identifier}; recebidas ${matches.length}.`);
  }
  return matches[0];
}

function entityCenter(identifier: string): LocalPoint {
  const ring = officialEntity(identifier).geometry.coordinates[0] ?? [];
  const unique = ring.length > 1
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;
  return [
    unique.reduce((sum, point) => sum + point[0], 0) / unique.length,
    unique.reduce((sum, point) => sum + point[1], 0) / unique.length,
  ];
}

const officialGate5 = officialEntity('A5');
const officialGate5SourcePoint = Object.freeze(REAR_OFFICIAL_ANCHORS.gate5Entity);
const gate5VehicleAccessSourcePoint = Object.freeze(REAR_OFFICIAL_ANCHORS.gate5VehicleAccess);

export const OFFICIAL_GATE_5_CENTER = Object.freeze(entityCenter('A5'));
export const OFFICIAL_GATE_5_ACCESS_POINT = Object.freeze(officialPdfPointToLocal(gate5VehicleAccessSourcePoint));
export const OFFICIAL_GATE_5_ENTITY_ID = officialGate5.id;

const nodeSources: Readonly<Record<RoadNodeId, SourcePoint>> = Object.freeze({
  'etnias-west': REAR_CALIBRATED_AXES.ruaDasEtniasOfficial[0],
  'etnias-terminus-1': rearAttachment5ReferencePointById(1).officialSource,
  'brasilia-south': REAR_CALIBRATED_AXES.brasiliaSouthToPoint2[0],
  'brasilia-reference-2': rearAttachment5ReferencePointById(2).officialSource,
  'brasilia-reference-3': rearAttachment5ReferencePointById(3).officialSource,
  'brasilia-ubiretama-junction-4': rearAttachment5ReferencePointById(4).officialSource,
  'ubiretama-reference-5': rearAttachment5ReferencePointById(5).officialSource,
  'gate-5': officialGate5SourcePoint,
  'a5-br-junction': REAR_OFFICIAL_ANCHORS.br472Junction,
  'br472-north': REAR_CALIBRATED_AXES.br472NorthToJunction[0],
  'br472-south': REAR_CALIBRATED_AXES.br472JunctionToSouth.at(-1)!,
});

const nodeRoadAccessSources: Readonly<Partial<Record<RoadNodeId, SourcePoint>>> = Object.freeze({
  'gate-5': gate5VehicleAccessSourcePoint,
});

export const REAR_ROAD_NODES: Readonly<Record<RoadNodeId, RoadNode>> = Object.freeze(
  Object.fromEntries((Object.keys(nodeSources) as RoadNodeId[]).map((id) => {
    const sourcePoint = nodeSources[id];
    const roadAccessSourcePoint = nodeRoadAccessSources[id] ?? sourcePoint;
    return [id, Object.freeze({
      id,
      sourcePoint,
      roadAccessSourcePoint,
      position: rearRoadSourcePointToWorld(roadAccessSourcePoint),
      ...(id === 'gate-5' ? { officialEntityIdentifier: 'A5' } : {}),
    })];
  })) as Record<RoadNodeId, RoadNode>,
);

function segment(definition: Omit<RoadSegment, 'controlPoints'>): RoadSegment {
  const controlPoints = definition.sourceControlPoints.map((point) => rearRoadSourcePointToWorld(point));
  controlPoints[0] = REAR_ROAD_NODES[definition.from].position;
  controlPoints[controlPoints.length - 1] = REAR_ROAD_NODES[definition.to].position;
  return Object.freeze({ ...definition, controlPoints: Object.freeze([...controlPoints]) });
}

const officialRoadDefaults = Object.freeze({
  category: 'park-avenue' as const,
  width: rearRoadSourceToLocalLength(48),
  shoulderWidth: 0,
  elevationOffset: 0.028,
  materialId: 'park-asphalt' as const,
  markings: 'none' as const,
  presentation: 'official-surface' as const,
});

export const REAR_PARK_ROAD_NETWORK: readonly RoadSegment[] = Object.freeze([
  segment({
    id: 'etnias-official-terminus-1', roadId: 'RUA-DAS-ETNIAS', name: 'Rua das Etnias',
    from: 'etnias-west', to: 'etnias-terminus-1', ...officialRoadDefaults,
    sourceControlPoints: REAR_CALIBRATED_AXES.ruaDasEtniasOfficial,
    officialOwnerIdentifier: 'AV-IMIGRANTES',
    notes: 'Superfície oficial termina no Ponto 1; não há continuação pela mata nem ligação gerada ao A5.',
  }),
  segment({
    id: 'brasilia-south-point-2', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'brasilia-south', to: 'brasilia-reference-2', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.brasiliaSouthToPoint2,
    width: rearRoadSourceToLocalLength(37), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'internal',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-BRASILIA',
    notes: 'Aproximação sul termina antes da Rua das Etnias e atravessa P2 sem fechar alça.',
  }),
  segment({
    id: 'brasilia-point-2-point-3', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'brasilia-reference-2', to: 'brasilia-reference-3', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.brasiliaPoint2ToPoint3,
    width: rearRoadSourceToLocalLength(37), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'internal',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-BRASILIA',
    notes: 'P2 e P3 pertencem ao mesmo eixo calibrado, sem uma segunda Brasília.',
  }),
  segment({
    id: 'brasilia-point-3-ubiretama-4', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'brasilia-reference-3', to: 'brasilia-ubiretama-junction-4', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.brasiliaPoint3ToUbiretama,
    width: rearRoadSourceToLocalLength(37), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'internal',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-BRASILIA',
    notes: 'Continuidade direta de P3 ao entroncamento P4, fora de campo e estacionamento.',
  }),
  segment({
    id: 'ubiretama-point-5-brasilia-4', roadId: 'RUA-UBIRETAMA', name: 'Rua Ubiretama',
    from: 'ubiretama-reference-5', to: 'brasilia-ubiretama-junction-4', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.ubiretamaPoint5ToBrasilia,
    width: rearRoadSourceToLocalLength(36), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'none',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-UBIRETAMA',
    notes: 'Rua Ubiretama termina em interseção limpa com Rua Brasília no Ponto 4.',
  }),
  segment({
    id: 'gate5-internal-approach', roadId: 'ACESSO-A5-BR472', name: 'Acesso Portão 5 — rede interna',
    from: 'brasilia-ubiretama-junction-4', to: 'gate-5', category: 'internal-access',
    sourceControlPoints: REAR_CALIBRATED_AXES.gate5InternalApproach,
    width: rearRoadSourceToLocalLength(36), shoulderWidth: rearRoadSourceToLocalLength(5),
    elevationOffset: 0.034, materialId: 'park-asphalt', markings: 'none',
    presentation: 'generated-surface', officialOwnerIdentifier: 'A5',
    notes: 'Aproximação interna curta de P4 ao P6, sem assumir identidade de Brasília ou Ubiretama.',
  }),
  segment({
    id: 'a5-br472-exit', roadId: 'ACESSO-A5-BR472', name: 'Acesso Portão 5 — BR-472',
    from: 'gate-5', to: 'a5-br-junction', category: 'internal-access',
    sourceControlPoints: REAR_CALIBRATED_AXES.a5ExternalAccess,
    width: rearRoadSourceToLocalLength(36), shoulderWidth: rearRoadSourceToLocalLength(5),
    elevationOffset: 0.034, materialId: 'park-asphalt', markings: 'none',
    presentation: 'generated-surface', officialOwnerIdentifier: 'A5',
    notes: 'Segmento curto pós-portão; termina no entroncamento sem fundir as malhas.',
  }),
  segment({
    id: 'br472-north-junction', roadId: 'RODOVIA-RS-472', name: 'BR-472',
    from: 'br472-north', to: 'a5-br-junction', category: 'federal-highway',
    sourceControlPoints: REAR_CALIBRATED_AXES.br472NorthToJunction,
    width: rearRoadSourceToLocalLength(70), shoulderWidth: rearRoadSourceToLocalLength(12),
    elevationOffset: 0.034, materialId: 'highway-asphalt', markings: 'highway',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RODOVIA-RS-472',
    notes: 'BR-472 externa e independente até o entroncamento de saída do A5.',
  }),
  segment({
    id: 'br472-junction-south', roadId: 'RODOVIA-RS-472', name: 'BR-472',
    from: 'a5-br-junction', to: 'br472-south', category: 'federal-highway',
    sourceControlPoints: REAR_CALIBRATED_AXES.br472JunctionToSouth,
    width: rearRoadSourceToLocalLength(70), shoulderWidth: rearRoadSourceToLocalLength(12),
    elevationOffset: 0.034, materialId: 'highway-asphalt', markings: 'highway',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RODOVIA-RS-472',
    notes: 'Continuidade externa da mesma BR-472 após o entroncamento.',
  }),
]);

export const GENERATED_REAR_ROAD_SEGMENTS = Object.freeze(
  REAR_PARK_ROAD_NETWORK.filter((road) => road.presentation === 'generated-surface'),
);

/** Physical gate, interaction and focus all share P6; persisted A5 is unchanged. */
export const REAR_GATE_5_PRESENTATION = Object.freeze({
  center: OFFICIAL_GATE_5_ACCESS_POINT,
  rotation: Math.atan2(
    REAR_OFFICIAL_ANCHORS.br472Junction[0] - REAR_OFFICIAL_ANCHORS.gate5VehicleAccess[0],
    REAR_OFFICIAL_ANCHORS.br472Junction[1] - REAR_OFFICIAL_ANCHORS.gate5VehicleAccess[1],
  ),
  clearWidth: rearRoadSourceToLocalLength(46),
  clearHeight: 0.88,
  baseElevation: 0.034,
});

/** Mantém câmera, fog e terreno cobrindo toda a expansão corrigida. */
export const REAR_ROAD_SCENE_SUPPORT_POINTS = Object.freeze(
  GENERATED_REAR_ROAD_SEGMENTS.flatMap((road) => road.controlPoints.map((point) => Object.freeze({
    position: Object.freeze([point[0], point[2]] as const),
    height: Math.max(0.8, point[1] + 0.4),
  }))),
);

export function rearRoadLocalPath(definition: RoadSegment): LocalPoint[] {
  return definition.controlPoints.map(worldToLocal);
}

export function rearRoadLocalWidth(definition: RoadSegment) {
  return definition.width;
}

export function rearRoadLocalShoulderWidth(definition: RoadSegment) {
  return definition.shoulderWidth;
}

export function rearRoadCorridors(includeOfficialSurfaces = false) {
  return REAR_PARK_ROAD_NETWORK
    .filter((definition) => includeOfficialSurfaces || definition.presentation === 'generated-surface')
    .map((definition) => ({
      id: definition.id,
      roadId: definition.roadId,
      path: rearRoadLocalPath(definition),
      halfWidth: definition.width / 2 + definition.shoulderWidth,
    }));
}

const OWNER_LABEL_SOURCE_ANCHORS: Readonly<Record<RearContextualLabelOwner, SourcePoint>> = Object.freeze({
  'RUA-BRASILIA': rearAttachment5ReferencePointById(3).officialSource,
  'RUA-UBIRETAMA': rearAttachment5ReferencePointById(5).officialSource,
  'AV-IMIGRANTES': [5200, 4200],
  'RODOVIA-RS-472': REAR_CALIBRATED_AXES.br472NorthToJunction[2],
  A5: REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
});

export function rearContextualLabelAnchorForOfficialOwner(publicIdentifier: string): LocalPoint | null {
  const source = OWNER_LABEL_SOURCE_ANCHORS[
    publicIdentifier.trim().toLocaleUpperCase('pt-BR') as RearContextualLabelOwner
  ];
  return source ? officialPdfPointToLocal(source) : null;
}

export interface RearRoadFocusBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function rearRoadFocusBoundsForOfficialOwner(publicIdentifier: string): RearRoadFocusBounds | null {
  const normalized = publicIdentifier.trim().toLocaleUpperCase('pt-BR');
  if (normalized === 'A5') {
    const [x, z] = REAR_GATE_5_PRESENTATION.center;
    return { minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 };
  }
  const definitions = REAR_PARK_ROAD_NETWORK.filter((road) => road.officialOwnerIdentifier === normalized);
  if (definitions.length === 0) return null;
  const points = definitions.flatMap((road) => rearRoadLocalPath(road));
  const padding = Math.max(...definitions.map((road) => road.width / 2 + road.shoulderWidth), 0.5);
  return {
    minX: Math.min(...points.map((point) => point[0])) - padding,
    maxX: Math.max(...points.map((point) => point[0])) + padding,
    minZ: Math.min(...points.map((point) => point[1])) - padding,
    maxZ: Math.max(...points.map((point) => point[1])) + padding,
  };
}

function roadAdjacency() {
  const graph = new Map<RoadNodeId, Set<RoadNodeId>>();
  (Object.keys(REAR_ROAD_NODES) as RoadNodeId[]).forEach((id) => graph.set(id, new Set()));
  REAR_PARK_ROAD_NETWORK.forEach((road) => {
    graph.get(road.from)?.add(road.to);
    graph.get(road.to)?.add(road.from);
  });
  return graph;
}

export type RoadGraphEndpoint = RoadNodeId | 'br472' | 'brasilia' | 'ubiretama' | 'etnias' | 'A5';

function resolveRoadGraphEndpoint(endpoint: RoadGraphEndpoint): RoadNodeId {
  if (endpoint === 'br472') return 'br472-north';
  if (endpoint === 'brasilia') return 'brasilia-south';
  if (endpoint === 'ubiretama') return 'ubiretama-reference-5';
  if (endpoint === 'etnias') return 'etnias-terminus-1';
  if (endpoint === 'A5') return 'gate-5';
  return endpoint;
}

export function roadGraphPath(from: RoadGraphEndpoint, to: RoadGraphEndpoint): RoadNodeId[] {
  const start = resolveRoadGraphEndpoint(from);
  const target = resolveRoadGraphEndpoint(to);
  const graph = roadAdjacency();
  const queue: RoadNodeId[] = [start];
  const previous = new Map<RoadNodeId, RoadNodeId | null>([[start, null]]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === target) {
      const path: RoadNodeId[] = [];
      let cursor: RoadNodeId | null = current;
      while (cursor) {
        path.unshift(cursor);
        cursor = previous.get(cursor) ?? null;
      }
      return path;
    }
    graph.get(current)?.forEach((next) => {
      if (previous.has(next)) return;
      previous.set(next, current);
      queue.push(next);
    });
  }
  return [];
}

export function roadGraphHasPath(from: RoadGraphEndpoint, to: RoadGraphEndpoint) {
  return roadGraphPath(from, to).length > 0;
}
