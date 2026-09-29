import { dimensionRectsOverlap, type DimensionScreenRect } from './pavilionDimensions';

/** If a touch margin crosses a lot, move the badge along the wall's outward
 * normal, keeping a leader to the access. Never clamp it to the viewport. */
export function layoutPavilionAccess(anchor: readonly [number, number], outward: readonly [number, number],
  viewport: { width: number; height: number }, obstacles: readonly DimensionScreenRect[]) {
  const norm = Math.hypot(...outward);
  if (!Number.isFinite(norm) || norm < 0.001) return null;
  for (const size of [44, 30]) for (const distance of [0, 16, 32, 48]) {
    const dx=outward[0]/norm*distance, dy=outward[1]/norm*distance;
    const x=anchor[0]+dx, y=anchor[1]+dy;
    const rect={left:x-size/2,right:x+size/2,top:y-size/2,bottom:y+size/2};
    if (rect.left<2 || rect.top<2 || rect.right>viewport.width-2 || rect.bottom>viewport.height-2) continue;
    if (obstacles.some(obstacle => dimensionRectsOverlap(rect,obstacle,2))) continue;
    return {dx,dy,size,rect};
  }
  return null;
}
