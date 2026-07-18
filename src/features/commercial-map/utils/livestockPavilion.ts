export const LIVESTOCK_PAVILION_PUBLIC_IDENTIFIER = 'B9';
export const LIVESTOCK_PAVILION_OFFICIAL_NAME = 'Pavilhões 6, 10 e 11 — Pecuária';
export const LIVESTOCK_PAVILION_RENDER_BUDGET = {
  detailDistanceMultiplier: 1.72,
  mediumCattlePerSection: 3,
  focusedCattlePerSection: 5,
  interiorCattlePerSection: 6,
  reducedInteriorCattlePerSection: 3,
  animatedCattleLimit: 4,
  animationFps: 14,
  surfaceTextureSize: 256,
  identityTextureWidth: 512,
  identityTextureHeight: 128,
} as const;

export type LivestockPavilionSectionKey = 'west' | 'central' | 'east';
export type LivestockCattleStance = 'standing' | 'feeding' | 'resting';
export type LivestockCattleBuild = 'compact' | 'standard' | 'heavy';
export type LivestockCattleMarking = 'solid' | 'white-face' | 'pied' | 'dark-points';
export type LivestockHerdDensity = 'medium' | 'focused' | 'interior' | 'reducedInterior';

export interface LivestockCattlePose {
  id: string;
  sectionKey: LivestockPavilionSectionKey;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  coat: string;
  secondaryCoat: string;
  stance: LivestockCattleStance;
  build: LivestockCattleBuild;
  marking: LivestockCattleMarking;
  horned: boolean;
  headYaw: number;
  animationPhase: number;
  animated: boolean;
}

export interface LivestockPavilionSection {
  key: LivestockPavilionSectionKey;
  centerX: number;
  width: number;
  minX: number;
  maxX: number;
  bayCount: number;
}

export interface LivestockPavilionLayout {
  width: number;
  depth: number;
  height: number;
  eaveHeight: number;
  roofRise: number;
  roofHalfSpan: number;
  roofSlopeLength: number;
  roofAngle: number;
  corridorWidth: number;
  stallDepth: number;
  sideWallHeight: number;
  platformHeight: number;
  sectionGap: number;
  sections: LivestockPavilionSection[];
}

interface PavilionBoundsDimensions {
  width: number;
  depth: number;
}

const SECTION_RATIOS = [0.305, 0.39, 0.305] as const;
const SECTION_KEYS: readonly LivestockPavilionSectionKey[] = ['west', 'central', 'east'];
const SECTION_BAYS = [5, 6, 5] as const;

interface CattleProfile {
  coat: string;
  secondaryCoat: string;
  build: LivestockCattleBuild;
  marking: LivestockCattleMarking;
  horned: boolean;
  scale: number;
}

/**
 * A small deterministic profile library avoids both heavyweight external
 * models and the visual repetition of recoloring one identical silhouette.
 * The first profile is deliberately a large light-coated zebu-type ox, while
 * the remaining profiles cover black, red-brown, cream and dark-brown cattle.
 */
const CATTLE_PROFILES: readonly CattleProfile[] = [
  {
    coat: '#eee9dc',
    secondaryCoat: '#817568',
    build: 'heavy',
    marking: 'dark-points',
    horned: true,
    scale: 1.16,
  },
  {
    coat: '#201f1d',
    secondaryCoat: '#151412',
    build: 'heavy',
    marking: 'solid',
    horned: false,
    scale: 1.04,
  },
  {
    coat: '#7b4b2f',
    secondaryCoat: '#4d2d20',
    build: 'standard',
    marking: 'solid',
    horned: true,
    scale: 0.98,
  },
  {
    coat: '#864a2e',
    secondaryCoat: '#eee5d4',
    build: 'heavy',
    marking: 'white-face',
    horned: false,
    scale: 1.05,
  },
  {
    coat: '#d8cdb7',
    secondaryCoat: '#b7a88e',
    build: 'heavy',
    marking: 'pied',
    horned: true,
    scale: 1.1,
  },
  {
    coat: '#4b352b',
    secondaryCoat: '#2f2521',
    build: 'compact',
    marking: 'solid',
    horned: false,
    scale: 0.93,
  },
  {
    coat: '#171817',
    secondaryCoat: '#e7dfcf',
    build: 'standard',
    marking: 'pied',
    horned: false,
    scale: 0.99,
  },
] as const;

/**
 * Source of truth for the purpose-built B9 asset.
 *
 * The official map stores B9 as one continuous entity. These three spatial
 * sections express the photographed roof rhythm only; they deliberately do
 * not assign pavilion numbers 6, 10 or 11 to a west/central/east position.
 */
export function createLivestockPavilionLayout(
  bounds: PavilionBoundsDimensions,
  requestedHeight: number,
): LivestockPavilionLayout {
  const width = Math.max(3, bounds.width);
  const depth = Math.max(1.4, bounds.depth);
  const height = Math.max(1.65, requestedHeight);
  const platformHeight = Math.min(0.12, depth * 0.035);
  const sectionGap = Math.min(0.2, Math.max(0.1, depth * 0.055));
  const endInset = Math.min(0.12, width * 0.008);
  const availableWidth = Math.max(2.4, width - endInset * 2 - sectionGap * 2);
  const eaveHeight = height * 0.72;
  const roofRise = height - eaveHeight;
  const roofHalfSpan = Math.max(0.66, depth / 2 - Math.min(0.035, depth * 0.01));
  const roofSlopeLength = Math.hypot(roofHalfSpan, roofRise);
  const roofAngle = Math.atan2(roofRise, roofHalfSpan);
  const corridorWidth = Math.min(depth * 0.34, Math.max(0.58, depth * 0.29));
  const stallDepth = Math.max(0.38, (depth - corridorWidth) / 2);
  const sideWallHeight = Math.min(eaveHeight * 0.31, Math.max(0.42, depth * 0.17));

  let cursor = -width / 2 + endInset;
  const sections = SECTION_RATIOS.map((ratio, index) => {
    const sectionWidth = availableWidth * ratio;
    const section: LivestockPavilionSection = {
      key: SECTION_KEYS[index],
      centerX: cursor + sectionWidth / 2,
      width: sectionWidth,
      minX: cursor,
      maxX: cursor + sectionWidth,
      bayCount: SECTION_BAYS[index],
    };
    cursor += sectionWidth + sectionGap;
    return section;
  });

  return {
    width,
    depth,
    height,
    eaveHeight,
    roofRise,
    roofHalfSpan,
    roofSlopeLength,
    roofAngle,
    corridorWidth,
    stallDepth,
    sideWallHeight,
    platformHeight,
    sectionGap,
    sections,
  };
}

export function livestockPavilionVisualHeight(bounds: PavilionBoundsDimensions): number {
  return Math.min(2.5, Math.max(2.22, bounds.depth * 0.82));
}

export function livestockPavilionBayPositions(section: LivestockPavilionSection): number[] {
  const inset = Math.min(0.12, section.width * 0.025);
  const usable = Math.max(0.2, section.width - inset * 2);
  return Array.from(
    { length: section.bayCount + 1 },
    (_, index) => section.minX + inset + usable * (index / section.bayCount),
  );
}

function cattleCountForDensity(density: LivestockHerdDensity): number {
  if (density === 'focused') return LIVESTOCK_PAVILION_RENDER_BUDGET.focusedCattlePerSection;
  if (density === 'interior') return LIVESTOCK_PAVILION_RENDER_BUDGET.interiorCattlePerSection;
  if (density === 'reducedInterior') {
    return LIVESTOCK_PAVILION_RENDER_BUDGET.reducedInteriorCattlePerSection;
  }
  return LIVESTOCK_PAVILION_RENDER_BUDGET.mediumCattlePerSection;
}

function cattleStanceFor(
  density: LivestockHerdDensity,
  index: number,
  sectionIndex: number,
): LivestockCattleStance {
  if (density === 'interior') {
    if ((index + sectionIndex * 2) % 6 === 4) return 'resting';
    if ((index * 2 + sectionIndex) % 5 === 2) return 'feeding';
    return 'standing';
  }
  if (density === 'focused') {
    if (index === 4 && sectionIndex !== 1) return 'resting';
    if ((index + sectionIndex) % 4 === 2) return 'feeding';
  }
  if (density === 'reducedInterior' && index === 2 && sectionIndex === 1) return 'resting';
  if ((index + sectionIndex * 2) % 5 === 3) return 'feeding';
  return 'standing';
}

/**
 * Deterministic herd plan shared by the exterior LOD and the interior scene.
 * All animals remain inside an official section and inside one of the two
 * stall bands; no transform participates in selection or raycasting.
 */
export function createLivestockCattlePlan(
  layout: LivestockPavilionLayout,
  density: LivestockHerdDensity,
): LivestockCattlePose[] {
  const poses: LivestockCattlePose[] = [];
  const perSection = cattleCountForDensity(density);
  let animatedCount = 0;

  layout.sections.forEach((section, sectionIndex) => {
    const bays = livestockPavilionBayPositions(section);
    for (let index = 0; index < perSection; index += 1) {
      const spreadIndex = perSection <= section.bayCount
        ? Math.round(index * (section.bayCount - 1) / Math.max(1, perSection - 1))
        : index % section.bayCount;
      const minX = bays[spreadIndex] ?? section.minX;
      const maxX = bays[spreadIndex + 1] ?? section.maxX;
      const side = (index + sectionIndex) % 2 === 0 ? 1 : -1;
      const stance = cattleStanceFor(density, index, sectionIndex);
      const profile = CATTLE_PROFILES[(index * 2 + sectionIndex * 3) % CATTLE_PROFILES.length];
      const profileVariation = 0.97 + ((index + sectionIndex * 2) % 3) * 0.025;
      const isFeeding = stance === 'feeding';
      const bayJitter = ((((index + 1) * 17 + sectionIndex * 11) % 7) - 3) * 0.018;
      const zRatio = isFeeding
        ? 0.3
        : stance === 'resting'
          ? 0.62
          : 0.5 + ((index + sectionIndex) % 3) * 0.075;
      const rotationY = isFeeding
        ? side > 0 ? Math.PI / 2 + 0.04 : -Math.PI / 2 - 0.04
        : side > 0
          ? index % 2 === 0 ? 0.08 : Math.PI - 0.12
          : index % 2 === 0 ? Math.PI + 0.09 : -0.1;
      const wantsAnimation = (density === 'focused' || density === 'interior')
        && stance !== 'resting'
        && (index + sectionIndex * 2) % 3 === 1;
      const animated = wantsAnimation
        && animatedCount < LIVESTOCK_PAVILION_RENDER_BUDGET.animatedCattleLimit;
      if (animated) animatedCount += 1;

      poses.push({
        id: `${density}:${section.key}:${index}`,
        sectionKey: section.key,
        position: [
          safeMidpoint(minX, maxX) + bayJitter,
          layout.platformHeight + 0.057,
          side * (layout.corridorWidth / 2 + layout.stallDepth * zRatio),
        ],
        rotationY,
        scale: profile.scale * profileVariation,
        coat: profile.coat,
        secondaryCoat: profile.secondaryCoat,
        stance,
        build: profile.build,
        marking: profile.marking,
        horned: profile.horned,
        headYaw: ((((index + sectionIndex) * 13) % 5) - 2) * 0.035,
        animationPhase: ((index * 1.73 + sectionIndex * 2.11) % (Math.PI * 2)),
        animated,
      });
    }
  });

  return poses;
}

function safeMidpoint(first: number, second: number): number {
  return first + (second - first) / 2;
}
