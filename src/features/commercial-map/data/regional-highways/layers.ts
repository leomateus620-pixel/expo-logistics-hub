import { TERRITORY_ROADS } from '../territorialRoads';
import type { RegionalHighwayLayer, RegionalHighwayLayerModule } from './contract';

/**
 * Auto-collects sibling `*Layer.ts` files. Agent #2 adds `br344MainlineLayer.ts`,
 * Agent #3 `neCloverleafLayer.ts`, Agent #4 `seCloverleafLayer.ts` — no edits
 * to this collector are required.
 */
const layerModules = import.meta.glob<RegionalHighwayLayerModule>('./*Layer.ts', {
  eager: true,
});

export function collectRegionalHighwayLayers(): readonly RegionalHighwayLayer[] {
  return Object.values(layerModules)
    .map((module) => module.REGIONAL_HIGHWAY_LAYER)
    .filter((layer): layer is RegionalHighwayLayer => Boolean(layer));
}

export function regionalHighwaySegments() {
  return TERRITORY_ROADS.map(r => ({ id: r.id, highwayId: (r.ref?.includes('344') && !r.ref?.includes('472') ? 'BR-344' : 'BR-472') as 'BR-344' | 'BR-472', kind: (r.kind === 'highway' ? 'mainline' : 'connector') as 'mainline' | 'connector', centerline: r.points, carriagewayWidth: r.width, shoulderWidth: r.shoulder }));
}

export function regionalHighwayLabels() {
  return [{ id: 'br472', text: 'BR-472', position: [72.3, -15] as const, headingRadians: 0 }];
}
