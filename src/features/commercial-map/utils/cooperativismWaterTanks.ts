import { EXPORURAL_MAP_UNITS_PER_METER } from '../data/exporuralReference2026';
import { hydrologicalPlanPointToWorldXZ } from '../data/hydrologicalInfrastructure';
import type { Coordinate } from '../types';

type ReadonlyCoordinate = readonly [number, number];

export type CooperativismWaterTankRole = 'bakof-blue' | 'charcoal-steel' | 'galvanized-rust';

export interface CooperativismHostBounds {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const meters = (value: number) => value * EXPORURAL_MAP_UNITS_PER_METER;

/**
 * Official A2 hydro symbols for the three elevated tanks beside B28.
 * Identifiers already exist on the hydrological plan — this is presentation
 * only and does not invent a cadastral ID.
 */
export const COOPERATIVISM_WATER_TANK_PLAN = Object.freeze([
  Object.freeze({
    hydroId: 'reservoir-cooperative-01',
    role: 'bakof-blue' as const,
    label: 'BAKOF',
    sourcePagePosition: [852.28, 488.89] as const,
  }),
  Object.freeze({
    hydroId: 'reservoir-cooperative-02',
    role: 'charcoal-steel' as const,
    label: null,
    sourcePagePosition: [852.31, 495.71] as const,
  }),
  Object.freeze({
    hydroId: 'reservoir-cooperative-03',
    role: 'galvanized-rust' as const,
    label: null,
    sourcePagePosition: [852.19, 502.27] as const,
  }),
]);

export const COOPERATIVISM_WATER_TANK_LAYOUT = Object.freeze({
  revision: '2026.9-cooperativism-tanks.1',
  hostPublicIdentifier: 'B28',
  hostDisplayName: 'Espaço do Cooperativismo',
  groupName: 'caixas-dagua-espaco-cooperativismo',
  mapUnitsPerMeter: EXPORURAL_MAP_UNITS_PER_METER,
  tower: Object.freeze({
    heightMeters: 6,
    squareWidthMeters: 1.9,
    braceLevels: 4,
    steelThicknessMeters: 0.1,
    platformThicknessMeters: 0.14,
    platformOverhangMeters: 0.22,
  }),
  tanks: Object.freeze({
    bakof: Object.freeze({
      bottomRadiusMeters: 1.08,
      topRadiusMeters: 1.24,
      heightMeters: 3.2,
      ribCount: 9,
    }),
    charcoal: Object.freeze({
      radiusMeters: 1.16,
      heightMeters: 3.05,
    }),
    galvanized: Object.freeze({
      radiusMeters: 1.18,
      heightMeters: 3.12,
    }),
  }),
  walkway: Object.freeze({
    widthMeters: 0.78,
    deckThicknessMeters: 0.08,
    railHeightMeters: 1.05,
    railThicknessMeters: 0.055,
  }),
  pad: Object.freeze({
    sizeMeters: 2.55,
    thicknessMeters: 0.18,
  }),
  palette: Object.freeze({
    rustedSteel: '#5a3324',
    rustedSteelDark: '#3a2118',
    bakofBlue: '#1c6ec8',
    bakofBlueDeep: '#0e4f96',
    charcoal: '#4a4e52',
    galvanized: '#b7bdc0',
    galvanizedRust: '#8a5a3a',
    walkway: '#4d3428',
    rail: '#2f241c',
    concrete: '#9a958a',
    bakofLetter: '#f4f6f8',
  }),
  renderBudget: Object.freeze({
    baseDrawCalls: 10,
    detailDrawCalls: 14,
    textureAssets: 1,
  }),
});

export function cooperativismWaterTankWorldPosition(
  sourcePagePosition: ReadonlyCoordinate,
): Coordinate {
  return hydrologicalPlanPointToWorldXZ([...sourcePagePosition]);
}

export function cooperativismWaterTankTowerHeight() {
  return meters(COOPERATIVISM_WATER_TANK_LAYOUT.tower.heightMeters);
}

export function cooperativismWaterTankVisualHeight() {
  const tallestTank = Math.max(
    COOPERATIVISM_WATER_TANK_LAYOUT.tanks.bakof.heightMeters,
    COOPERATIVISM_WATER_TANK_LAYOUT.tanks.charcoal.heightMeters,
    COOPERATIVISM_WATER_TANK_LAYOUT.tanks.galvanized.heightMeters,
  );
  return cooperativismWaterTankTowerHeight()
    + meters(COOPERATIVISM_WATER_TANK_LAYOUT.tower.platformThicknessMeters)
    + meters(tallestTank);
}

export interface CooperativismWaterTankInstance {
  hydroId: string;
  role: CooperativismWaterTankRole;
  label: string | null;
  sourcePagePosition: ReadonlyCoordinate;
  worldPosition: Coordinate;
  localOffset: Coordinate;
  towerWidth: number;
  towerHeight: number;
  platformY: number;
  padSize: number;
  padThickness: number;
}

export interface CooperativismWaterTankFieldLayout {
  hostPublicIdentifier: 'B28';
  tanks: readonly CooperativismWaterTankInstance[];
  rowDirection: Coordinate;
  walkway: {
    width: number;
    deckThickness: number;
    railHeight: number;
    railThickness: number;
    segments: readonly {
      start: Coordinate;
      end: Coordinate;
      center: Coordinate;
      length: number;
    }[];
  };
  tower: {
    braceLevels: number;
    steelThickness: number;
    platformThickness: number;
    platformOverhang: number;
  };
}

function subtract(a: Coordinate, b: Coordinate): Coordinate {
  return [a[0] - b[0], a[1] - b[1]];
}

export function createCooperativismWaterTankLayout(
  bounds: CooperativismHostBounds,
): CooperativismWaterTankFieldLayout {
  const towerWidth = meters(COOPERATIVISM_WATER_TANK_LAYOUT.tower.squareWidthMeters);
  const towerHeight = cooperativismWaterTankTowerHeight();
  const platformThickness = meters(COOPERATIVISM_WATER_TANK_LAYOUT.tower.platformThicknessMeters);
  const padSize = meters(COOPERATIVISM_WATER_TANK_LAYOUT.pad.sizeMeters);
  const padThickness = meters(COOPERATIVISM_WATER_TANK_LAYOUT.pad.thicknessMeters);
  const tanks = COOPERATIVISM_WATER_TANK_PLAN.map((spec) => {
    const worldPosition = cooperativismWaterTankWorldPosition(spec.sourcePagePosition);
    return Object.freeze({
      hydroId: spec.hydroId,
      role: spec.role,
      label: spec.label,
      sourcePagePosition: spec.sourcePagePosition,
      worldPosition,
      localOffset: subtract(worldPosition, [bounds.centerX, bounds.centerZ]),
      towerWidth,
      towerHeight,
      platformY: towerHeight + platformThickness,
      padSize,
      padThickness,
    });
  });

  const walkwaySegments = tanks.slice(0, -1).map((tank, index) => {
    const next = tanks[index + 1];
    const start = tank.localOffset;
    const end = next.localOffset;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    return Object.freeze({
      start,
      end,
      center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] as Coordinate,
      length,
    });
  });

  const first = tanks[0].localOffset;
  const last = tanks[tanks.length - 1].localOffset;
  const rowLength = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const rowDirection = rowLength > 1e-6
    ? [(last[0] - first[0]) / rowLength, (last[1] - first[1]) / rowLength] as Coordinate
    : [0, 1] as Coordinate;

  return {
    hostPublicIdentifier: 'B28',
    tanks,
    rowDirection,
    walkway: {
      width: meters(COOPERATIVISM_WATER_TANK_LAYOUT.walkway.widthMeters),
      deckThickness: meters(COOPERATIVISM_WATER_TANK_LAYOUT.walkway.deckThicknessMeters),
      railHeight: meters(COOPERATIVISM_WATER_TANK_LAYOUT.walkway.railHeightMeters),
      railThickness: meters(COOPERATIVISM_WATER_TANK_LAYOUT.walkway.railThicknessMeters),
      segments: walkwaySegments,
    },
    tower: {
      braceLevels: COOPERATIVISM_WATER_TANK_LAYOUT.tower.braceLevels,
      steelThickness: meters(COOPERATIVISM_WATER_TANK_LAYOUT.tower.steelThicknessMeters),
      platformThickness,
      platformOverhang: meters(COOPERATIVISM_WATER_TANK_LAYOUT.tower.platformOverhangMeters),
    },
  };
}

export function cooperativismWaterTankPadPolygon(
  tank: CooperativismWaterTankInstance,
): readonly Coordinate[] {
  const half = tank.padSize / 2;
  const [x, z] = tank.worldPosition;
  return Object.freeze([
    [x - half, z - half],
    [x + half, z - half],
    [x + half, z + half],
    [x - half, z + half],
  ]);
}
