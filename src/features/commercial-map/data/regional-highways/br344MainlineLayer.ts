import {
  BR344_DISPLAY_NAME,
  BR344_LOCAL_POLYLINE,
} from '../../highways/br344/br344Mainline';
import { INTERCHANGE_ENVELOPES, type RegionalHighwayLayer } from './contract';

const west = BR344_LOCAL_POLYLINE[0];
const east = BR344_LOCAL_POLYLINE[BR344_LOCAL_POLYLINE.length - 1];
const ne = INTERCHANGE_ENVELOPES.neCloverleaf.center;

/**
 * BR-344 labels only. Pavement is the dedicated dual-carriageway mesh so the
 * NE stubs are not double-drawn by the regional ribbon renderer.
 */
export const REGIONAL_HIGHWAY_LAYER: RegionalHighwayLayer = Object.freeze({
  id: 'br344-mainline',
  agent: 'br344',
  segments: [],
  labels: [
    Object.freeze({
      id: 'br344-label-west',
      text: BR344_DISPLAY_NAME,
      position: Object.freeze([
        (west[0] + ne[0]) / 2,
        west[1],
      ] as const),
      headingRadians: Math.PI / 2,
    }),
    Object.freeze({
      id: 'br344-label-east',
      text: BR344_DISPLAY_NAME,
      position: Object.freeze([
        (east[0] + ne[0]) / 2,
        east[1],
      ] as const),
      headingRadians: Math.PI / 2,
    }),
  ],
});
