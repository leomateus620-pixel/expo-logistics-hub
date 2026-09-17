import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA_CANONICAL_LAYOUT } from '../data/arenaCanonicalLayout';

const SPEC = ARENA_CANONICAL_LAYOUT.architecture;
const Y = new THREE.Vector3(0, 1, 0);
export const ARENA_RENDER_BUDGET = Object.freeze({ maxDrawCalls: 10, maxTriangles: 12000, textureSize: [1024, 128] });

function finish<T extends THREE.BufferGeometry>(geometry: T): T {
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}
function merge(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!merged) throw new Error('Arena geometry attributes must be compatible');
  return finish(merged);
}
function beam(a: THREE.Vector3, b: THREE.Vector3, thickness: number) {
  const delta = b.clone().sub(a);
  const g = new THREE.BoxGeometry(thickness, delta.length(), thickness);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, delta.normalize()));
  g.translate((a.x + b.x)/2, (a.y + b.y)/2, (a.z + b.z)/2);
  return g;
}
/** Finite-thickness continuous barrel vault. The outer envelope IS F's footprint. */
export function createArenaRoof(width: number, depth: number) {
  const half = width/2, rise = width*SPEC.riseToSpan, n = SPEC.archSegments;
  const p: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let skin = 0; skin < 2; skin++) {
    for (let i = 0; i <= n; i++) {
      const t = Math.PI*i/n;
      // Inward radial section preserves the footprint, gives the underside depth.
      const a = half - skin*SPEC.shellThickness, b = rise - skin*SPEC.shellThickness;
      for (const z of [-depth/2, depth/2]) {
        p.push(a*Math.cos(t), SPEC.springHeight + b*Math.sin(t), z);
        uv.push(i/n, (z+depth/2)/depth);
      }
    }
  }
  const offset = (n+1)*2;
  for (let i=0;i<n;i++) {
    const v=i*2;
    indices.push(v,v+2,v+1, v+1,v+2,v+3);
    const w=v+offset;
    indices.push(w,w+1,w+2, w+1,w+3,w+2);
    // Close the front/back edges, NOT the open portal beneath the roof.
    indices.push(v,w,v+2, v+2,w,w+2, v+1,v+3,w+1, v+3,w+3,w+1);
  }
  for (const v of [0,n*2]) indices.push(v,v+offset,v+1, v+1,v+offset,v+offset+1);
  const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
  g.userData = { canonicalFootprint: true, width, depth, thickness: SPEC.shellThickness };
  return finish(g);
}
function archBand(width: number, rise: number, bandWidth: number, bandDepth: number) {
  const a = width/2, shape = new THREE.Shape();
  shape.moveTo(a,0);
  for(let i=0;i<=SPEC.archSegments;i++){ const t=Math.PI*i/SPEC.archSegments; shape.lineTo(a*Math.cos(t),rise*Math.sin(t)); }
  for(let i=SPEC.archSegments;i>=0;i--){const t=Math.PI*i/SPEC.archSegments;shape.lineTo((a-bandWidth)*Math.cos(t),(rise-bandWidth)*Math.sin(t));}
  shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:bandDepth,bevelEnabled:false,curveSegments:1,steps:1});
  g.translate(0,SPEC.springHeight,-bandDepth/2);return finish(g);
}
/** One reusable triangulated arch; nine instances, not hundreds of objects. */
function truss(width: number, rise: number) {
  const parts: THREE.BufferGeometry[] = [], n=20;
  const outer=(i:number)=>new THREE.Vector3((width/2-0.055)*Math.cos(Math.PI*i/n),SPEC.springHeight+(rise-0.055)*Math.sin(Math.PI*i/n),0);
  const inner=(i:number)=>new THREE.Vector3((width/2-SPEC.trussDepth)*Math.cos(Math.PI*i/n),SPEC.springHeight+(rise-SPEC.trussDepth)*Math.sin(Math.PI*i/n),0);
  for(let i=0;i<n;i++) {
    parts.push(beam(outer(i),outer(i+1),0.021),beam(inner(i),inner(i+1),0.021));
    parts.push(beam(i%2?inner(i):outer(i),i%2?outer(i+1):inner(i+1),0.013));
  }
  return merge(parts);
}
/** Each layer is rendered once, and has explicit ownership/disposal. No GPU downloads. */
export function createArenaArchitecture(width: number, depth: number) {
  if (!(width > 0 && depth > 0)) throw new Error('Arena dimensions must be positive');
  const rise=width*SPEC.riseToSpan;
  const roof=createArenaRoof(width,depth), rib=truss(width,rise);
  const front=archBand(width,rise,SPEC.fasciaWidth,SPEC.fasciaDepth);
  const rear=front.clone();front.translate(0,0,depth/2-SPEC.fasciaDepth/2);rear.translate(0,0,-depth/2+SPEC.fasciaDepth/2);
  const fascia=merge([front,rear]);
  const steel: THREE.BufferGeometry[]=[];
  const ribs=Array.from({length:SPEC.structuralBays+1},(_,i)=>-depth/2+0.08+(depth-0.16)*i/SPEC.structuralBays);
  for(let i=1;i<10;i++) {
    const t=Math.PI*i/10;
    steel.push(beam(new THREE.Vector3((width/2-0.07)*Math.cos(t),SPEC.springHeight+(rise-0.07)*Math.sin(t),-depth/2+0.06),
      new THREE.Vector3((width/2-0.07)*Math.cos(t),SPEC.springHeight+(rise-0.07)*Math.sin(t),depth/2-0.06),0.022));
  }
  for(const z of ribs) for(const side of [-1,1]) {
    const x=side*width*0.40, h=SPEC.springHeight+Math.sqrt(1-0.8*0.8)*(rise-0.08);
    steel.push(beam(new THREE.Vector3(x,0,z),new THREE.Vector3(x,h,z),0.042));
    const foot=new THREE.BoxGeometry(0.12,0.035,0.16);foot.translate(x,0.0175,z);steel.push(foot);
  }
  // Two visible hangers carry the physical signboard. No billboard/Html label.
  for(const x of [-width*.18,width*.18]) steel.push(beam(new THREE.Vector3(x,rise*.79,depth/2-.095),new THREE.Vector3(x,rise*.89,depth/2-.095),0.017));
  const structure=merge(steel);
  const floor=finish(new THREE.BoxGeometry(width,0.035,depth).translate(0,-0.0175,0));
  const signWidth=width*.57, signHeight=signWidth/8;
  const signBacking=finish(new THREE.BoxGeometry(signWidth,signHeight,0.042).translate(0,rise*.79-signHeight/2,depth/2-.095));
  const signFace=finish(new THREE.PlaneGeometry(signWidth*.985,signHeight*.9).translate(0,rise*.79-signHeight/2,depth/2-.071));
  // Court markings make depth readable through both open portals (one line draw).
  const lines:number[]=[]; const line=(a:number,b:number,c:number,d:number)=>lines.push(a,.004,b,c,.004,d);
  const cw=width*.60/2, cd=depth*.72/2;
  line(-cw,-cd,cw,-cd);line(cw,-cd,cw,cd);line(cw,cd,-cw,cd);line(-cw,cd,-cw,-cd);line(-cw,0,cw,0);
  for(let i=0;i<40;i++){const a=2*Math.PI*i/40,b=2*Math.PI*(i+1)/40;line(Math.cos(a)*.46,Math.sin(a)*.46,Math.cos(b)*.46,Math.sin(b)*.46);}
  const courtLines=new THREE.BufferGeometry();courtLines.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));courtLines.computeBoundingSphere();
  // Seams across each sheet run: low-cost actual lines, no oversized texture.
  const seam:number[]=[];
  for(let j=1;j<SPEC.structuralBays*2;j++) for(let i=0;i<SPEC.archSegments;i++){
    const z=-depth/2+depth*j/(SPEC.structuralBays*2),a=Math.PI*i/SPEC.archSegments,b=Math.PI*(i+1)/SPEC.archSegments;
    seam.push((width/2+.001)*Math.cos(a),SPEC.springHeight+(rise+.001)*Math.sin(a),z,
      (width/2+.001)*Math.cos(b),SPEC.springHeight+(rise+.001)*Math.sin(b),z);
  }
  const seams=new THREE.BufferGeometry();seams.setAttribute('position',new THREE.Float32BufferAttribute(seam,3));seams.computeBoundingSphere();
  const geometries={roof,rib,fascia,structure,floor,signBacking,signFace,courtLines,seams};
  return { ...geometries, ribs, rise, dispose: ()=>Object.values(geometries).forEach(g=>g.dispose()) };
}
