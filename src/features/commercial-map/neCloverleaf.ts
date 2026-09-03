/**
 * Public API for the isolated NE cloverleaf (BR-344 × BR-472).
 *
 * Agent #1 (bounds / BR-472 mainline) should:
 *   1. Spread `NE_CLOVERLEAF_SCENE_SUPPORT_POINTS` into `getSceneExtent`.
 *   2. Render `<NeCloverleafInterchange reducedGraphics={reducedGraphics} />`
 *      next to the rear-road layer. Do not edit this module to reach the park.
 *
 * Agent #2 (BR-344 mainline) should land on `NE_CLOVERLEAF_STUBS.br344West`
 * and `br344East` (dual carriageway, same width / median / elevation at the
 * stub ends).
 */
export { NeCloverleafInterchange } from './components/canvas/NeCloverleafInterchange';
export {
  NE_CLOVERLEAF_BUDGET,
  NE_CLOVERLEAF_CENTER_LOCAL,
  NE_CLOVERLEAF_CENTER_SOURCE,
  NE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE,
  NE_CLOVERLEAF_COLORS,
  NE_CLOVERLEAF_LAYOUT,
  NE_CLOVERLEAF_QUADRANTS,
  NE_CLOVERLEAF_REVISION,
  NE_CLOVERLEAF_ROUNDABOUT_CENTERS,
  NE_CLOVERLEAF_SCENE_SUPPORT_POINTS,
  NE_CLOVERLEAF_STUBS,
  neCloverleafClearanceFromPark,
  neCloverleafLocalToSource,
} from './data/neCloverleafBr344Br472';
export {
  buildNeCloverleafGeometries,
  disposeNeCloverleafGeometries,
  neCloverleafBr344Elevation,
  neCloverleafBr472Elevation,
  sampleNeCloverleafInnerRamp,
  sampleNeCloverleafOuterRamp,
} from './utils/neCloverleafGeometry';
