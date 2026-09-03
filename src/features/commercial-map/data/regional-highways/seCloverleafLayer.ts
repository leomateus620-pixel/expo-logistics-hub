import type { RegionalHighwayLayer } from './contract';

/**
 * SE cloverleaf is a dedicated loop/roundabout mesh. No ribbon segments here
 * so the westbound sweep is not double-drawn against the BR-472 south arm.
 */
export const REGIONAL_HIGHWAY_LAYER: RegionalHighwayLayer = Object.freeze({
  id: 'se-cloverleaf',
  agent: 'se-cloverleaf',
  segments: [],
});
