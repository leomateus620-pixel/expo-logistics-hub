import type { MapEntity } from '../types';

export type StrategicLandmarkKind = 'german-pavilion' | 'fenasoja-restaurant' | 'sicredi-arena';

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
  C8: {
    kind: 'german-pavilion',
    aliases: ['Etnia Alemã', 'Casa Alemã', 'Pavilhão Alemão'],
    facingRadians: 0,
    focusDirection: [0.58, 0.62, 0.76],
    visualHeight: ({ width, depth }) => Math.min(2.15, Math.max(width, depth) * 0.78),
  },
  C2: {
    kind: 'fenasoja-restaurant',
    aliases: ['Restaurante Fenasoja', 'Restaurante da Fenasoja', 'Pavilhão Restaurante Fenasoja'],
    facingRadians: Math.PI,
    focusDirection: [-0.58, 0.62, -0.76],
    visualHeight: ({ width, depth }) => Math.min(2.7, Math.max(width, depth) * 0.62),
  },
  F: {
    kind: 'sicredi-arena',
    aliases: ['Arena Sicredi Icatu', 'Arena Sicredi', 'Palco Sicredi Icatu'],
    facingRadians: 0,
    focusDirection: [0.5, 0.6, 0.8],
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
