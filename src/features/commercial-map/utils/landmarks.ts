import type { MapEntity } from '../types';
import { resolveCrioulosArchitectureEnvelope } from '../data/gateFourDistrict';
import { livestockPavilionVisualHeight } from './livestockPavilion';
import { miranteVisualHeight } from './mirante';
import { FENASOJA_HEADQUARTERS_LAYOUT } from './headquarters';
import {
  FENASOJA_EVENT_CENTER_LAYOUT,
  eventCenterVisualHeight,
} from './eventCenter';
import {
  commercialPavilionVisualHeight,
  resolveCommercialPavilionDefinition,
  type CommercialPavilionPublicIdentifier,
} from './commercialPavilions';
import {
  THIRD_AGE_PAVILION_LAYOUT,
  thirdAgePavilionVisualHeight,
} from './thirdAgePavilion';
import {
  LACTALIS_STAGE_LAYOUT,
  lactalisStageVisualHeight,
} from './lactalisStage';
import {
  COOPERATIVISM_FACING_RADIANS,
  GASTRONOMIC_ALAMEDA_FACING_RADIANS,
  cooperativismVisualHeight,
  gastronomicAlamedaVisualHeight,
} from './fenasojaReferenceStructures';
import { campeiraTrackVisualHeight } from './campeiraTrack';
import {
  EXPORURAL_STEAKHOUSE_LAYOUT,
  exporuralSteakhouseVisualHeight,
} from './exporuralSteakhouse';
import {
  PAVILION_FOUR_SOY_KITCHEN_LAYOUT,
  pavilionFourSoyKitchenVisualHeight,
} from './pavilionFourSoyKitchen';
import {
  LIVESTOCK_TENT_LAYOUT,
  livestockTentVisualHeight,
} from './livestockTent';

export type StrategicLandmarkKind =
  | 'administrative-center'
  | 'fenasoja-headquarters'
  | 'lactalis-cultural-stage'
  | 'fenasoja-event-center'
  | 'pavilion-nine'
  | 'crioulos-center'
  | 'gate-four'
  | 'commercial-pavilion'
  | 'pavilion-four-soy-kitchen'
  | 'third-age-pavilion'
  | 'livestock-pavilion'
  | 'livestock-tent'
  | 'mirante-pavilion'
  | 'cooperativism-space'
  | 'gastronomic-alameda'
  | 'campeira-track'
  | 'polish-pavilion'
  | 'italian-pavilion'
  | 'nations-square'
  | 'nations-portico'
  | 'german-pavilion'
  | 'african-pavilion'
  | 'rotary-house'
  | 'exporural-restaurant'
  | 'fenasoja-restaurant'
  | 'sicredi-arena'
  | 'amusement-park'
  | 'lunar-tree';

export interface StrategicLandmarkBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
}

interface StrategicLandmarkDefinition {
  kind: StrategicLandmarkKind;
  aliases: readonly string[];
  facingRadians: number;
  focusDirection: readonly [number, number, number];
  visualHeight: (bounds: StrategicLandmarkBounds) => number;
}

function commercialPavilionLandmark(
  publicIdentifier: CommercialPavilionPublicIdentifier,
): StrategicLandmarkDefinition {
  const definition = resolveCommercialPavilionDefinition({ publicIdentifier });
  if (!definition) throw new Error(`Pavilhão comercial sem definição: ${publicIdentifier}`);
  return {
    kind: 'commercial-pavilion',
    aliases: [
      `Pavilhão ${definition.pavilionNumber}`,
      definition.officialName,
      `Pavilhão comercial ${definition.pavilionNumber}`,
    ],
    facingRadians: definition.facingRadians,
    focusDirection: definition.focusDirection,
    visualHeight: (bounds) => commercialPavilionVisualHeight(bounds, definition),
  };
}

const STRATEGIC_LANDMARKS: Readonly<Record<string, StrategicLandmarkDefinition>> = {
  A4: {
    kind: 'gate-four',
    aliases: [
      'Portão 4',
      'Acesso Portão 4',
      'Entrada e saída de visitantes',
      'Acesso Pavilhão 09',
    ],
    // O portal cruza a continuação norte-sul da Rua Buenos Aires. A câmera
    // permanece do lado externo do parque para revelar o vão e o corredor.
    facingRadians: 0,
    focusDirection: [-0.34, 0.5, -0.96],
    visualHeight: () => 2.45,
  },
  D5: {
    kind: 'crioulos-center',
    aliases: [
      'Núcleo dos Criadores de Cavalos Crioulos',
      'Núcleo Crioulo',
      'CCCNG',
      'Casa dos Criadores de Cavalos Crioulos',
    ],
    // O corpo fotografado é longitudinal e fica a oeste da Rua Buenos Aires.
    // A fachada cívica com mastros é lida melhor pelo quadrante sudeste.
    facingRadians: 0,
    focusDirection: [0.82, 0.52, 0.58],
    // Inclui os mastros, que são mais altos do que o telhado/chaminé.
    visualHeight: () => resolveCrioulosArchitectureEnvelope().visualHeight,
  },
  'PAVILHAO-09': {
    kind: 'pavilion-nine',
    aliases: [
      'Pavilhão 9',
      'Pavilhão 09',
      'Galpão Pavilhão 09',
      'Pavilhão do Portão 4',
    ],
    // O eixo longo acompanha a via. O foco oeste/norte apresenta simultaneamente
    // a fachada modular, a empena de acesso e o corredor do Portão 4.
    facingRadians: 0,
    focusDirection: [-0.92, 0.5, -0.38],
    visualHeight: ({ depth }) => Math.min(3.05, Math.max(2.5, depth * 0.25)),
  },
  B1: commercialPavilionLandmark('B1'),
  B2: commercialPavilionLandmark('B2'),
  B3: commercialPavilionLandmark('B3'),
  B4: commercialPavilionLandmark('B4'),
  B5: commercialPavilionLandmark('B5'),
  B6: commercialPavilionLandmark('B6'),
  B7: {
    kind: 'pavilion-four-soy-kitchen',
    aliases: [
      'Pavilhão 4',
      'Cozinha da Soja',
      'Pavilhão Cozinha da Soja',
      'P4 Cozinha da Soja',
    ],
    // A fachada fotografada abre ao sul (+Z local), diante da Quadra G.
    facingRadians: PAVILION_FOUR_SOY_KITCHEN_LAYOUT.facingRadians,
    focusDirection: PAVILION_FOUR_SOY_KITCHEN_LAYOUT.focusDirection,
    visualHeight: pavilionFourSoyKitchenVisualHeight,
  },
  B8: commercialPavilionLandmark('B8'),
  B10: commercialPavilionLandmark('B10'),
  B22: {
    kind: 'third-age-pavilion',
    aliases: [
      'Pavilhão da Terceira Idade',
      'Terceira Idade',
      'Centro da Terceira Idade',
    ],
    // A fachada de acesso abre para oeste, em direção ao ramal abaixo de A1.
    facingRadians: THIRD_AGE_PAVILION_LAYOUT.facingRadians,
    focusDirection: THIRD_AGE_PAVILION_LAYOUT.focusDirection,
    visualHeight: thirdAgePavilionVisualHeight,
  },
  B9: {
    kind: 'livestock-pavilion',
    aliases: [
      'Pavilhões de Pecuária',
      'Pavilhões 6 10 11',
      'Pecuária',
      'Livestock Pavilion',
    ],
    // O footprint oficial é um conjunto longitudinal único. A leitura
    // preferencial mostra o lado ventilado e preserva o contexto das vias.
    facingRadians: 0,
    focusDirection: [0.26, 0.31, 0.96],
    visualHeight: livestockPavilionVisualHeight,
  },
  D4: {
    kind: 'livestock-tent',
    aliases: [
      'Tenda da Pecuária',
      'Tenda Pecuária',
      'Tenda da Pecuaria',
      'Livestock Tent',
    ],
    // Fachada aberta em +Z local, orientada a oeste para o lote Q-Q-01.
    facingRadians: LIVESTOCK_TENT_LAYOUT.facingRadians,
    focusDirection: LIVESTOCK_TENT_LAYOUT.focusDirection,
    visualHeight: livestockTentVisualHeight,
  },
  B28: {
    kind: 'cooperativism-space',
    aliases: [
      'Espaço do Cooperativismo',
      'Cooperativismo',
      'Casa do Cooperativismo',
    ],
    // O frontão fotografado olha para o lote canônico Q-M-08, ao sul (+Z).
    // A orientação decorre desse vetor e não do melhor ângulo de câmera.
    facingRadians: COOPERATIVISM_FACING_RADIANS,
    focusDirection: [0.14, 0.5, 0.96],
    visualHeight: cooperativismVisualHeight,
  },
  D1: {
    kind: 'gastronomic-alameda',
    aliases: [
      'Alameda Gastronômica',
      'Alameda Gastronomica',
      'Espaço Gastronômico',
    ],
    // A fachada longa olha exatamente para leste (+X), enquanto o eixo do
    // edifício permanece reto em Z dentro do lote; sem rotação diagonal.
    facingRadians: GASTRONOMIC_ALAMEDA_FACING_RADIANS,
    focusDirection: [0.96, 0.48, 0.14],
    visualHeight: gastronomicAlamedaVisualHeight,
  },
  D3: {
    kind: 'mirante-pavilion',
    aliases: [
      'Mirante Fenasoja',
      'Pavilhão Mirante',
      'Espaço de observação',
      'Hospitalidade Mirante',
    ],
    // O eixo longo oficial corre em Z. A lateral aberta observa a Arena
    // Sicredi a leste; a câmera fica a oeste para manter essa relação legível.
    facingRadians: 0,
    focusDirection: [-0.94, 0.38, -0.22],
    visualHeight: miranteVisualHeight,
  },
  'PISTA-CAMPEIRA': {
    kind: 'campeira-track',
    aliases: [
      'Pista Campeira',
      'Área Campeira',
      'Arena Campeira',
      'Pista rural',
    ],
    // O footprint oficial permanece sem rotação; a leitura elevada revela
    // simultaneamente a superfície viva, a cerca perimetral e o único brete.
    facingRadians: 0,
    focusDirection: [0.28, 1.18, 0.92],
    visualHeight: campeiraTrackVisualHeight,
  },
  B11: {
    kind: 'administrative-center',
    aliases: [
      'Centro Administrativo',
      'Auditório Fenasoja',
      'Centro Administrativo Fenasoja',
      'Centro Administrativo / Auditório',
    ],
    // O bloco longitudinal fica a oeste da Rua Brasília. A fachada repetitiva
    // abre para leste e a empena com mural encerra o conjunto ao sul.
    facingRadians: Math.PI / 2,
    focusDirection: [0.78, 0.4, 0.68],
    visualHeight: ({ width, depth }) => Math.min(3.15, Math.max(width, depth) * 0.42),
  },
  B12: {
    kind: 'fenasoja-headquarters',
    aliases: [
      'Comissão Central',
      'Sede da Fenasoja',
      'Sede Fenasoja',
      'Fenasoja Headquarters',
    ],
    // A sede ocupa o canto sudoeste da Quadra B: a empena responde à Rua
    // Argentina, mas também se apresenta para a curva da Rua Brasília.
    facingRadians: FENASOJA_HEADQUARTERS_LAYOUT.facingRadians,
    focusDirection: [-0.42, 0.36, 0.94],
    visualHeight: ({ width, depth }) => Math.min(2.6, Math.max(width, depth) * 0.84),
  },
  B13: {
    kind: 'lactalis-cultural-stage',
    aliases: [
      'Palco Cultural',
      'Palco Lactalis',
      'Palco Cultural Lactalis',
      'Lactalis Cultural Stage',
    ],
    // O eixo de frente é calculado no espaço do mundo a partir do centro B13
    // até o centro oficial de Q-D-12. A câmera permanece no mesmo lado da
    // plateia; nenhuma rotação depende do preset ou do viewport.
    facingRadians: LACTALIS_STAGE_LAYOUT.facingRadians,
    focusDirection: [
      // Stay on the D-12 audience side while shifting south of the mature
      // canopy that otherwise occludes the opening in the default close view.
      LACTALIS_STAGE_LAYOUT.frontVector[0] + LACTALIS_STAGE_LAYOUT.frontVector[1] * 0.36,
      LACTALIS_STAGE_LAYOUT.camera.focusMinimumDirectionY,
      LACTALIS_STAGE_LAYOUT.frontVector[1] - LACTALIS_STAGE_LAYOUT.frontVector[0] * 0.36,
    ],
    visualHeight: lactalisStageVisualHeight,
  },
  C1: {
    kind: 'fenasoja-event-center',
    aliases: [
      'Centro de Eventos Fenasoja',
      'Centro de Eventos da Fenasoja',
      'Pavilhão Centro de Eventos',
      'Fenasoja Event Center',
    ],
    // O eixo longitudinal permanece no footprint oficial C1. A fachada
    // fotografada (local +Z) abre para o lote Q-E-12, a oeste, cruzando a
    // Rua Brasília.
    facingRadians: FENASOJA_EVENT_CENTER_LAYOUT.facingRadians,
    focusDirection: FENASOJA_EVENT_CENTER_LAYOUT.focusDirection,
    visualHeight: eventCenterVisualHeight,
  },
  C4: {
    kind: 'exporural-restaurant',
    aliases: [
      'Churrascaria Exporural',
      'Churrascaria da Expo Rural',
      'Restaurante Exporural',
      'Catavento da Exporural',
    ],
    facingRadians: EXPORURAL_STEAKHOUSE_LAYOUT.facingRadians,
    focusDirection: EXPORURAL_STEAKHOUSE_LAYOUT.focusDirection,
    visualHeight: exporuralSteakhouseVisualHeight,
  },
  C5: {
    kind: 'polish-pavilion',
    aliases: ['Etnia Polonesa', 'Casa Polonesa', 'Pavilhão Polonês', 'Polish House'],
    // O alpendre abre para o miolo da Praça das Nações, a leste do footprint C5.
    facingRadians: Math.PI / 2,
    focusDirection: [0.96, 0.4, 0.3],
    visualHeight: ({ width, depth }) => Math.min(2.35, Math.max(width, depth) * 0.86),
  },
  C6: {
    kind: 'italian-pavilion',
    aliases: ['Etnia Italiana', 'Casa Italiana', 'Pavilhão Italiano', 'Italian House'],
    // A varanda e a escada abrem para o miolo da Praça das Nações, a oeste de C6.
    facingRadians: -Math.PI / 2,
    focusDirection: [-0.96, 0.42, 0.28],
    visualHeight: ({ width, depth }) => Math.min(2.3, Math.max(width, depth) * 0.84),
  },
  B20: {
    kind: 'nations-square',
    aliases: [
      'Praça das Nações',
      'Praça das Etnias',
      'Eixo cívico das Etnias',
      'Nations Square',
    ],
    // O eixo cívico corre norte-sul entre o pórtico (norte) e o palco (sul).
    // O renderer distrital assume a apresentação; B20 preserva seleção e busca.
    facingRadians: 0,
    focusDirection: [0.18, 1.4, 0.36],
    // Mantém B20 como superfície cívica baixa também nos contratos de folga
    // elétrica; o palco é uma apresentação separada, ao sul do footprint.
    visualHeight: () => 0.18,
  },
  'PORTICO-NACOES': {
    kind: 'nations-portico',
    aliases: ['Pórtico das Nações', 'Portal das Nações', 'Praça das Nações', 'Nations Gateway'],
    // O portal ocupa a borda norte e abre o enquadramento para o eixo da praça.
    facingRadians: 0,
    focusDirection: [0.48, 0.42, -0.94],
    visualHeight: ({ width }) => Math.min(2.75, width * 0.94),
  },
  C8: {
    kind: 'german-pavilion',
    aliases: ['Etnia Alemã', 'Casa Alemã', 'Pavilhão Alemão'],
    // A varanda abre para a Praça das Nações, a leste do footprint C8.
    facingRadians: Math.PI / 2,
    focusDirection: [0.96, 0.36, 0.24],
    visualHeight: ({ width, depth }) => Math.min(2.15, Math.max(width, depth) * 0.78),
  },
  C7: {
    kind: 'african-pavilion',
    aliases: [
      'Etnia Africana',
      'Etnia Afro',
      'Casa da Etnia Afro',
      'Casa Africana',
      'Pavilhão Africano',
    ],
    // A varanda se volta ao vazio central, a oeste do footprint C7.
    facingRadians: -Math.PI / 2,
    focusDirection: [-0.96, 0.42, 0.28],
    visualHeight: ({ width, depth }) => Math.min(2.25, Math.max(width, depth) * 0.82),
  },
  B29: {
    kind: 'rotary-house',
    aliases: [
      'Casa Rotária',
      'Casa Rotaria',
      'Casa Rotary',
      'Rotary Club',
      'Rotary House',
    ],
    // O conjunto baixo e composto apresenta sua fachada para a praça, a leste.
    facingRadians: Math.PI / 2,
    focusDirection: [0.96, 0.4, 0.25],
    visualHeight: ({ width, depth }) => Math.min(2.1, Math.max(width, depth) * 0.68),
  },
  C2: {
    kind: 'fenasoja-restaurant',
    aliases: ['Restaurante Fenasoja', 'Restaurante da Fenasoja', 'Pavilhão Restaurante Fenasoja'],
    facingRadians: Math.PI,
    focusDirection: [-0.42, 0.4, -0.92],
    visualHeight: ({ width, depth }) => Math.min(2.7, Math.max(width, depth) * 0.62),
  },
  F: {
    kind: 'sicredi-arena',
    aliases: ['Arena Sicredi Icatu', 'Arena Sicredi', 'Palco Sicredi Icatu'],
    // A boca de cena abre para a grande área pública a oeste da Arena.
    facingRadians: -Math.PI / 2,
    focusDirection: [-0.92, 0.56, 0.32],
    visualHeight: ({ width }) => Math.min(5.5, width * 0.5),
  },
  J: {
    kind: 'amusement-park',
    aliases: [
      'Parque de Diversões',
      'Parque de Diversoes',
      'Roda-gigante',
      'Kamikaze',
      'Carrinho de bate-bate',
    ],
    // The south-east approach keeps the three rides legible while preserving
    // the exact official J footprint as the interaction and terrain boundary.
    facingRadians: 0,
    // Keep the approach low enough to read the Ferris wheel face and the
    // Kamikaze silhouette instead of collapsing both rides in a top-down view.
    focusDirection: [0.78, 0.34, 0.92],
    visualHeight: ({ width, depth }) => Math.min(6.2, Math.min(width, depth) * 0.86),
  },
  G: {
    kind: 'lunar-tree',
    aliases: [
      'Árvore Lunar',
      'Bosque da Árvore Lunar',
      'Árvore marco do parque',
      'Memorial Árvore Lunar',
      'Réplica Apollo XIV',
      'Apollo XIV',
      'Apollo 14',
      'Foguete Apollo',
      'Monumento Apollo',
    ],
    facingRadians: 0,
    // Approach from the replica side so the historic tree does not occlude Apollo XIV.
    focusDirection: [0.86, 0.58, 0.38],
    visualHeight: ({ width, depth }) => Math.max(3.8, Math.min(4.8, Math.max(width, depth) * 2.25)),
  },
};

function normalizedIdentifier(entity: Pick<MapEntity, 'publicIdentifier'>): string {
  return entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR');
}

export function resolveStrategicLandmarkKind(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): StrategicLandmarkKind | null {
  return STRATEGIC_LANDMARKS[normalizedIdentifier(entity)]?.kind ?? null;
}

export function strategicLandmarkSupportsInterior(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): boolean {
  const kind = resolveStrategicLandmarkKind(entity);
  return kind === 'fenasoja-headquarters'
    || kind === 'commercial-pavilion'
    || kind === 'livestock-pavilion'
    || kind === 'mirante-pavilion';
}

export function strategicLandmarkSearchAliases(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): readonly string[] {
  return STRATEGIC_LANDMARKS[normalizedIdentifier(entity)]?.aliases ?? [];
}

export function strategicLandmarkFacingRadians(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): number {
  return STRATEGIC_LANDMARKS[normalizedIdentifier(entity)]?.facingRadians ?? 0;
}

export function strategicLandmarkFocusDirection(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): readonly [number, number, number] | null {
  return STRATEGIC_LANDMARKS[normalizedIdentifier(entity)]?.focusDirection ?? null;
}

export function strategicLandmarkBounds(
  entity: Pick<MapEntity, 'geometry'>,
): StrategicLandmarkBounds {
  const coordinates = entity.geometry.coordinates.flat();
  const xs = coordinates.map(([x]) => x).filter(Number.isFinite);
  const zs = coordinates.map(([, z]) => z).filter(Number.isFinite);
  const minX = xs.length ? Math.min(...xs) : -0.5;
  const maxX = xs.length ? Math.max(...xs) : 0.5;
  const minZ = zs.length ? Math.min(...zs) : -0.5;
  const maxZ = zs.length ? Math.max(...zs) : 0.5;
  const width = Math.max(0.2, maxX - minX);
  const depth = Math.max(0.2, maxZ - minZ);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

export function strategicLandmarkVisualHeight(entity: MapEntity): number | null {
  const definition = STRATEGIC_LANDMARKS[normalizedIdentifier(entity)];
  if (!definition) return null;
  const visualHeight = definition.visualHeight(strategicLandmarkBounds(entity));
  if (definition.kind === 'third-age-pavilion') {
    return Math.min(THIRD_AGE_PAVILION_LAYOUT.maximumVisualHeight, visualHeight);
  }
  return Math.max(entity.geometry.extrusionHeight, visualHeight);
}
