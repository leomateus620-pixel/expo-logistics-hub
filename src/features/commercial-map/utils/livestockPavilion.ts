export const LIVESTOCK_PAVILION_PUBLIC_IDENTIFIER = 'B9';
export const LIVESTOCK_PAVILION_OFFICIAL_NAME = 'Pavilhões 6, 10 e 11 — Pecuária';
export const LIVESTOCK_PAVILION_RENDER_BUDGET = {
  detailDistanceMultiplier: 2.15,
  mediumCattlePerSection: 3,
  focusedCattlePerSection: 5,
  interiorCattlePerSection: 6,
  reducedInteriorCattlePerSection: 3,
  identityTextureWidth: 512,
  identityTextureHeight: 128,
} as const;

export type LivestockPavilionSectionKey = 'west' | 'central' | 'east';

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
