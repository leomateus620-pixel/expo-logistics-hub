/**
 * BR-344 mainline slice — reusable component + source-space polyline.
 *
 * Integrator mount (do not do this in this PR):
 *   import { Br344Mainline, BR344_SCENE_SUPPORT_POINTS } from '@/features/commercial-map/highways/br344';
 *   <Br344Mainline reducedGraphics={reducedGraphics} />
 *   getSceneExtent(entities, [...existing, ...BR344_SCENE_SUPPORT_POINTS])
 *
 * Agent #3: BR344_NE_CLOVERLEAF_HANDOFF
 * Agent #1: extend BR-472 north to BR344_SOURCE_Y; match BR344_CARTOGRAPHIC_FINISH
 */

export {
  BR344_BR472_CROSSING_SOURCE_X,
  BR344_CARTOGRAPHIC_FINISH,
  BR344_CROSS_SECTION,
  BR344_DISPLAY_NAME,
  BR344_EAST_OVERSHOOT_SOURCE,
  BR344_ELEVATION,
  BR344_FOCUS_BOUNDS,
  BR344_HUB_SOURCE_BOUNDS,
  BR344_HUB_SOURCE_HEIGHT,
  BR344_HUB_SOURCE_WIDTH,
  BR344_INTEGRATOR_CONTRACT,
  BR344_LABEL,
  BR344_LOCAL_POLYLINE,
  BR344_NE_CLOVERLEAF_HANDOFF,
  BR344_NORTH_OFFSET_FACTOR,
  BR344_PUBLISHED_NE_HANDOFF_SOURCE,
  BR344_OFFSETS,
  BR344_PUBLIC_IDENTIFIER,
  BR344_RENDER_BUDGET,
  BR344_REVISION,
  BR344_SCENE_SUPPORT_POINTS,
  BR344_SOURCE_NODES,
  BR344_SOURCE_POINTS_PER_LOCAL_UNIT,
  BR344_SOURCE_POLYLINE,
  BR344_SOURCE_Y,
  BR344_TOTAL_HALF_WIDTH,
  BR344_WEST_OVERSHOOT_SOURCE,
  BR344_WORLD_POLYLINE,
  br344FocusBounds,
  br344FootprintPolygon,
  br344HubLocalBounds,
  br344LocalPointToSource,
  br344SourcePointToLocal,
  br344SourcePointToWorld,
  br344SourceToLocalLength,
  br344TerrainElevationAt,
} from './br344Mainline';

export {
  buildBr344MainlineGeometries,
  disposeBr344MainlineGeometries,
  br344LocalLength,
} from './br344Geometry';

export { Br344Mainline } from './Br344Mainline';
export type { Br344MainlineProps } from './Br344Mainline';
