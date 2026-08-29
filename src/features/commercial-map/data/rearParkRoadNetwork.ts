import { EXPORURAL_ROAD_IDENTIFIERS } from './exporuralReference2026';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from './officialReference2026';
import { REAR_CALIBRATED_AXES } from '../utils/rearSpatialCalibration';

/**
 * Rede viária posterior — reconstrução corretiva 2026.9.3.
 *
 * A entidade oficial `A5` e as vias oficiais continuam sendo as proprietárias
 * dos seus dados e interações. Esta configuração descreve uma única topologia
 * de apresentação, centralizada e tipada, sem criar entidades cartográficas.
 * Os trechos `official-surface` existem no grafo para provar continuidade, mas
 * não geram uma segunda malha sobre a Rua Brasília/Avenida dos Imigrantes.
 */

export type RoadNodeId =
  | 'br472-west'
  | 'br472-east'
  | 'brasilia-br-junction'
  | 'brasilia-perimeter'
  | 'brasilia-official-south'
  | 'brasilia-event-center'
  | 'brasilia-arena'
  | 'gate-5';

export type RoadCategory = 'federal-highway' | 'park-avenue' | 'internal-access';
export type RoadMarkings = 'highway' | 'internal' | 'none';
export type RoadPresentation = 'generated-surface' | 'official-surface';
export type SourcePoint = readonly [number, number];
export type LocalPoint = readonly [number, number];
export type WorldRoadPoint = readonly [number, number, number];

export interface RoadNode {
  id: RoadNodeId;
  position: WorldRoadPoint;
  sourcePoint: SourcePoint;
  officialEntityIdentifier?: string;
}

export interface RoadSegment {
  id: string;
  roadId: 'RODOVIA-RS-472' | 'RUA-BRASILIA' | 'ACESSO-A5-BR472';
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

export const REAR_PARK_ROAD_REVISION = '2026.9-area-posterior.3';

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

/** Identificadores banidos da primeira implantação, preservados como trava. */
export const REMOVED_REAR_ROAD_IDENTIFIERS: readonly string[] = Object.freeze([
  'RUA-POSTERIOR-ETNIAS',
  'RUA-ETNIAS-TRANSVERSAL',
  'RUA-RETAGUARDA-ARENA',
  'RUA-CIRCULACAO-LOTES',
  'ACESSO-ALCA-LESTE',
  'RS-472-CONTINUACAO',
]);

/** A apresentação detalhada substitui somente a superfície genérica desta via. */
export const REPLACED_OFFICIAL_ROAD_IDENTIFIERS: readonly string[] = Object.freeze([
  'RODOVIA-RS-472',
]);

export const ETHNIC_QUARTER_SOURCE_BOUNDS = Object.freeze([4500, 4340, 5340, 5100] as const);

function sourceToWorld([sourceX, sourceZ]: SourcePoint, elevation = 0): WorldRoadPoint {
  const [x, z] = officialPdfPointToLocal([sourceX, sourceZ]);
  return [x, elevation, z];
}

function worldToLocal([x, , z]: WorldRoadPoint): LocalPoint {
  return [x, z];
}

function entityCenter(identifier: string): LocalPoint {
  const matches = OFFICIAL_REFERENCE_DATA.entities.filter(
    (entity) => entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR') === identifier,
  );
  if (matches.length !== 1) {
    throw new Error(`A rede posterior exige exatamente uma entidade oficial ${identifier}; recebidas ${matches.length}.`);
  }
  const ring = matches[0].geometry.coordinates[0] ?? [];
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

/**
 * O losango oficial é um símbolo cartográfico simplificado. O acesso veicular
 * é o ponto de sua borda mais próximo do eixo da rodovia, não o centro do ícone.
 */
function officialGate5RoadEdge(): LocalPoint {
  const gate = OFFICIAL_REFERENCE_DATA.entities.find(
    (entity) => entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR') === 'A5',
  );
  if (!gate) throw new Error('Entidade oficial A5 ausente da referência 2026.');
  const ring = gate.geometry.coordinates[0] ?? [];
  if (ring.length < 3) throw new Error('A entidade oficial A5 não possui geometria válida.');
  return ring.reduce<LocalPoint>((closest, point) => (
    point[0] > closest[0] ? [point[0], point[1]] : closest
  ), [ring[0][0], ring[0][1]]);
}

export const OFFICIAL_GATE_5_CENTER = Object.freeze(entityCenter('A5'));
export const OFFICIAL_GATE_5_ACCESS_POINT = Object.freeze(officialGate5RoadEdge());

const gate5SourcePoint: SourcePoint = [5996, 3678];

const nodeSources: Readonly<Record<RoadNodeId, SourcePoint>> = Object.freeze({
  'br472-west': REAR_CALIBRATED_AXES.br472WestToJunction[0],
  'br472-east': REAR_CALIBRATED_AXES.br472JunctionToEast.at(-1)!,
  'brasilia-br-junction': REAR_CALIBRATED_AXES.br472WestToJunction.at(-1)!,
  'brasilia-perimeter': REAR_CALIBRATED_AXES.brasiliaA5Perimeter.at(-1)!,
  'brasilia-official-south': REAR_CALIBRATED_AXES.brasiliaPerimeterOfficial.at(-1)!,
  'brasilia-event-center': REAR_CALIBRATED_AXES.brasiliaOfficialEventCenter.at(-1)!,
  'brasilia-arena': REAR_CALIBRATED_AXES.brasiliaEventCenterArena.at(-1)!,
  'gate-5': gate5SourcePoint,
});

export const REAR_ROAD_NODES: Readonly<Record<RoadNodeId, RoadNode>> = Object.freeze(
  Object.fromEntries((Object.keys(nodeSources) as RoadNodeId[]).map((id) => {
    const sourcePoint = nodeSources[id];
    const position = id === 'gate-5'
      ? [OFFICIAL_GATE_5_ACCESS_POINT[0], 0, OFFICIAL_GATE_5_ACCESS_POINT[1]] as WorldRoadPoint
      : sourceToWorld(sourcePoint);
    return [id, Object.freeze({
      id,
      sourcePoint,
      position,
      ...(id === 'gate-5' ? { officialEntityIdentifier: 'A5' } : {}),
    })];
  })) as Record<RoadNodeId, RoadNode>,
);

function segment(definition: Omit<RoadSegment, 'controlPoints'>): RoadSegment {
  const controlPoints = definition.sourceControlPoints.map((point) => sourceToWorld(point));
  controlPoints[0] = REAR_ROAD_NODES[definition.from].position;
  controlPoints[controlPoints.length - 1] = REAR_ROAD_NODES[definition.to].position;
  return Object.freeze({ ...definition, controlPoints: [...controlPoints] });
}

/**
 * Eixos consolidados após a calibração dos anexos 4 e 5. Todos permanecem
 * dentro da página oficial (7152,61 × 5735,29); não há plataformas extrapoladas.
 */
export const REAR_PARK_ROAD_NETWORK: readonly RoadSegment[] = Object.freeze([
  segment({
    id: 'br472-west-junction', roadId: 'RODOVIA-RS-472', name: 'BR-472',
    from: 'br472-west', to: 'brasilia-br-junction', category: 'federal-highway',
    sourceControlPoints: REAR_CALIBRATED_AXES.br472WestToJunction,
    width: rearRoadSourceToLocalLength(132), shoulderWidth: rearRoadSourceToLocalLength(42),
    elevationOffset: 0.034, materialId: 'highway-asphalt', markings: 'highway',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RODOVIA-RS-472',
    notes: 'Eixo longitudinal da rodovia oficial, refinado como ribbon contínua sem duplicar a entidade cadastral.',
  }),
  segment({
    id: 'br472-junction-east', roadId: 'RODOVIA-RS-472', name: 'BR-472',
    from: 'brasilia-br-junction', to: 'br472-east', category: 'federal-highway',
    sourceControlPoints: REAR_CALIBRATED_AXES.br472JunctionToEast,
    width: rearRoadSourceToLocalLength(132), shoulderWidth: rearRoadSourceToLocalLength(42),
    elevationOffset: 0.034, materialId: 'highway-asphalt', markings: 'highway',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RODOVIA-RS-472',
    notes: 'Continuidade do mesmo eixo da BR-472 além do acesso A5, sem segunda rodovia paralela.',
  }),
  segment({
    id: 'a5-br472-access', roadId: 'ACESSO-A5-BR472', name: 'Acesso viário A5 — BR-472',
    from: 'brasilia-br-junction', to: 'gate-5', category: 'internal-access',
    sourceControlPoints: REAR_CALIBRATED_AXES.a5Access,
    width: rearRoadSourceToLocalLength(68), shoulderWidth: rearRoadSourceToLocalLength(12),
    elevationOffset: 0.036, materialId: 'park-asphalt', markings: 'none',
    presentation: 'generated-surface', officialOwnerIdentifier: 'A5',
    notes: 'Transição curta até a borda rodoviária do losango oficial A5; o endpoint nunca usa o centro visual do ícone.',
  }),
  segment({
    id: 'brasilia-a5-perimeter', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'gate-5', to: 'brasilia-perimeter', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.brasiliaA5Perimeter,
    width: rearRoadSourceToLocalLength(54), shoulderWidth: rearRoadSourceToLocalLength(16),
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'internal',
    presentation: 'generated-surface', officialOwnerIdentifier: 'A5',
    notes: 'Trecho novo contorna externamente o estacionamento, mantém distância das Etnias e termina no acesso físico do A5.',
  }),
  segment({
    id: 'brasilia-perimeter-official', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'brasilia-perimeter', to: 'brasilia-official-south', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.brasiliaPerimeterOfficial,
    width: rearRoadSourceToLocalLength(48), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'none',
    presentation: 'official-surface', officialOwnerIdentifier: 'AV-IMIGRANTES',
    notes: 'Conectividade sobre a Avenida dos Imigrantes existente; não produz ribbon duplicada.',
  }),
  segment({
    id: 'brasilia-official-event-center', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'brasilia-official-south', to: 'brasilia-event-center', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.brasiliaOfficialEventCenter,
    width: rearRoadSourceToLocalLength(48), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'none',
    presentation: 'official-surface', officialOwnerIdentifier: 'RUA-BRASILIA',
    notes: 'Eixo oficial junto ao Centro de Eventos, preservado e não redesenhado.',
  }),
  segment({
    id: 'brasilia-official-arena', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'brasilia-event-center', to: 'brasilia-arena', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.brasiliaEventCenterArena,
    width: rearRoadSourceToLocalLength(48), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'none',
    presentation: 'official-surface', officialOwnerIdentifier: 'RUA-BRASILIA',
    notes: 'Eixo oficial lateral à Arena, preservado e não redesenhado.',
  }),
]);

export const GENERATED_REAR_ROAD_SEGMENTS = Object.freeze(
  REAR_PARK_ROAD_NETWORK.filter((road) => road.presentation === 'generated-surface'),
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

function roadAdjacency() {
  const graph = new Map<RoadNodeId, Set<RoadNodeId>>();
  (Object.keys(REAR_ROAD_NODES) as RoadNodeId[]).forEach((id) => graph.set(id, new Set()));
  REAR_PARK_ROAD_NETWORK.forEach((road) => {
    graph.get(road.from)?.add(road.to);
    graph.get(road.to)?.add(road.from);
  });
  return graph;
}

export type RoadGraphEndpoint = RoadNodeId | 'br472' | 'brasilia' | 'A5';

function resolveRoadGraphEndpoint(endpoint: RoadGraphEndpoint): RoadNodeId {
  if (endpoint === 'br472') return 'br472-west';
  if (endpoint === 'brasilia') return 'brasilia-arena';
  if (endpoint === 'A5') return 'gate-5';
  return endpoint;
}

export function roadGraphHasPath(from: RoadGraphEndpoint, to: RoadGraphEndpoint) {
  const start = resolveRoadGraphEndpoint(from);
  const target = resolveRoadGraphEndpoint(to);
  const graph = roadAdjacency();
  const queue: RoadNodeId[] = [start];
  const visited = new Set<RoadNodeId>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    graph.get(current)?.forEach((next) => {
      if (!visited.has(next)) queue.push(next);
    });
  }
  return false;
}
