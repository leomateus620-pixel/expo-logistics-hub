import type { Coordinate, MapEntity } from '../types';
import { safeLotAnchor } from '../utils/soldLotPresentation';
import type { PublicExternalScenePolicy } from './publicScenePolicy';

/** All names and polygons come from the token-authorized inventory/context. */
export function publicContextLabels(entities: readonly MapEntity[], policy: PublicExternalScenePolicy) {
  const focus = policy.focusBounds;
  return entities.flatMap(entity => {
    const block = entity.classification === 'QUADRA';
    if ((!block && entity.classification !== 'ROAD' && entity.classification !== 'PEDESTRIAN_PATH') || !entity.name?.trim()) return [];
    const ring = entity.geometry.coordinates[0];
    if (!ring?.length || ring.some(p => !p.every(Number.isFinite))) return [];
    const minX=Math.min(...ring.map(p=>p[0])), maxX=Math.max(...ring.map(p=>p[0]));
    const minZ=Math.min(...ring.map(p=>p[1])), maxZ=Math.max(...ring.map(p=>p[1]));
    const pad=focus.diagonal*.12;
    if(maxX<focus.minX-pad||minX>focus.maxX+pad||maxZ<focus.minZ-pad||minZ>focus.maxZ+pad) return [];
    // Other segments' blocks do not become public commercial labels merely
    // because their gray context is visible behind the authorized area.
    if(block && !policy.activeScope.has(entity.id)) return [];
    const saved=entity.metadata?.labelAnchor;
    const anchor: Coordinate | undefined = Array.isArray(saved) && saved.length===2 && saved.every(v=>typeof v==='number'&&Number.isFinite(v))
      ? [Number(saved[0]),Number(saved[1])] : safeLotAnchor(entity.geometry.coordinates)?.point;
    if(!anchor) return [];
    let edge: [Coordinate, Coordinate]=[ring[0],ring[0]], length=0;
    ring.forEach((p,i)=>{const next=ring[(i+1)%ring.length];const distance=Math.hypot(next[0]-p[0],next[1]-p[1]);if(distance>length){length=distance;edge=[p,next];}});
    return [{id:entity.id,name:entity.name.trim(),block,anchor,elevation:entity.geometry.elevation+.07,edge,
      distance:Math.hypot(anchor[0]-focus.centerX,anchor[1]-focus.centerZ)}];
  }).sort((a,b)=>Number(b.block)-Number(a.block)||a.distance-b.distance);
}
