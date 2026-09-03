import { BR344_SCENE_SUPPORT_POINTS } from '../../highways/br344/br344Mainline';
import { NE_CLOVERLEAF_SCENE_SUPPORT_POINTS } from '../neCloverleafBr344Br472';
import { SE_CLOVERLEAF_SCENE_SUPPORT_POINTS } from '../seCloverleaf';
import {
  expandFramingBoundsWithRegionalHighways as expandWorldBounds,
  type RegionalHighwayFramingBounds,
} from './contract';

const FOLDED_SUPPORT_POINTS = [
  ...BR344_SCENE_SUPPORT_POINTS,
  ...NE_CLOVERLEAF_SCENE_SUPPORT_POINTS,
  ...SE_CLOVERLEAF_SCENE_SUPPORT_POINTS,
];

/**
 * Park overview crop stays 120×90. Zoom-out / pan grow to cover BR-344 and
 * both cloverleafs, including the slice support points after the fold snap.
 */
export function expandFramingBoundsWithRegionalHighways(
  park: Pick<RegionalHighwayFramingBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ' | 'maxHeight'>,
): RegionalHighwayFramingBounds {
  const base = expandWorldBounds(park);
  let { minX, maxX, minZ, maxZ, maxHeight } = base;
  FOLDED_SUPPORT_POINTS.forEach((point) => {
    minX = Math.min(minX, point.position[0]);
    maxX = Math.max(maxX, point.position[0]);
    minZ = Math.min(minZ, point.position[1]);
    maxZ = Math.max(maxZ, point.position[1]);
    maxHeight = Math.max(maxHeight, point.height ?? 0);
  });
  const width = Math.max(4, maxX - minX);
  const depth = Math.max(4, maxZ - minZ);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    maxHeight,
    diagonal: Math.hypot(width, depth),
  };
}

export const FOLDED_REGIONAL_HIGHWAY_SCENE_SUPPORT_POINTS = Object.freeze(FOLDED_SUPPORT_POINTS);
