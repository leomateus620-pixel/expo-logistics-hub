import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { RURAL_PAVILIONS } from '../data/ruralPavilionReconstruction';

export type RuralBatch = 'opaque' | 'glass' | 'metal';
export interface RuralBox {
  id: string; batch: RuralBatch; position: [number, number, number];
  scale: [number, number, number]; rotation?: [number, number, number]; color: string;
}
export interface RuralRecipe {
  boxes: RuralBox[]; width: number; depth: number; eave: number; rise: number;
  front: number; rear: number; wallFront: number; windowCount: number;
  gables: { z: number; halfSpan: number; bottom: number; rise: number; color: string }[];
}
const P = { brick: '#94745a', mortar: '#aaa18a', dark: '#41494a', roof: '#4a4a45',
  frame: '#a4aba0', pane: '#71877a', concrete: '#97968b', light: '#c6c7ba', wood: '#635648' };

/** Static architecture recipe shared by the actual renderers and geometry tests.
 * Openings are real holes between masonry piers/lintels, with recessed glazing.
 * Every repeating member ends in a material batch, not a React component.
 */
export function ruralBuildingRecipe(kind: 'testDrive' | 'livestock', width: number, depth: number,
  height: number, detailed = true, focused = false): RuralRecipe {
  if (![width, depth, height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid rural building envelope');
  const test = kind === 'testDrive';
  const floor = test ? RURAL_PAVILIONS.testDrive.floor : 0.035;
  const eave = test ? RURAL_PAVILIONS.testDrive.eaveHeight : height * 0.66;
  const rise = test ? RURAL_PAVILIONS.testDrive.roofRise : height - eave;
  const half = width * 0.485, roofDepth = depth * 0.975;
  const sideX = width * 0.415, front = depth * 0.44, rear = -depth * 0.44;
  const wallFront = test ? front - depth * 0.14 : rear + depth * RURAL_PAVILIONS.livestock.enclosedRearFraction;
  const thickness = Math.min(width * 0.032, 0.065);
  const boxes: RuralBox[] = [];
  const add = (id: string, batch: RuralBatch, position: RuralBox['position'], scale: RuralBox['scale'], color: string, rotation?: RuralBox['rotation']) => {
    if (scale.some(n => n <= 0 || !Number.isFinite(n))) throw new Error(`Invalid member ${id}`);
    boxes.push({ id, batch, position, scale, color, ...(rotation ? { rotation } : {}) });
  };
  const beam = (id: string, a: [number, number], b: [number, number], z: number, t: number, color = P.wood) => {
    add(id, 'metal', [(a[0]+b[0])/2,(a[1]+b[1])/2,z], [Math.hypot(b[0]-a[0],b[1]-a[1]),t,t], color, [0,0,Math.atan2(b[1]-a[1],b[0]-a[0])]);
  };
  add('foundation', 'opaque', [0, floor / 2, 0], [width * .87, floor, depth * .92], P.concrete);
  for (const side of [-1,1]) {
    add(`roof-${side}`, 'opaque', [side*half/2,eave+rise/2,0],
      [Math.hypot(half,rise),.025,roofDepth],P.roof,[0,0,-side*Math.atan2(rise,half)]);
    add(`eave-${side}`, 'metal', [side*half,eave,0], [.025,.042,roofDepth],P.wood);
  }
  add('ridge','metal',[0,eave+rise+.01,0],[.055,.025,roofDepth],P.roof);
  const doorWidth = width * (test ? .2 : .22), doorTop = eave * .83;
  // Front of the enclosed wing: door opening deliberately empty between jambs.
  for (const side of [-1,1]) {
    const end = sideX, start = doorWidth/2;
    add(`front-wall-${side}`,'opaque',[side*(end+start)/2,(eave+floor)/2,wallFront],
      [end-start,eave-floor,thickness],test?P.brick:P.light);
    add(`door-jamb-${side}`,'opaque',[side*(doorWidth/2+.01),(floor+doorTop)/2,wallFront+.014],
      [.035,doorTop-floor,.08],P.light);
  }
  add('door-lintel','opaque',[0,(eave+doorTop)/2,wallFront],[doorWidth,eave-doorTop,thickness],test?P.brick:P.light);
  add('door','metal',[0,(floor+doorTop)/2,wallFront-.018],[doorWidth*.95,doorTop-floor,.028],P.dark);
  add('rear-wall','opaque',[0,(eave+floor)/2,rear],[sideX*2,eave-floor,thickness],test?P.brick:P.light);
  const windowBays = test ? RURAL_PAVILIONS.testDrive.windowBays : 3;
  const wingDepth = wallFront - rear, pitch = wingDepth / windowBays;
  const opening = pitch*.53, bottom = floor+eave*.28, top = eave*.78;
  for (const side of [-1,1]) {
    const x = side*sideX;
    // Continuous sill and lintel bands; opaque masonry never covers a window.
    add(`side-sill-band-${side}`,'opaque',[x,(floor+bottom)/2,(rear+wallFront)/2],[thickness,bottom-floor,wingDepth],test?P.brick:P.light);
    add(`side-lintel-band-${side}`,'opaque',[x,(top+eave)/2,(rear+wallFront)/2],[thickness,eave-top,wingDepth],test?P.brick:P.light);
    for (let i=0;i<=windowBays;i++) {
      const z=rear+pitch*i;
      const pier=pitch-opening;
      add(`side-pier-${side}-${i}`,'opaque',[x,(top+bottom)/2,z+(i===0?pier/4:i===windowBays?-pier/4:0)],
        [thickness,top-bottom,(i===0||i===windowBays)?pier/2:pier],test? (i%2?P.brick:'#9c7c60'):P.light);
    }
    for (let i=0;i<windowBays;i++) {
      const z=rear+pitch*(i+.5), face=x+side*(thickness/2+.009);
      add(`window-${side}-${i}`,'glass',[x-side*.013,(top+bottom)/2,z],[.014,top-bottom-.016,opening-.012],P.pane);
      for (const edge of [-1,1]) {
        add(`window-jamb-${side}-${i}-${edge}`,'metal',[face,(top+bottom)/2,z+edge*opening/2],[.027,top-bottom+.025,.018],P.frame);
        add(`window-rail-${side}-${i}-${edge}`,'metal',[face,edge<0?bottom:top,z],[.032,.018,opening+.02],P.frame);
      }
      if (detailed) for(let j=1;j<4;j++) {
        add(`window-louver-${side}-${i}-${j}`,'metal',[face,bottom+(top-bottom)*j/4,z],[.029,.011,opening],P.frame);
      }
    }
    if(test && detailed) for(const y of [floor+.045, floor+.09, top+.035,top+.075]) {
      if(y<eave) add(`mortar-${side}-${y}`,'opaque',[x+side*(thickness/2+.001),y,(rear+wallFront)/2],[.003,.004,wingDepth],P.mortar);
    }
  }
  if (test) {
    // The photographed front gable is an exposed truss above the recessed door.
    for(const side of [-1,1]) add(`porch-post-${side}`,'metal',[side*sideX,(eave+floor)/2,front], [.037,eave-floor,.037],P.wood);
    for(const z of [front,rear]) {
      beam(`gable-tie-${z}`,[-sideX,eave-.045],[sideX,eave-.045],z,.024);
      beam(`gable-left-${z}`,[-half,eave],[0,eave+rise],z,.022);
      beam(`gable-right-${z}`,[0,eave+rise],[half,eave],z,.022);
      beam(`gable-king-${z}`,[0,eave-.045],[0,eave+rise-.02],z,.018);
      if(detailed) for(const side of [-1,1]) beam(`gable-web-${z}-${side}`,[0,eave-.04],[side*half*.53,eave+rise*.47],z,.016);
    }
  } else {
    // Robust perimeter piers and two clay-brick central piers, framing—not
    // blocking—the clear middle entrance. Semi-open front, enclosed rear wing.
    const post=.095;
    for(const side of [-1,1]) {
      for(const z of [front,front-(front-wallFront)*.48,wallFront]) {
        add(`open-column-${side}-${z}`,'opaque',[side*sideX,(eave+floor)/2,z],[post,eave-floor,post],P.dark);
      }
      add(`brick-pier-${side}`,'opaque',[side*width*.16,(eave+floor)/2,front],[.093,eave-floor,.12],P.brick);
      add(`low-wall-${side}`,'opaque',[side*sideX,floor+.09,(front+wallFront)/2],[.075,.18,front-wallFront],P.dark);
      add(`front-low-wall-${side}`,'opaque',[side*width*.325,floor+.09,front],[width*.19,.18,.075],P.dark);
      if(detailed) for(let j=1;j<11;j++) add(`brick-joint-${side}-${j}`,'opaque',[side*width*.16,floor+(eave-floor)*j/11,front+.061],[.093,.004,.003],P.mortar);
    }
    for(const z of [front,front-(front-wallFront)*.5,wallFront,rear]) {
      beam(`frame-tie-${z}`,[-sideX,eave-.07],[sideX,eave-.07],z,.027,P.dark);
      for(const side of [-1,1]) beam(`frame-rafter-${z}-${side}`,[side*half,eave-.022],[0,eave+rise-.022],z,.026,P.wood);
      beam(`frame-king-${z}`,[0,eave-.07],[0,eave+rise-.02],z,.024,P.wood);
    }
  }
  if(detailed) for(const side of [-1,1]) for(const t of [.32,.68]) {
    add(`purlin-${side}-${t}`,'metal',[side*half*t,eave+rise*(1-t)-.032,0],[.021,.024,roofDepth*.96],P.wood);
  }
  if(focused) for(const side of [-1,1]) for(let i=1;i<8;i++) {
    const t=i/8;
    add(`roof-seam-${side}-${i}`,'metal',[side*half*t,eave+rise*(1-t)+.016,0],[.008,.006,roofDepth], '#68685e');
  }
  return { boxes,width,depth,eave,rise,front,rear,wallFront,windowCount:windowBays*2,
    gables:test?[]:[{z:front+.015,halfSpan:half*.96,bottom:eave,rise:rise*.92,color:P.light},
      {z:rear,halfSpan:sideX,bottom:eave,rise:rise*.84,color:P.light}] };
}

/** Merge member buffers once, preserving real 3D openings and vertex colours.
 * Returned resources are owned by the component and explicitly disposed.
 */
export function buildRuralGeometry(recipe: RuralRecipe) {
  const groups: Record<RuralBatch, THREE.BufferGeometry[]> = { opaque:[],glass:[],metal:[] };
  const color = new THREE.Color();
  function paint(geometry: THREE.BufferGeometry, value: string) {
    color.set(value); const count=geometry.attributes.position.count;
    const colors=new Float32Array(count*3);
    for(let i=0;i<count;i++) color.toArray(colors,i*3);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    return geometry;
  }
  for(const item of recipe.boxes) {
    const g=new THREE.BoxGeometry(...item.scale);
    const m=new THREE.Matrix4().compose(new THREE.Vector3(...item.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(item.rotation??[0,0,0]))),new THREE.Vector3(1,1,1));
    g.applyMatrix4(m); groups[item.batch].push(paint(g,item.color));
  }
  for(const gable of recipe.gables) {
    const shape=new THREE.Shape();shape.moveTo(-gable.halfSpan,gable.bottom);shape.lineTo(gable.halfSpan,gable.bottom);shape.lineTo(0,gable.bottom+gable.rise);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.03,bevelEnabled:false,steps:1,curveSegments:1});g.translate(0,0,gable.z);
    // merge uses indexed boxes: convert all members to non-indexed consistently.
    groups.opaque.push(paint(g,gable.color));
  }
  const result={} as Record<RuralBatch,THREE.BufferGeometry>;
  for(const key of Object.keys(groups) as RuralBatch[]) {
    const inputs=groups[key].map(g=>g.index?g.toNonIndexed():g);
    result[key]=mergeBufferGeometries(inputs,false) ?? new THREE.BufferGeometry();
    result[key].computeBoundingBox(); result[key].computeBoundingSphere();
    new Set([...inputs,...groups[key]]).forEach(g=>g.dispose());
  }
  return result;
}
