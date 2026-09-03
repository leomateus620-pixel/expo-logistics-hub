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
  return collectRegionalHighwayLayers().flatMap((layer) => layer.segments);
}

export function regionalHighwayLabels() {
  return collectRegionalHighwayLayers().flatMap((layer) => layer.labels ?? []);
}
