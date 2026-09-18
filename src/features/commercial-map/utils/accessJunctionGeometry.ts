import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
type Point = readonly [number,number];

export function accessCorridor(points:readonly Point[],width:number):Ring {
  const left:Ring=[],right:Ring=[];
  points.forEach((p,i)=>{
    const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)];
    const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
    const x=-(b[1]-a[1])/d*width/2,z=(b[0]-a[0])/d*width/2;
    left.push([p[0]+x,p[1]+z]);right.push([p[0]-x,p[1]-z]);
  });
  const ring=[...left,...right.reverse()];return [...ring,ring[0]];
}
export function accessCircle(center:Point,radius:number,segments=48):Ring {
  return Array.from({length:segments+1},(_,i)=>[center[0]+Math.cos(i/segments*Math.PI*2)*radius,
    center[1]+Math.sin(i/segments*Math.PI*2)*radius] as [number,number]);
}
export function unionAccessPavement(surfaces:readonly (readonly Point[])[],
  roundabouts:readonly {center:Point;outerRadius:number;islandRadius:number;curbWidth:number}[],segments=48):MultiPolygon {
  const pieces:MultiPolygon[]=surfaces.map(r=>[[r.map(p=>[p[0],p[1]])]]);
  pieces.push(...roundabouts.map(r=>[[accessCircle(r.center,r.outerRadius,segments)]] as MultiPolygon));
  if(!pieces.length)return [];
  const union=polygonClipping.union(pieces[0],...pieces.slice(1));
  // No asphalt under either island, including approach corridors into a ring.
  const islands=roundabouts.map(r=>[[accessCircle(r.center,r.islandRadius+r.curbWidth,segments)]] as MultiPolygon);
  return islands.length?polygonClipping.difference(union,...islands):union;
}
export function accessPavementGeometry(polygons:MultiPolygon,elevation:number) {
  const parts=polygons.map(rings=>{
    const shape=new THREE.Shape(rings[0].map(p=>new THREE.Vector2(p[0],-p[1])));
    rings.slice(1).forEach(r=>shape.holes.push(new THREE.Path(r.map(p=>new THREE.Vector2(p[0],-p[1])))));
    const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,elevation,0);return g;
  });
  if(!parts.length)return null;
  const result=mergeBufferGeometries(parts,false);parts.forEach(g=>g.dispose());return result;
}
