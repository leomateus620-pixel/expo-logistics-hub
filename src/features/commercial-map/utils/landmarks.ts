import type { MapEntity } from '../types';

export type StrategicLandmarkKind =
  | 'administrative-center'
  | 'fenasoja-headquarters'
  | 'polish-pavilion'
  | 'italian-pavilion'
  | 'nations-portico'
  | 'german-pavilion'
  | 'fenasoja-restaurant'
  | 'sicredi-arena';

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

const STRATEGIC_LANDMARKS: Readonly<Record<string, StrategicLandmarkDefinition>> = {
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
    facingRadians: -Math.PI / 18,
    focusDirection: [-0.42, 0.36, 0.94],
    visualHeight: ({ width, depth }) => Math.min(2.6, Math.max(width, depth) * 0.84),
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
  'PORTICO-NACOES': {
    kind: 'nations-portico',
    aliases: ['Pórtico das Nações', 'Portal das Nações', 'Praça das Nações', 'Nations Gateway'],
    // O portal marca a chegada pelo lado sul do conjunto das etnias.
    facingRadians: 0,
    focusDirection: [0.48, 0.4, 0.94],
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
};

function normalizedIdentifier(entity: Pick<MapEntity, 'publicIdentifier'>): string {
  return entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR');
}

export function resolveStrategicLandmarkKind(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): StrategicLandmarkKind | null {
  return STRATEGIC_LANDMARKS[normalizedIdentifier(entity)]?.kind ?? null;
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
  return Math.max(entity.geometry.extrusionHeight, definition.visualHeight(strategicLandmarkBounds(entity)));
}
