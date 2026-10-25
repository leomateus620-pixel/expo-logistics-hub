import { memo, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SOY_HARVEST_LAYOUT } from '../../data/soyHarvestLayout';
import { parkingCorridorPolygon } from '../../utils/parkingGeometry';
import { soyFieldFrame, useSoyHarvestStore } from '../../harvest/useSoyHarvestStore';

const NO_RAYCAST = () => undefined;
const crop = SOY_HARVEST_LAYOUT.cropBounds;
const shaderDeclarations = `uniform vec3 soySown; uniform vec3 soyHarvested; uniform float soyGrowth; uniform float soyMaturity;
varying float vSoyVisible; varying float vSoyLeafHeight;
`;

/** Owned by this layer: four meshes/materials, three instanced plant organs and
 * one ground mesh. Nothing is fetched and no mesh is created per plant. The
 * geometry stays still at idle/completion; the layer never invalidates frames. */
function createSoyField(isolatedSupport: boolean) {
  const group = new THREE.Group(); group.name = 'exporural-soy-field';
  const uniforms = { soySown: { value: new THREE.Vector3(1, 1, 1) }, soyHarvested: { value: new THREE.Vector3() },
    soyGrowth: { value: 1 }, soyMaturity: { value: 0 } };
  const ownedGeometry: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];
  function plantMaterial(color: string, organ: 'leaf' | 'stem' | 'pod') {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .91, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shaderDeclarations + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 fieldPoint=instanceMatrix[3].xz;
        int lane=int(clamp(floor((fieldPoint.y+57.2)/1.8),0.0,2.0));
        float along=clamp((fieldPoint.x-43.0)/18.0,0.0,1.0);
        if(lane==1) along=1.0-along;
        vSoyVisible=step(along,soySown[lane])*(1.0-step(along,soyHarvested[lane]-.00001));
        float growth=clamp(soyGrowth,0.0,1.0);
        vSoyLeafHeight=position.y;
        ${organ === 'pod' ? 'vSoyVisible*=smoothstep(.65,.98,growth);' : ''}
        ${organ === 'leaf' ? 'vSoyVisible*=smoothstep(max(.0,(position.y-.035)/.18),min(1.0,(position.y+.015)/.18),growth);' : ''}
        transformed.y*=mix(.02,1.0,growth);
        transformed.xz*=mix(.12,1.0,smoothstep(.0,.8,growth));
        ${organ === 'leaf' ? 'transformed.xz*=1.0-soyMaturity*.35; vSoyVisible*=1.0-smoothstep(.45,1.0,soyMaturity)*step(.075,position.y)*.85;' : ''}
      `);
      shader.fragmentShader = shaderDeclarations + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if(vSoyVisible<.4) discard;
        vec3 ripe=vec3(.56,.39,.16);
        ${organ === 'leaf' ? 'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.65,.57,.17),smoothstep(.0,.52,soyMaturity)); diffuseColor.rgb=mix(diffuseColor.rgb,ripe,smoothstep(.5,1.0,soyMaturity));' : 'diffuseColor.rgb=mix(diffuseColor.rgb,ripe,soyMaturity);'}
      `);
    };
    material.customProgramCacheKey = () => `soy-field-organ-v3-${organ}`;
    ownedMaterials.push(material); return material;
  }
  const leaves: THREE.BufferGeometry[] = [], stems: THREE.BufferGeometry[] = [], pods: THREE.BufferGeometry[] = [];
  const yAxis = new THREE.Vector3(0, 1, 0);
  function branch(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
    const geometry = new THREE.CylinderGeometry(radius * .6, radius, from.distanceTo(to), 4);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(yAxis, to.clone().sub(from).normalize()));
    geometry.translate(...from.clone().add(to).multiplyScalar(.5).toArray()); stems.push(geometry);
  }
  branch(new THREE.Vector3(), new THREE.Vector3(.003, .145, 0), .003);
  for (let node = 0; node < 4; node++) {
    const angle = node * 2.4, y = .033 + node * .027;
    const base = new THREE.Vector3(0, y, 0), tip = new THREE.Vector3(Math.cos(angle) * .031, y + .013, Math.sin(angle) * .031);
    branch(base, tip, .0013);
    for (let leaf = 0; leaf < 3; leaf++) {
      const a = angle + (leaf - 1) * 1.1, length = leaf === 1 ? .065 : .055;
      const geometry = new THREE.BufferGeometry();
      // Broad oval pointed leaf with a folded midrib; not a sphere/grass blade.
      const outline=[[0,0],[-.020,length*.2],[-.028,length*.55],[0,length],[.028,length*.55],[.020,length*.2]];
      const triangles:number[]=[];
      for(let edge=0;edge<outline.length;edge++) {
        const p=outline[edge],q=outline[(edge+1)%outline.length];
        triangles.push(0,.006,length*.48,p[0],0,p[1],q[0],0,q[1]);
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
      geometry.computeVertexNormals(); geometry.rotateY(a); geometry.translate(tip.x,tip.y,tip.z); leaves.push(geometry);
    }
    for (let p = 0; p < 1; p++) {
      const geometry = new THREE.SphereGeometry(1, 5, 3);
      const vertices=geometry.getAttribute('position');
      for(let vertex=0;vertex<vertices.count;vertex++) {
        const lobe=1+.16*Math.cos(vertices.getY(vertex)*Math.PI*3);
        vertices.setX(vertex,vertices.getX(vertex)*lobe);vertices.setZ(vertex,vertices.getZ(vertex)*lobe);
      }
      geometry.scale(.0032,.014,.004); geometry.rotateZ((p ? 1 : -1) * .35);
      geometry.translate(tip.x*.55+(p-.5)*.008,y-.004,tip.z*.55); pods.push(geometry);
    }
  }
  const organGeometry = [leaves,stems,pods].map(parts => {
    const normalized=parts.map(p => p.index ? p.toNonIndexed() : p);
    const geometry = mergeGeometries(normalized);
    new Set([...parts,...normalized]).forEach(p => p.dispose()); ownedGeometry.push(geometry); return geometry;
  });
  // Distant row cover has 12 triangles per representative plant cluster. Close
  // views swap in trifoliate leaves, branches and pods; no extra draw calls.
  const distantParts:THREE.BufferGeometry[]=[];
  for(let i=0;i<6;i++) {
    const angle=i*Math.PI/3,r=.12;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([
      0,.065,0, -.052,.055,r*.5, 0,.07,r,
      0,.065,0, 0,.07,r, .052,.055,r*.5,
    ],3));g.rotateY(angle);g.computeVertexNormals();distantParts.push(g);
  }
  const distantGeometry=mergeGeometries(distantParts);distantParts.forEach(g=>g.dispose());ownedGeometry.push(distantGeometry);
  const columns = 100, rows = 45, count = columns * rows;
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const meshes = organGeometry.map((g,i) => {
    const mesh = new THREE.InstancedMesh(g, plantMaterial(['#3e7728','#57713b','#6a7440'][i], ['leaf','stem','pod'][i] as 'leaf'|'stem'|'pod'), count);
    mesh.raycast = NO_RAYCAST; mesh.frustumCulled = true; mesh.name=['soy-trifoliate-leaves','soy-branched-stems','soy-pods'][i];
    return mesh;
  });
  for(let row=0;row<rows;row++) for(let col=0;col<columns;col++) {
    const index=row*columns+col, seed=((index*1103515245+12345)>>>0)%997/997;
    position.set(crop.minX+(col+.5)/columns*(crop.maxX-crop.minX),SOY_HARVEST_LAYOUT.groundY,
      crop.minZ+(row+.5)/rows*(crop.maxZ-crop.minZ));
    quat.setFromAxisAngle(yAxis, seed * 6.28); scale.setScalar(.84+seed*.27); matrix.compose(position,quat,scale);
    meshes.forEach(mesh=>mesh.setMatrixAt(index,matrix));
  }
  meshes.forEach(mesh=> { mesh.instanceMatrix.needsUpdate=true; mesh.computeBoundingSphere(); group.add(mesh); });
  const groundParts:THREE.BufferGeometry[]=[];
  function groundPart(g:THREE.BufferGeometry,color:string) {
    const geometry=g.index?g.toNonIndexed():g;if(g.index)g.dispose();geometry.deleteAttribute('uv');
    const c=new THREE.Color(color),colors=new Float32Array(geometry.getAttribute('position').count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));groundParts.push(geometry);
  }
  const cropGeometry = new THREE.PlaneGeometry(crop.maxX-crop.minX,crop.maxZ-crop.minZ);
  cropGeometry.rotateX(-Math.PI/2);cropGeometry.translate(52,.022,-54.5);groundPart(cropGeometry,'#756446');
  function ribbon(points:readonly (readonly [number,number])[],width:number,color:string,y:number) {
    // One bounded corridor closes the wedges between independently drawn
    // segment rectangles, including the truck's full turning envelope.
    const ring=parkingCorridorPolygon(points,width);
    const shape=new THREE.Shape(ring.map(([x,z])=>new THREE.Vector2(x,-z)));
    const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,y,0);groundPart(g,color);
  }
  ribbon(SOY_HARVEST_LAYOUT.truckPath.slice(0,6),SOY_HARVEST_LAYOUT.truckLaneWidth,'#817052',.025);
  if(isolatedSupport) {
    const support=new THREE.PlaneGeometry(28,12);support.rotateX(-Math.PI/2);support.translate(52.5,.016,-54);
    groundPart(support,'#77815a');
    ribbon([[80.927,-43.9325],[85.2908,-53.168],[89.8671,-62.1238]],1.52,'#363934',.034);
  }
  const groundGeometry=mergeGeometries(groundParts);groundParts.forEach(g=>g.dispose());ownedGeometry.push(groundGeometry);
  const groundMaterial = new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,side:THREE.DoubleSide});
  groundMaterial.onBeforeCompile=shader=> {
    shader.vertexShader='varying vec2 vSoil;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSoil=position.xz;');
    shader.fragmentShader='varying vec2 vSoil;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float rows=.5+.5*sin(vSoil.y*104.72);
      float grain=fract(sin(dot(floor(vSoil*180.0),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=.85+rows*.14+grain*.16;`);
  };ownedMaterials.push(groundMaterial);
  const soil=new THREE.Mesh(groundGeometry,groundMaterial);soil.receiveShadow=true;soil.raycast=NO_RAYCAST;group.add(soil);
  let detailed=true;
  return {group, uniforms, updateLod:(camera:THREE.Camera)=> {
    const dx=Math.max(crop.minX-camera.position.x,0,camera.position.x-crop.maxX);
    const dz=Math.max(crop.minZ-camera.position.z,0,camera.position.z-crop.maxZ);
    const distance=Math.hypot(dx,camera.position.y,dz),next=distance<(detailed?8:6);
    if(next===detailed)return;detailed=next;meshes[0].geometry=next?organGeometry[0]:distantGeometry;
    meshes[1].visible=next;meshes[2].visible=next;
  }, dispose:()=> {meshes.forEach(m=>m.dispose());ownedGeometry.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());}};
}

export const SoyFieldStaticLayer = memo(function SoyFieldStaticLayer({isolatedSupport=false}:{isolatedSupport?:boolean}) {
  const invalidate=useThree(state=>state.invalidate);
  const field=useMemo(()=>createSoyField(isolatedSupport),[isolatedSupport]);
  useEffect(()=>()=>field.dispose(),[field]);
  useEffect(()=>useSoyHarvestStore.subscribe(()=>invalidate()),[invalidate]);
  useFrame(({camera})=> {
    field.updateLod(camera);
    const state=soyFieldFrame;
    if(state.mode==='green') {
      field.uniforms.soySown.value.set(1,1,1);field.uniforms.soyHarvested.value.set(0,0,0);
      field.uniforms.soyGrowth.value=1;field.uniforms.soyMaturity.value=0;
    } else if(state.mode==='harvested') {
      field.uniforms.soyHarvested.value.set(1,1,1);field.uniforms.soyMaturity.value=1;
    } else {
      field.uniforms.soySown.value.fromArray(state.sown);field.uniforms.soyHarvested.value.fromArray(state.harvested);
      field.uniforms.soyGrowth.value=state.growth;field.uniforms.soyMaturity.value=state.maturity;
    }
  });
  return <primitive object={field.group} dispose={null}/>;
});
