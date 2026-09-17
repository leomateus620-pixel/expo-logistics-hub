import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '../constants';
import type { CommercialMapData, Coordinate, MapEntity } from '../types';

/**
 * Conjunto Espaço Mirante (D3) + estrutura lateral coberta + salas B16/B17,
 * entre Rua Brasília (oeste), Rua Brasil (sul), a Exporural (norte) e a
 * praça/escadaria da Arena (leste).
 *
 * A implantação é registrada sobre a malha viária oficial, que permanece
 * intocada: a leitura do satélite (anexo 2) é ajustada por similaridade entre
 * duas âncoras fixas do PDF — a borda leste de Rua Brasília e a borda norte de
 * Rua Brasil — e o limite sul da Quadra R (Q-R-04). Os footprints resultantes
 * substituem, em apresentação, os retângulos genéricos do PDF oficial, que
 * eram ~27 % mais longos e ~60 % mais profundos que a construção real.
 *
 * Nada aqui é levantamento topográfico: as cotas são proporções visuais do
 * mapa (unidades não calibradas em metros) e ficam explicitamente marcadas
 * como estimativa registrada em `metadata`.
 */
export const MIRANTE_COMPLEX_REVISION = '2026.9-mirante-complex-satellite.2';

type SourceBounds = readonly [number, number, number, number];
type SourcePoint = readonly [number, number];

const CROP = { x: 600, y: 900, width: 5500, height: 4150 } as const;

/** Mesma transformação de `officialPdfPointToLocal`, sem importar o módulo oficial (evita ciclo). */
export function miranteSourcePointToLocal([x, y]: SourcePoint): Coordinate {
  return [
    ((x - CROP.x) / CROP.width) * MAP_REFERENCE_WIDTH - MAP_REFERENCE_WIDTH / 2,
    ((y - CROP.y) / CROP.height) * MAP_REFERENCE_HEIGHT - MAP_REFERENCE_HEIGHT / 2,
  ];
}

function sourceRectToRing(bounds: SourceBounds): Coordinate[] {
  const [minX, minZ, maxX, maxZ] = bounds;
  const ring: Coordinate[] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  ring.push([...ring[0]] as Coordinate);
  return ring;
}

function sourceRectToLocalRing(bounds: SourceBounds): Coordinate[] {
  const ring = sourceRectToRing(bounds).map((point) => miranteSourcePointToLocal(point as SourcePoint));
  return ring as Coordinate[];
}

export const MIRANTE_COMPLEX = Object.freeze({
  revision: MIRANTE_COMPLEX_REVISION,
  registration: Object.freeze({
    /** Anexo 2 (satélite): eixo longo do conjunto em pixels ↔ pontos do PDF. */
    satellitePixelsAlongStreet: 418,
    sourcePointsAlongStreet: 666,
    sourcePointsPerPixel: 666 / 418,
    anchors: Object.freeze({
      ruaBrasiliaEastEdge: 3988,
      ruaBrasilNorthEdge: 3106,
      quadraRSouthEdge: 2440,
    }),
    landmarks: Object.freeze([
      { identifier: 'RUA-BRASILIA', role: 'west-edge', source: 3988 },
      { identifier: 'RUA-BRASIL', role: 'south-edge', source: 3106 },
      { identifier: 'Q-R-04', role: 'north-edge', source: 2440 },
    ]),
    metersAreEstimates: true,
  }),

  /** Cotas visuais compartilhadas (unidades locais, não metros). */
  levels: Object.freeze({
    /** Topo de Rua Brasília / Rua Brasil (extrusão canônica das vias). */
    road: 0.032,
    /**
     * Passeio, pátio sul e deck formam um único terraço. Nas fotos 7, 9 e 10
     * o piso da estrutura é contínuo com a calçada; o meio-fio é a queda
     * visível até a via, não um segundo patamar sob o pavilhão.
     */
    sidewalk: 0.178,
    apron: 0.178,
    /**
     * Terraço superior da escadaria da Arena. `parkEnvironment` deriva o
     * espelho dos degraus desta cota, de modo que `ARENA_TERRAIN_TOP_ELEVATION`
     * coincide com ela.
     */
    deck: 0.178,
    /** Gramado da Exporural, onde a escada norte do Mirante aterrissa. */
    exporuralGround: 0.055,
  }),

  /** Borda leste do terraço, encostada no patamar superior da escadaria. */
  eastTerraceSourceMaxX: 4092,

  /** Faixa de calçada contínua ao longo de Rua Brasília, com piso tátil. */
  sidewalk: Object.freeze({
    sourceBounds: [3988, 2440, 4004, 3106] as SourceBounds,
    tactileOffsetFromRoad: 0.09,
    tactileWidth: 0.045,
    curbPaintWidth: 0.035,
  }),

  /**
   * D3 — Espaço Mirante. O footprint inclui o patamar de chão do lado norte
   * (fronteira com a Exporural); a plataforma coberta começa em Z=2480.
   * A escada sobe virada em +X, encostada à face norte do pódio.
   */
  mirante: Object.freeze({
    identifier: 'D3',
    sourceBounds: [4004, 2440, 4072, 2748] as SourceBounds,
    platformSourceMinZ: 2480,
    descentStairsSourceBounds: [4004, 2440, 4072, 2480] as SourceBounds,
    /**
     * Cumeeira do pavilhão aberto, no mesmo patamar da Via Expressa (1.16).
     * Não inclui bandeiras da Alameda.
     */
    extrusionHeight: 1.16,
  }),

  /**
   * Estrutura lateral coberta ("PISTA"): fascia clara, treliças e apoios em V,
   * com a parede cega no topo norte, encostada ao Mirante (anexos 7 e 10).
   */
  lateralStructure: Object.freeze({
    id: 'arena-front-covered-access',
    sourceBounds: [4004, 2748, 4084, 2944] as SourceBounds,
    sideWallEnd: 'north' as const,
    bayCount: 5,
  }),

  /** Salas fechadas sob a cobertura lateral, junto à parede norte e ao passeio. */
  rooms: Object.freeze({
    B17: Object.freeze({ sourceBounds: [4008, 2760, 4042, 2804] as SourceBounds, extrusionHeight: 0.31 }),
    B16: Object.freeze({ sourceBounds: [4008, 2812, 4042, 2856] as SourceBounds, extrusionHeight: 0.31 }),
  }),

  /** "Calçada" do anexo 2: pátio pavimentado entre a estrutura lateral e Rua Brasil. */
  southApron: Object.freeze({
    sourceBounds: [3988, 2944, 4092, 3106] as SourceBounds,
  }),

  /**
   * Faixa de grama corrigida (anexos 2 e 8): entre a praça/escadaria e Rua
   * Brasil, no trecho que desce ao Portão 5. Antes era concreto.
   */
  grassStrip: Object.freeze({
    sourceBounds: [4092, 2958, 4596, 3096] as SourceBounds,
  }),
} as const);

export type MiranteComplexRoomIdentifier = keyof typeof MIRANTE_COMPLEX.rooms;

export function miranteComplexSourceBoundsToLocal(bounds: SourceBounds) {
  const [firstX, firstZ] = miranteSourcePointToLocal([bounds[0], bounds[1]]);
  const [secondX, secondZ] = miranteSourcePointToLocal([bounds[2], bounds[3]]);
  const minX = Math.min(firstX, secondX);
  const maxX = Math.max(firstX, secondX);
  const minZ = Math.min(firstZ, secondZ);
  const maxZ = Math.max(firstZ, secondZ);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

function isRoomIdentifier(value: string): value is MiranteComplexRoomIdentifier {
  return Object.prototype.hasOwnProperty.call(MIRANTE_COMPLEX.rooms, value);
}

/**
 * Projeção versionada de D3, B16 e B17 sobre a implantação registrada. IDs,
 * metadados e permissões passam intactos; quando a revisão já está presente
 * (inclusive após uma edição posterior no editor) nada é reaplicado.
 */
export function reconstructMiranteComplexEntity(entity: MapEntity): MapEntity {
  const identifier = entity.publicIdentifier;
  const isMirante = identifier === MIRANTE_COMPLEX.mirante.identifier;
  if (!isMirante && !isRoomIdentifier(identifier)) return entity;
  if (entity.metadata?.reconstructionRevision === MIRANTE_COMPLEX_REVISION) return entity;

  const spec = isMirante
    ? MIRANTE_COMPLEX.mirante
    : MIRANTE_COMPLEX.rooms[identifier as MiranteComplexRoomIdentifier];

  return {
    ...entity,
    geometry: {
      ...entity.geometry,
      coordinates: [sourceRectToLocalRing(spec.sourceBounds)],
      rotation: 0,
      // D3 constrói o próprio deck a partir da cota 0; as salas assentam no terraço.
      elevation: isMirante ? 0 : MIRANTE_COMPLEX.levels.deck,
      extrusionHeight: spec.extrusionHeight,
    },
    metadata: {
      ...entity.metadata,
      sourcePdfPolygon: sourceRectToRing(spec.sourceBounds),
      reconstructionRevision: MIRANTE_COMPLEX_REVISION,
      reconstructionAnchors: [...MIRANTE_COMPLEX.registration.landmarks.map((item) => item.identifier)],
      officialMeasurements: false,
      cartographicConfidence: 'reference_registered_estimate',
      ...(isMirante ? {} : { coveredByStructure: MIRANTE_COMPLEX.lateralStructure.id }),
    },
  };
}

export function withMiranteComplexReconstruction<T extends CommercialMapData>(data: T): T {
  return { ...data, entities: data.entities.map(reconstructMiranteComplexEntity) };
}
