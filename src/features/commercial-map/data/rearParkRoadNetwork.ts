import { EXPORURAL_ROAD_IDENTIFIERS } from './exporuralReference2026';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from './officialReference2026';
import { REAR_CALIBRATED_AXES } from '../utils/rearSpatialCalibration';

/**
 * Rede viária posterior — reconstrução corretiva 2026.9.5.
 *
 * Rua Exporural, Rua Brasília e BR-472 são identidades independentes. A Rua
 * Exporural continua pertencendo à superfície oficial `RUA-UBIRETAMA`; A5
 * continua sendo a única entidade selecionável do Portão 5. Esta configuração
 * acrescenta somente trechos físicos ausentes, substitui a apresentação
 * contraditória da Rua Brasília e da rodovia e não renomeia nem duplica
 * entidades cadastrais.
 */

export type CanonicalRearRoadId = 'RUA-EXPORURAL' | 'RUA-BRASILIA' | 'RODOVIA-RS-472';
export type RearRoadFeatureId = CanonicalRearRoadId | 'ACESSO-A5-BR472';

export type RoadNodeId =
  | 'exporural-reference-1'
  | 'exporural-official-north'
  | 'exporural-official-south'
  | 'exporural-brasilia-junction'
  | 'brasilia-official-north'
  | 'brasilia-reference-3'
  | 'gate-5'
  | 'a5-br-junction'
  | 'br472-west'
  | 'br472-east';

export type RoadCategory = 'federal-highway' | 'park-avenue' | 'internal-access';
export type RoadMarkings = 'highway' | 'internal' | 'none';
export type RoadPresentation = 'generated-surface' | 'official-surface';
export type SourcePoint = readonly [number, number];
export type LocalPoint = readonly [number, number];
export type WorldRoadPoint = readonly [number, number, number];

export interface RoadNode {
  id: RoadNodeId;
  /** Centro cadastral do nó. Para A5, é o centro oficial do losango. */
  sourcePoint: SourcePoint;
  /** Posição física da ribbon. Para A5, é a passagem veicular na borda. */
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
  name: 'Rua Exporural' | 'Rua Brasília' | 'BR-472';
  label: 'RUA EXPORURAL' | 'RUA BRASÍLIA' | 'BR-472';
  officialOwnerIdentifier: 'RUA-UBIRETAMA' | 'RUA-BRASILIA' | 'RODOVIA-RS-472';
}

export type RearContextualLabelOwner = 'RUA-UBIRETAMA' | 'RUA-BRASILIA' | 'RODOVIA-RS-472' | 'A5';

export const REAR_PARK_ROAD_REVISION = '2026.9-area-posterior.5';

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

/**
 * A apresentação detalhada substitui somente as superfícies esquemáticas
 * contraditórias. Os registros oficiais permanecem íntegros e selecionáveis.
 */
export const REPLACED_OFFICIAL_ROAD_IDENTIFIERS: readonly string[] = Object.freeze([
  'RUA-BRASILIA',
  'RODOVIA-RS-472',
]);

export const ETHNIC_QUARTER_SOURCE_BOUNDS = Object.freeze([4500, 4340, 5340, 5100] as const);

export const REAR_ROAD_IDENTITIES: readonly RearRoadIdentity[] = Object.freeze([
  Object.freeze({ id: 'RUA-EXPORURAL', name: 'Rua Exporural', label: 'RUA EXPORURAL', officialOwnerIdentifier: 'RUA-UBIRETAMA' }),
  Object.freeze({ id: 'RUA-BRASILIA', name: 'Rua Brasília', label: 'RUA BRASÍLIA', officialOwnerIdentifier: 'RUA-BRASILIA' }),
  Object.freeze({ id: 'RODOVIA-RS-472', name: 'BR-472', label: 'BR-472', officialOwnerIdentifier: 'RODOVIA-RS-472' }),
]);

/**
 * Texto exato consumido pelo `EntityLabel` existente. Não cria Html permanente,
 * objeto selecionável, resultado de busca nem segunda identidade cartográfica.
 */
export const REAR_CONTEXTUAL_LABELS: Readonly<Record<RearContextualLabelOwner, string>> = Object.freeze({
  'RUA-UBIRETAMA': 'RUA EXPORURAL',
  'RUA-BRASILIA': 'RUA BRASÍLIA',
  'RODOVIA-RS-472': 'BR-472',
  A5: 'PORTÃO 5',
});

export function rearContextualLabelForOfficialOwner(publicIdentifier: string) {
  const normalized = publicIdentifier.trim().toLocaleUpperCase('pt-BR') as RearContextualLabelOwner;
  return REAR_CONTEXTUAL_LABELS[normalized] ?? null;
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
const officialGate5SourcePoint = Object.freeze([5974, 3678] as const);
const gate5VehicleAccessSourcePoint = Object.freeze(REAR_CALIBRATED_AXES.brasiliaContinuation.at(-1)!);

export const OFFICIAL_GATE_5_CENTER = Object.freeze(entityCenter('A5'));
export const OFFICIAL_GATE_5_ACCESS_POINT = Object.freeze(officialPdfPointToLocal(gate5VehicleAccessSourcePoint));
export const OFFICIAL_GATE_5_ENTITY_ID = officialGate5.id;

const exporuralJunction = REAR_CALIBRATED_AXES.exporuralSouthExtension.at(-1)!;
const brasiliaJunctionIndex = REAR_CALIBRATED_AXES.brasiliaContinuation.findIndex((point) => (
  Math.abs(point[0] - exporuralJunction[0]) < 0.01
  && Math.abs(point[1] - exporuralJunction[1]) < 0.01
));
if (brasiliaJunctionIndex < 1) {
  throw new Error('O eixo calibrado da Rua Brasília não contém o entroncamento da Rua Exporural.');
}

const brasiliaReference3 = REAR_CALIBRATED_AXES.brasiliaContinuation[0];

const nodeSources: Readonly<Record<RoadNodeId, SourcePoint>> = Object.freeze({
  'exporural-reference-1': REAR_CALIBRATED_AXES.exporuralNorthExtension[0],
  'exporural-official-north': REAR_CALIBRATED_AXES.exporuralOfficial[0],
  'exporural-official-south': REAR_CALIBRATED_AXES.exporuralOfficial.at(-1)!,
  'exporural-brasilia-junction': exporuralJunction,
  'brasilia-official-north': REAR_CALIBRATED_AXES.brasiliaOfficialToP3[0],
  'brasilia-reference-3': brasiliaReference3,
  'gate-5': officialGate5SourcePoint,
  'a5-br-junction': REAR_CALIBRATED_AXES.a5ExternalAccess.at(-1)!,
  'br472-west': REAR_CALIBRATED_AXES.br472JunctionToWest.at(-1)!,
  'br472-east': REAR_CALIBRATED_AXES.br472EastToJunction[0],
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
  return Object.freeze({ ...definition, controlPoints: [...controlPoints] });
}

const brasiliaToExporural = REAR_CALIBRATED_AXES.brasiliaContinuation.slice(0, brasiliaJunctionIndex + 1);
const brasiliaToGate5 = REAR_CALIBRATED_AXES.brasiliaContinuation.slice(brasiliaJunctionIndex);

/** Somente `generated-surface` produz ribbon; vias oficiais ficam intactas. */
export const REAR_PARK_ROAD_NETWORK: readonly RoadSegment[] = Object.freeze([
  segment({
    id: 'exporural-reference-1-official-north', roadId: 'RUA-EXPORURAL', name: 'Rua Exporural',
    from: 'exporural-reference-1', to: 'exporural-official-north', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.exporuralNorthExtension,
    width: rearRoadSourceToLocalLength(42), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'none',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-UBIRETAMA',
    notes: 'Completa P1 até a borda norte da Rua Exporural oficial, sem cobrir sua superfície cadastral.',
  }),
  segment({
    id: 'exporural-official-axis', roadId: 'RUA-EXPORURAL', name: 'Rua Exporural',
    from: 'exporural-official-north', to: 'exporural-official-south', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.exporuralOfficial,
    width: rearRoadSourceToLocalLength(42), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'none',
    presentation: 'official-surface', officialOwnerIdentifier: 'RUA-UBIRETAMA',
    notes: 'Centerline real da superfície oficial RUA-UBIRETAMA, preservada integralmente.',
  }),
  segment({
    id: 'exporural-official-south-junction', roadId: 'RUA-EXPORURAL', name: 'Rua Exporural',
    from: 'exporural-official-south', to: 'exporural-brasilia-junction', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.exporuralSouthExtension,
    width: rearRoadSourceToLocalLength(42), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'none',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-UBIRETAMA',
    notes: 'Completa a borda sul oficial pelos Pontos 10 e 5 até o entroncamento físico com a Rua Brasília.',
  }),
  segment({
    id: 'brasilia-official-north-reference-3', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'brasilia-official-north', to: 'brasilia-reference-3', category: 'park-avenue',
    sourceControlPoints: REAR_CALIBRATED_AXES.brasiliaOfficialToP3,
    width: rearRoadSourceToLocalLength(54), shoulderWidth: rearRoadSourceToLocalLength(8),
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'internal',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-BRASILIA',
    notes: 'Apresentação corretiva única do extremo cadastral ao Ponto 3, contornando C1 e sem ramo para A3.',
  }),
  segment({
    id: 'brasilia-reference-3-exporural', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'brasilia-reference-3', to: 'exporural-brasilia-junction', category: 'park-avenue',
    sourceControlPoints: brasiliaToExporural,
    width: rearRoadSourceToLocalLength(54), shoulderWidth: rearRoadSourceToLocalLength(8),
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'internal',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-BRASILIA',
    notes: 'Rua Brasília contínua pelos Pontos 3 e 4 até o entroncamento 5 da Rua Exporural.',
  }),
  segment({
    id: 'brasilia-exporural-a5', roadId: 'RUA-BRASILIA', name: 'Rua Brasília',
    from: 'exporural-brasilia-junction', to: 'gate-5', category: 'park-avenue',
    sourceControlPoints: brasiliaToGate5,
    width: rearRoadSourceToLocalLength(54), shoulderWidth: 0,
    elevationOffset: 0.032, materialId: 'park-asphalt', markings: 'internal',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RUA-BRASILIA',
    notes: 'Continuação única da Rua Brasília do Ponto 5 à passagem veicular do A5 oficial; a borda integrada substitui o acostamento junto ao estacionamento protegido.',
  }),
  segment({
    id: 'a5-br472-access', roadId: 'ACESSO-A5-BR472', name: 'Acesso viário A5 — BR-472',
    from: 'gate-5', to: 'a5-br-junction', category: 'internal-access',
    sourceControlPoints: REAR_CALIBRATED_AXES.a5ExternalAccess,
    width: rearRoadSourceToLocalLength(36), shoulderWidth: rearRoadSourceToLocalLength(5),
    elevationOffset: 0.034, materialId: 'park-asphalt', markings: 'none',
    presentation: 'generated-surface', officialOwnerIdentifier: 'A5',
    notes: 'Acesso externo estreito e funcional após o A5, sem usar o estacionamento oficial como pavimento; o Portão 5 continua sendo endpoint da via dentro do parque.',
  }),
  segment({
    id: 'br472-east-junction', roadId: 'RODOVIA-RS-472', name: 'BR-472',
    from: 'br472-east', to: 'a5-br-junction', category: 'federal-highway',
    sourceControlPoints: REAR_CALIBRATED_AXES.br472EastToJunction,
    width: rearRoadSourceToLocalLength(132), shoulderWidth: rearRoadSourceToLocalLength(42),
    elevationOffset: 0.034, materialId: 'highway-asphalt', markings: 'highway',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RODOVIA-RS-472',
    notes: 'Corredor externo Ponto 2 (leste)–junção A5, separado fisicamente da Rua Exporural.',
  }),
  segment({
    id: 'br472-junction-west', roadId: 'RODOVIA-RS-472', name: 'BR-472',
    from: 'a5-br-junction', to: 'br472-west', category: 'federal-highway',
    sourceControlPoints: REAR_CALIBRATED_AXES.br472JunctionToWest,
    width: rearRoadSourceToLocalLength(132), shoulderWidth: rearRoadSourceToLocalLength(42),
    elevationOffset: 0.034, materialId: 'highway-asphalt', markings: 'highway',
    presentation: 'generated-surface', officialOwnerIdentifier: 'RODOVIA-RS-472',
    notes: 'Corredor externo junção–Ponto 7 (oeste); é a mesma e única BR-472.',
  }),
]);

export const GENERATED_REAR_ROAD_SEGMENTS = Object.freeze(
  REAR_PARK_ROAD_NETWORK.filter((road) => road.presentation === 'generated-surface'),
);

/** Mantém câmera/fog/solo externo cobrindo toda a expansão viária corrigida. */
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

function roadAdjacency() {
  const graph = new Map<RoadNodeId, Set<RoadNodeId>>();
  (Object.keys(REAR_ROAD_NODES) as RoadNodeId[]).forEach((id) => graph.set(id, new Set()));
  REAR_PARK_ROAD_NETWORK.forEach((road) => {
    graph.get(road.from)?.add(road.to);
    graph.get(road.to)?.add(road.from);
  });
  return graph;
}

export type RoadGraphEndpoint = RoadNodeId | 'br472' | 'brasilia' | 'exporural' | 'A5';

function resolveRoadGraphEndpoint(endpoint: RoadGraphEndpoint): RoadNodeId {
  if (endpoint === 'br472') return 'br472-west';
  if (endpoint === 'brasilia') return 'brasilia-official-north';
  if (endpoint === 'exporural') return 'exporural-reference-1';
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
