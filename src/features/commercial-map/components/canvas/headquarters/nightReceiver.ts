import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import {
  complexWorldPolygon,
  complexLocalToWorld,
  FENASOJA_COMPLEX,
} from "../../../data/fenasojaComplexReconstruction";
import type { MapEntity } from "../../../types";
import type { NightLampFixture } from "../../../utils/nightLighting";

const site = complexWorldPolygon("headquarters", "site");
// Include physical wing/eave projections, not just the annotated paved outline.
const polygon = polygonClipping
  .union(
    [site],
    [complexWorldPolygon("headquarters", "footprint")],
    [complexWorldPolygon("headquarters", "roofProjection")],
  )[0][0]
  .slice(0, -1);
export const HEADQUARTERS_NIGHT_MASK_POINTS = polygon.length;
const wallBounds = Object.values(FENASOJA_COMPLEX.headquarters.volumes).map(
  (v) => {
    const a = complexLocalToWorld(
      [v.center[0] - v.width / 2, v.center[1] - v.depth / 2],
      "headquarters",
    );
    const b = complexLocalToWorld(
      [v.center[0] + v.width / 2, v.center[1] + v.depth / 2],
      "headquarters",
    );
    return new THREE.Vector4(
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1]),
    );
  },
);
export const HEADQUARTERS_NIGHT_WALLS = wallBounds.length;
const sourceBounds = new THREE.Box2().setFromPoints(
  site.map((p) => new THREE.Vector2(...p)),
);
const maskBounds = new THREE.Box2().setFromPoints(
  polygon.map((p) => new THREE.Vector2(...p)),
);

/** The existing park pools are elevated above lot tops (0.205 map units).
 * Only in B12's precinct, receive them on its actual low sidewalk instead of
 * letting an elevated pool plane cut through plants, pots and the entrance. */
export function headquartersNightReceiver(entities: readonly MapEntity[]) {
  const entity = entities.find((e) => e.publicIdentifier === "B12");
  const bounds = entity
    ? new THREE.Box2().setFromPoints(
        entity.geometry.coordinates[0].map((p) => new THREE.Vector2(...p)),
      )
    : sourceBounds;
  const dx =
    (bounds.min.x + bounds.max.x - sourceBounds.min.x - sourceBounds.max.x) / 2;
  const dz =
    (bounds.min.y + bounds.max.y - sourceBounds.min.y - sourceBounds.max.y) / 2;
  return {
    active: !!entity,
    points: polygon.map(([x, z]) => new THREE.Vector2(x + dx, z + dz)),
    walls: wallBounds.map(
      (b) => new THREE.Vector4(b.x + dx, b.y + dz, b.z + dx, b.w + dz),
    ),
    bounds: new THREE.Vector4(
      maskBounds.min.x + dx,
      maskBounds.min.y + dz,
      maskBounds.max.x + dx,
      maskBounds.max.y + dz,
    ),
    groundY:
      (entity?.geometry.elevation ?? 0) +
      0.09 * FENASOJA_COMPLEX.registration.unitsPerMeter +
      0.0004,
  };
}

export function headquartersReceiverFixtures(
  fixtures: readonly NightLampFixture[],
  receiver: ReturnType<typeof headquartersNightReceiver>,
) {
  if (!receiver.active) return [];
  const b = receiver.bounds;
  return fixtures.filter(
    (f) =>
      f.poolCenter[0] + f.poolRadius * 1.18 > b.x &&
      f.poolCenter[0] - f.poolRadius * 1.18 < b.z &&
      f.poolCenter[2] + f.poolRadius > b.y &&
      f.poolCenter[2] - f.poolRadius < b.w,
  );
}

export const HEADQUARTERS_POOL_MASK_SHADER = /* glsl */ `
  uniform float uHqActive;
  uniform float uHqOnly;
  uniform float uHqGround;
  uniform vec4 uHqBounds;
  uniform vec2 uHqPolygon[${HEADQUARTERS_NIGHT_MASK_POINTS}];
  uniform vec4 uHqWalls[${HEADQUARTERS_NIGHT_WALLS}];
  varying vec2 vPoolWorld;
  varying vec3 vPoolPosition;
  bool inHeadquarters(vec2 p){
    if(uHqActive<0.5 || p.x<uHqBounds.x || p.x>uHqBounds.z || p.y<uHqBounds.y || p.y>uHqBounds.w)return false;
    bool inside=false;
    for(int i=0;i<${HEADQUARTERS_NIGHT_MASK_POINTS};i++){
      vec2 a=uHqPolygon[i],b=uHqPolygon[(i+${HEADQUARTERS_NIGHT_MASK_POINTS - 1})%${HEADQUARTERS_NIGHT_MASK_POINTS}];
      if((a.y>p.y)!=(b.y>p.y)){
        if(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      }
    }
    return inside;
  }
  // An elevated pool can be in front of a low wall while its ground projection
  // falls behind the building. Mask that short ray segment as well, without
  // cutting a screen-space hole in the neighboring street.
  bool crossesHeadquartersWall(vec2 a,vec2 b){
    if(uHqActive<0.5 || max(a.x,b.x)<uHqBounds.x || min(a.x,b.x)>uHqBounds.z || max(a.y,b.y)<uHqBounds.y || min(a.y,b.y)>uHqBounds.w)return false;
    vec2 d=b-a;
    vec2 inv=vec2(1.0/(abs(d.x)<0.00001?0.00001:d.x),1.0/(abs(d.y)<0.00001?0.00001:d.y));
    for(int i=0;i<${HEADQUARTERS_NIGHT_WALLS};i++){
      vec2 t0=(uHqWalls[i].xy-a)*inv,t1=(uHqWalls[i].zw-a)*inv;
      vec2 lo=min(t0,t1),hi=max(t0,t1);
      if(max(0.0,max(lo.x,lo.y))<=min(1.0,min(hi.x,hi.y)))return true;
    }
    return false;
  }
`;
