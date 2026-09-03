import type { RegionalHighwayLayer } from './contract';

/**
 * NE cloverleaf is a dedicated overpass/roundabout mesh. No ribbon segments
 * here so the stubs are not double-drawn against BR-344 / BR-472.
 */
export const REGIONAL_HIGHWAY_LAYER: RegionalHighwayLayer = Object.freeze({
  id: 'ne-cloverleaf',
  agent: 'ne-cloverleaf',
  segments: [],
});
