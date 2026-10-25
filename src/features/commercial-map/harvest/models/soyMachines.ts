import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Original procedural illustrations authored for this project. Reference shapes:
 * Deere X9 1000 / M4030 / 6M official galleries (consulted 25 Oct 2026).
 * Dimensions are modelling estimates in metres, not engineering specifications.
 * +Z forward, +Y up; root scale .15 matches the park. One fleet owns every
 * geometry/material/texture. No downloads, global caches or independent clock.
 */
export interface SoyMachine { group: THREE.Group; wheels: THREE.Group[] }
export interface SoyMachineFleet {
  tractor: SoyMachine & { planterPivot: THREE.Group };
  sprayer: SoyMachine & { nozzles: THREE.Object3D[] };
  combine: SoyMachine & { reel: THREE.Group; augerPivot: THREE.Group; augerOutlet: THREE.Object3D; load: THREE.Mesh };
  truck: SoyMachine & { load: THREE.Mesh; bedCenter: THREE.Object3D };
  dispose: () => void;
}
const NO_RAYCAST = () => undefined;
export function createSoyMachineFleet(): SoyMachineFleet {
  const geometries = new Set<THREE.BufferGeometry>(), textures: THREE.Texture[] = [];
  const mat = {
    green: new THREE.MeshStandardMaterial({color:'#28752a',roughness:.38,metalness:.25}),
    yellow: new THREE.MeshStandardMaterial({color:'#f2c42d',roughness:.38,metalness:.26}),
    dark: new THREE.MeshStandardMaterial({color:'#222922',roughness:.72,metalness:.2}),
    rubber: new THREE.MeshStandardMaterial({color:'#16191b',roughness:.96}),
    glass: new THREE.MeshStandardMaterial({color:'#244652',roughness:.16,metalness:.52}),
    steel: new THREE.MeshStandardMaterial({color:'#7b8585',roughness:.5,metalness:.76}),
    white: new THREE.MeshStandardMaterial({color:'#d4d8cb',roughness:.4,metalness:.2}),
    grain: new THREE.MeshStandardMaterial({color:'#b49a54',roughness:1}),
    light: new THREE.MeshStandardMaterial({color:'#fff0c0',roughness:.25,emissive:'#b7a66c',emissiveIntensity:.18}),
  };
  type MaterialKey=keyof typeof mat;
  function batch(parent: THREE.Group) {
    const parts=new Map<MaterialKey,THREE.BufferGeometry[]>();
    const add=(key:MaterialKey,g:THREE.BufferGeometry,position:readonly number[],rotation?:readonly number[])=> {
      if(rotation) g.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]);
      g.translate(position[0],position[1],position[2]);
      const normalized=g.index?g.toNonIndexed():g;
      if(g.index)g.dispose();
      // Common attributes permit one merged mesh per finish.
      normalized.deleteAttribute('uv');
      if(!parts.has(key))parts.set(key,[]);parts.get(key)!.push(normalized);
    };
    const box=(key:MaterialKey,p:readonly number[],s:readonly number[],rot?:readonly number[])=>add(key,new THREE.BoxGeometry(s[0],s[1],s[2]),p,rot);
    const cylinder=(key:MaterialKey,p:readonly number[],r:number,h:number,rotation?:readonly number[],rTop=r)=>add(key,new THREE.CylinderGeometry(rTop,r,h,12),p,rotation);
    const bar=(key:MaterialKey,a:readonly number[],b:readonly number[],r=.035)=> {
      const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),d=to.clone().sub(from);
      const g=new THREE.CylinderGeometry(r,r,d.length(),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
      add(key,g,from.add(to).multiplyScalar(.5).toArray());
    };
    const hull=(key:MaterialKey,p:readonly number[],width:number,height:number,length:number)=> {
      const shape=new THREE.Shape();shape.moveTo(-width*.5,-height*.32);shape.lineTo(-width*.4,height*.38);
      shape.quadraticCurveTo(0,height*.58,width*.4,height*.38);shape.lineTo(width*.5,-height*.32);shape.closePath();
      const g=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:true,bevelSize:.08,bevelThickness:.08,bevelSegments:2,steps:1});
      add(key,g,[p[0],p[1],p[2]-length*.5]);
    };
    const finish=()=>parts.forEach((gs,key)=> {const g=mergeGeometries(gs);gs.forEach(part=>part.dispose());geometries.add(g);
      const mesh=new THREE.Mesh(g,mat[key]);mesh.name=`machine-${key}`;mesh.raycast=NO_RAYCAST;mesh.castShadow=key==='green'||key==='rubber'||key==='white';mesh.receiveShadow=true;parent.add(mesh);});
    return {add,box,cylinder,bar,hull,finish};
  }
  function root(name:string) {const group=new THREE.Group();group.name=name;group.scale.setScalar(.15);return group;}
  function wheel(parent:THREE.Group,x:number,z:number,r:number,width:number,rim:MaterialKey='yellow',y=r) {
    const group=new THREE.Group();group.position.set(x,y,z);group.userData.radius=r;parent.add(group);
    const b=batch(group);b.cylinder('rubber',[0,0,0],r,width,[0,0,Math.PI/2]);
    for(const side of [-1,1]) {b.cylinder(rim,[side*(width/2+.014),0,0],r*.57,.04,[0,0,Math.PI/2]);
      b.cylinder('steel',[side*(width/2+.04),0,0],r*.18,.06,[0,0,Math.PI/2]);}
    for(let i=0;i<22;i++) {const a=i/22*Math.PI*2;
      for(const side of [-1,1]) b.box('rubber',[side*width*.23,Math.cos(a)*(r+.012),Math.sin(a)*(r+.012)],[width*.52,.07,r*.23],[a,side*.38,0]);}
    b.finish();return group;
  }
  function cab(b:ReturnType<typeof batch>,position:readonly number[],width=2.4,height=1.65,length=1.9) {
    const [x,y,z]=position;
    b.hull('glass',[x,y,z],width,height,length);
    b.box('green',[x,y-height*.47,z],[width*.96,.28,length]);b.box('green',[x,y+height*.43,z],[width+ .12,.16,length+.12]);
    for(const side of [-1,1]) for(const front of [-1,1]) b.bar('dark',[x+side*width*.43,y-height*.4,z+front*length*.49],[x+side*width*.38,y+height*.42,z+front*length*.49],.045);
    b.bar('dark',[x-.6,y-.2,z+length*.54],[x+.4,y+.15,z+length*.54],.018);
    b.box('dark',[x,y-.36,z-.2],[.75,.6,.6]);
    for(const side of [-1,1]) {b.bar('dark',[x+side*width*.45,y+.3,z+.4],[x+side*(width*.5+.25),y+.3,z+.5],.025);
      b.box('dark',[x+side*(width*.5+.25),y+.26,z+.5],[.12,.27,.16]);
      b.box('light',[x+side*width*.36,y+height*.45,z+length*.51],[.24,.095,.06]);}
  }
  function steps(b:ReturnType<typeof batch>,x:number,y:number,z:number,count=5) {
    for(let i=0;i<count;i++) b.box('steel',[x,y+i*.24,z-i*.12],[.5,.07,.28]);
    for(const side of [-1,1]) b.bar('yellow',[x+side*.3,y,z],[x+side*.3,y+count*.24+.5,z-count*.12],.025);
  }
  const tractorGroup=root('soy-tractor-planter'),tractorWheels:THREE.Group[]=[];
  {const b=batch(tractorGroup); b.box('dark',[0,.88,0],[1.55,.35,3.9]);
    b.hull('green',[0,1.47,1.2],1.6,1.05,2.6);b.box('dark',[0,1.35,2.52],[1.3,.65,.06]);
    for(let i=0;i<7;i++)b.box('steel',[-.58+i*.19,1.35,2.56],[.018,.54,.025]);
    cab(b,[0,2.1,-.55],1.85,1.75,1.65);b.cylinder('dark',[.65,2.5,.65],.075,1.7);b.cylinder('steel',[.65,3.38,.65],.09,.12);
    b.box('yellow',[0,1.77,1.2],[1.64,.09,2.4]);steps(b,-1.08,.38,-.3,4);
    for(const side of [-1,1]) {b.box('green',[side*1.05,1.82,-1],[.65,.12,1.9]);b.box('light',[side*.6,1.5,2.57],[.24,.16,.08]);}
    b.bar('dark',[-1.1,.8,1.6],[1.1,.8,1.6],.09);b.finish();
    for(const side of [-1,1]){tractorWheels.push(wheel(tractorGroup,side*1.05,-1.15,.98,.57),wheel(tractorGroup,side*.92,1.5,.65,.4));}}
  const planterPivot=new THREE.Group();planterPivot.position.set(0,.25,-2.1);tractorGroup.add(planterPivot);
  {const b=batch(planterPivot);b.bar('green',[0,0,0],[0,0,-2.0],.13);b.box('green',[0,.05,-2],[11.7,.25,.32]);
    for(let i=0;i<16;i++){const x=-5.4+i*.72;b.box('white',[x,.52,-2],[.53,.7,.56]);b.box('green',[x,.92,-2],[.58,.09,.6]);
      b.bar('dark',[x,0,-2],[x,-.16,-2.7],.04);b.cylinder('dark',[x,-.12,-2.4],.21,.07,[0,0,Math.PI/2]);
      b.cylinder('rubber',[x,-.04,-2.8],.26,.17,[0,0,Math.PI/2]);}
    b.finish();for(const side of [-1,1])tractorWheels.push(wheel(planterPivot,side*4.3,-2.05,.5,.3,'yellow',.25));}

  const sprayerGroup=root('soy-high-clearance-sprayer'),sprayerWheels:THREE.Group[]=[],nozzles:THREE.Object3D[]=[];
  {const b=batch(sprayerGroup);b.box('dark',[0,2.05,0],[1.6,.34,4.7]);b.hull('green',[0,2.58,1.5],1.9,.9,1.9);
    b.cylinder('white',[0,2.8,-.85],1,2.2,[Math.PI/2,0,0]);b.box('green',[0,2.2,-.9],[2,.15,2.7]);cab(b,[0,3.15,1.45],2.1,1.5,1.5);
    for(const side of [-1,1]) for(const z of [-1.65,1.65]) {b.bar('green',[side*.65,2,z],[side*1.35,.9,z],.14);sprayerWheels.push(wheel(sprayerGroup,side*1.4,z,.86,.28));}
    for(const side of [-1,1]) {b.bar('steel',[side*.6,2.3,-1.8],[side*15,1.42,-1.8],.045);b.bar('green',[side*.6,1.5,-1.8],[side*15,1.42,-1.8],.052);
      for(let i=1;i<15;i++) {b.bar('steel',[side*i,1.5,-1.8],[side*(i+1),2.3-i*.055,-1.8],.022);
        b.cylinder('dark',[side*i,1.42,-1.8],.035,.1);const n=new THREE.Object3D();n.position.set(side*i,1.35,-1.8);sprayerGroup.add(n);nozzles.push(n);}}
    steps(b,-1.1,.25,.1,8);b.finish();}

  const combineGroup=root('soy-john-deere-x9'),combineWheels:THREE.Group[]=[];
  const reel=new THREE.Group(),augerPivot=new THREE.Group(),augerOutlet=new THREE.Object3D();
  {const b=batch(combineGroup);b.box('dark',[0,1.2,-.5],[2.6,.55,6]);b.hull('green',[0,2.5,-1.2],3.5,2.4,4.65);
    b.hull('green',[0,3.7,-1],3.55,.8,3.6);b.box('dark',[0,3.99,-1],[2.8,.07,3]);
    for(const side of [-1,1]){b.box('green',[side*1.48,4.3,-1],[.07,.68,3],[0,0,side*-.4]);
      b.box('yellow',[side*1.8,2.72,-1.1],[.035,.17,4.2]);
      for(let i=0;i<13;i++)b.box('dark',[side*1.76,2.08,-2.7+i*.13],[.045,.55,.045]);}
    cab(b,[0,2.95,2.05],2.8,1.9,2.05);b.box('green',[0,1.5,2.9],[1.4,.65,1.6],[.16,0,0]);
    b.box('dark',[0,.61,4.23],[11.95,.18,1.22]);b.box('green',[0,.9,3.78],[11.95,.7,.25]);
    // Soybean draper table with continuous cutterbar, not corn snouts.
    for(const side of [-1,1])b.hull('green',[side*5.83,.65,4.35],.34,.5,2.0);
    b.box('steel',[0,.5,4.88],[11.7,.045,.12]);for(let i=0;i<80;i++)b.box('steel',[-5.7+i*.144,.51,4.99],[.05,.025,.17],[0,.15,0]);
    b.cylinder('green',[0,.92,3.98],.28,10.9,[0,0,Math.PI/2]);
    for(let i=0;i<30;i++)b.box('dark',[-5.3+i*.36,.66,4.3],[.018,.03,.75]);
    for(const side of [-1,1]){b.bar('green',[side*4.5,1.02,3.65],[side*4.5,1.43,4.55],.06);b.bar('yellow',[side*1.65,2.08,1],[side*1.65,2.85,1],.03);}
    steps(b,-1.83,.3,1.5,8);b.cylinder('dark',[1.25,3.7,-2.5],.13,1.05);b.finish();
    for(const side of [-1,1])combineWheels.push(wheel(combineGroup,side*1.47,.8,1.2,.72),wheel(combineGroup,side*1.3,-2.5,.82,.48));
    reel.position.set(0,1.35,4.62);combineGroup.add(reel);const r=batch(reel);r.cylinder('dark',[0,0,0],.09,11.5,[0,0,Math.PI/2]);
    for(let spoke=0;spoke<6;spoke++){const a=spoke/6*Math.PI*2,y=Math.cos(a)*.49,z=Math.sin(a)*.49;
      r.bar('dark',[-5.55,y,z],[5.55,y,z],.035);for(const x of [-5.5,-2.7,0,2.7,5.5])r.bar('dark',[x,0,0],[x,y,z],.026);
      for(let i=0;i<38;i++)r.bar('steel',[-5.4+i*.29,y,z],[-5.4+i*.29,y-.15,z+.04],.009);}
    r.finish();
    // Hinge yaw 0 = stowed toward rear; +PI/2 = deployed to machine left.
    augerPivot.position.set(-1.58,3.72,-1.1);combineGroup.add(augerPivot);const a=batch(augerPivot);
    a.cylinder('green',[0,0,-3.22],.18,6.44,[Math.PI/2,0,0]);a.cylinder('dark',[0,-.13,-6.45],.2,.5,[0,0,0]);
    a.bar('steel',[0,.15,-.2],[0,.4,-3],.025);a.finish();augerOutlet.position.set(0,-.38,-6.45);augerPivot.add(augerOutlet);
  }
  // Original typography only; no downloaded logo/image. Markings match the
  // referenced manufacturer/model and do not assert an official licensed asset.
  if(typeof document!=='undefined') {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');
    if(ctx){ctx.fillStyle='#28752a';ctx.fillRect(0,0,512,96);ctx.fillStyle='#f2c42d';ctx.font='bold 48px Arial';ctx.fillText('JOHN DEERE',14,61);ctx.font='bold 26px Arial';ctx.fillText('X9',448,62);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);
      const material=new THREE.MeshStandardMaterial({map:texture,roughness:.5});Object.assign(mat,{decal:material});
      for(const side of [-1,1]){const g=new THREE.PlaneGeometry(2.85,.54);geometries.add(g);const label=new THREE.Mesh(g,material);label.position.set(side*1.82,3.03,-.7);label.rotation.y=side*Math.PI/2;label.raycast=NO_RAYCAST;combineGroup.add(label);}}
  }

  const truckGroup=root('soy-grain-truck'),truckWheels:THREE.Group[]=[];
  {const b=batch(truckGroup);b.box('dark',[0,.69,-.35],[1.9,.3,8.2]);
    b.hull('white',[0,1.8,2.65],2.45,2.2,2.1);b.box('glass',[0,2.3,3.74],[2.05,.75,.025],[.1,0,0]);
    for(const side of [-1,1]){b.box('glass',[side*1.23,2.3,2.85],[.025,.7,1.3]);b.bar('dark',[side*1.2,2.3,3.4],[side*1.5,2.3,3.4],.03);b.box('dark',[side*1.5,2.2,3.4],[.14,.4,.17]);}
    b.box('dark',[0,1.2,3.76],[1.65,.5,.05]);for(let i=0;i<5;i++)b.box('steel',[0,1.05+i*.09,3.81],[1.55,.025,.04]);
    b.box('steel',[0,.82,3.83],[2.35,.2,.14]);for(const side of [-1,1])b.box('light',[side*.94,1.04,3.83],[.29,.2,.06]);
    b.box('steel',[0,1.08,-1.45],[2.55,.16,5.7]);
    for(const side of [-1,1]){b.box('white',[side*1.27,1.85,-1.45],[.09,1.55,5.7]);for(let i=0;i<9;i++)b.box('steel',[side*1.33,1.85,-4.15+i*.65],[.055,1.55,.045]);}
    for(const z of [-4.3,1.4])b.box('white',[0,1.85,z],[2.6,1.55,.1]);
    for(const side of [-1,1]) b.box('dark',[side*1.3,2.65,-1.45],[.1,.08,5.85]);
    for(const z of [-4.3,1.4]) b.box('dark',[0,2.65,z],[2.6,.08,.1]);
    // Open top rim only: the volume and interior remain visible.
    b.finish();
    for(const side of [-1,1])for(const z of [2.55,-2.1,-3.35])truckWheels.push(wheel(truckGroup,side*1.12,z,.55,.29,'steel'));
  }
  // Grain volume inside the box; y scale/position controlled by the timeline.
  const loadGeometry=new THREE.BoxGeometry(2.36,1,5.48,8,1,14);geometries.add(loadGeometry);
  const pos=loadGeometry.getAttribute('position');for(let i=0;i<pos.count;i++){if(pos.getY(i)>0)pos.setY(i,.5+Math.sin(pos.getX(i)*1.4)*.035+Math.cos(pos.getZ(i)*1.3)*.04);}loadGeometry.computeVertexNormals();
  const load=new THREE.Mesh(loadGeometry,mat.grain);load.name='truck-grain-load';load.position.set(0,1.18,-1.45);load.scale.y=.05;load.raycast=NO_RAYCAST;truckGroup.add(load);
  const bedCenter=new THREE.Object3D();bedCenter.position.set(0,2.2,-1.45);truckGroup.add(bedCenter);
  const hopperGeometry=new THREE.BoxGeometry(2.7,1,2.8,6,1,6);geometries.add(hopperGeometry);
  const hopperLoad=new THREE.Mesh(hopperGeometry,mat.grain);hopperLoad.name='combine-grain-load';
  hopperLoad.position.set(0,4.0425,-1);hopperLoad.scale.y=.025;hopperLoad.raycast=NO_RAYCAST;combineGroup.add(hopperLoad);
  // Runtime and tests inspect the interior to place the stream safely.
  truckGroup.userData.bedInterior={minX:-1.18,maxX:1.18,minZ:-4.19,maxZ:1.29,floorY:1.16,topY:2.6};
  return {tractor:{group:tractorGroup,wheels:tractorWheels,planterPivot},sprayer:{group:sprayerGroup,wheels:sprayerWheels,nozzles},
    combine:{group:combineGroup,wheels:combineWheels,reel,augerPivot,augerOutlet,load:hopperLoad},truck:{group:truckGroup,wheels:truckWheels,load,bedCenter},
    dispose:()=>{geometries.forEach(g=>g.dispose());Object.values(mat).forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
