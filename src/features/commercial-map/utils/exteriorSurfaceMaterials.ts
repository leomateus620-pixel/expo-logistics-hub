import * as THREE from "three";
import type { TerritoryPatch } from "../data/territorialEnvironment";

const noise = `
float exteriorHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float exteriorNoise(vec2 p) {
 vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(exteriorHash(i),exteriorHash(i+vec2(1,0)),f.x),
 mix(exteriorHash(i+vec2(0,1)),exteriorHash(i+vec2(1)),f.x),f.y);
}`;

/** Surface mixing only; it never displaces a road, patch boundary or foundation. */
export function createExteriorGroundMaterial(instanced = false) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: !instanced,
    roughness: 0.98,
  });
  material.name = `ExteriorGround:${instanced ? "yards" : "patches"}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec2 vExteriorGround; varying vec3 vLandUse;
      ${instanced ? "" : "attribute vec3 landUse;"}\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec4 groundPoint=vec4(position,1.0);
      ${instanced ? "groundPoint=instanceMatrix*groundPoint; vLandUse=vec3(3.0,3.0,0.0);" : "vLandUse=landUse;"}
      vExteriorGround=(modelMatrix*groundPoint).xz;`,
    );
    shader.fragmentShader =
      `varying vec2 vExteriorGround; varying vec3 vLandUse;\n${noise}\n` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 p=vExteriorGround;
      float broad=exteriorNoise(p*.11+exteriorNoise(p*.035)*3.0);
      float middle=exteriorNoise(p*.79);
      float filterDetail=1.0-smoothstep(.10,.7,length(fwidth(p)));
      float fine=exteriorNoise(p*5.0)*filterDetail;
      float natural= smoothstep(.25,.76,broad*.72+middle*.28);
      vec3 soil=vec3(.27,.235,.16), dryGrass=vec3(.34,.37,.21), grass=vec3(.24,.32,.18);
      vec3 surface=diffuseColor.rgb;
      if(vLandUse.x<1.5){
        float rowAxis=dot(p,vec2(cos(vLandUse.z),sin(vLandUse.z)));
        float rowFilter=1.0-smoothstep(.1,.7,fwidth(rowAxis));
        float rows=.5+.5*sin(rowAxis*13.0+exteriorNoise(p*.04)*.6);
        surface=mix(surface*.83,surface*1.16,natural);
        surface=mix(surface,soil,.14+rows*.14*rowFilter);
      } else if(vLandUse.x<2.5){
        surface=mix(surface*.83,surface*1.15,broad);
        surface=mix(surface,soil,middle*.14);
      } else {
        surface=mix(dryGrass,grass,natural);
        surface=mix(surface,soil,smoothstep(.72,.86,middle)*.32);
      }
      surface *= .96 + middle*.075 + (fine-.5*filterDetail)*.06;
      float edge=smoothstep(.0,1.6,vLandUse.y);
      diffuseColor.rgb=mix(mix(dryGrass,grass,broad)*1.1,surface,edge);
    `,
    );
  };
  material.customProgramCacheKey = () => `exterior-ground-v2-${instanced}`;
  return material;
}

export function distanceToPatchEdge(
  x: number,
  z: number,
  patch: TerritoryPatch,
) {
  let distance = Infinity;
  for (let i = 0; i < patch.ring.length; i++) {
    const a = patch.ring[i],
      b = patch.ring[(i + 1) % patch.ring.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(
      ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz),
      0,
      1,
    );
    distance = Math.min(
      distance,
      Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz),
    );
  }
  return distance;
}

/** Refine triangulation solely for smooth land-use/border interpolation; planar Y is unchanged. */
export function finishExteriorPatch(
  source: THREE.BufferGeometry,
  patch: TerritoryPatch,
) {
  const original = source.index ? source.toNonIndexed() : source;
  const positions = original.getAttribute("position");
  const vertices: number[] = [];
  const split = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    depth = 0,
  ) => {
    const abLength = a.distanceTo(b),
      bcLength = b.distanceTo(c),
      caLength = c.distanceTo(a);
    const planar = Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) < 0.001;
    if (depth < 14 && planar && Math.max(abLength, bcLength, caLength) > 4.5) {
      if (abLength >= bcLength && abLength >= caLength) {
        const m = a.clone().add(b).multiplyScalar(0.5);
        split(a, m, c, depth + 1);
        split(m, b, c, depth + 1);
      } else if (bcLength >= caLength) {
        const m = b.clone().add(c).multiplyScalar(0.5);
        split(a, b, m, depth + 1);
        split(a, m, c, depth + 1);
      } else {
        const m = c.clone().add(a).multiplyScalar(0.5);
        split(a, b, m, depth + 1);
        split(m, b, c, depth + 1);
      }
    } else vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  };
  for (let i = 0; i < positions.count; i += 3)
    split(
      new THREE.Vector3().fromBufferAttribute(positions, i),
      new THREE.Vector3().fromBufferAttribute(positions, i + 1),
      new THREE.Vector3().fromBufferAttribute(positions, i + 2),
    );
  if (original !== source) original.dispose();
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  const values: number[] = [],
    colors: number[] = [],
    color = new THREE.Color(patch.color);
  const isPasture =
    patch.id.includes("pasture") || patch.id.includes("open-parcels");
  const use =
    patch.kind === "field" && !isPasture ? 1 : patch.kind === "soil" ? 2 : 3;
  const a = patch.ring[0],
    b = patch.ring[1],
    angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let i = 0; i < vertices.length; i += 3) {
    values.push(
      use,
      distanceToPatchEdge(vertices[i], vertices[i + 2], patch),
      angle,
    );
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("landUse", new THREE.Float32BufferAttribute(values, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Uses the scene's existing sky environment and dielectric Fresnel; zero reflection render passes. */
export function createExteriorWaterMaterial(ponds: readonly TerritoryPatch[]) {
  const material = new THREE.MeshPhysicalMaterial({
    color: "#4d6559",
    roughness: 0.34,
    metalness: 0,
    envMapIntensity: 0.48,
    ior: 1.333,
    specularIntensity: 0.35,
  });
  material.name = "ExteriorPondsSharedEnvironmentReflection";
  const time = { value: 0 };
  const segments = ponds.flatMap((p) =>
    p.ring.map((a, i) => [a, p.ring[(i + 1) % p.ring.length]]),
  );
  const edges = segments
    .map(
      ([a, b]) =>
        `edge=min(edge,pondEdge(p,vec2(${a[0].toFixed(4)},${a[1].toFixed(4)}),vec2(${b[0].toFixed(4)},${b[1].toFixed(4)})));`,
    )
    .join("\n");
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPondTime = time;
    shader.vertexShader = "varying vec3 vPondWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvPondWorld=(modelMatrix*vec4(position,1.0)).xyz;",
    );
    shader.fragmentShader =
      `uniform float uPondTime; varying vec3 vPondWorld;
      float pondEdge(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));}\n` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 p=vPondWorld.xz; float edge=1000.0; ${edges}
      diffuseColor.rgb=mix(vec3(.13,.16,.09),diffuseColor.rgb,smoothstep(.0,.85,edge));
      diffuseColor.rgb *= .96 + .04*sin(p.x*.39)*sin(p.y*.31);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      `#include <normal_fragment_begin>
      float waveX=sin(vPondWorld.x*5.2+vPondWorld.z*2.1+uPondTime*.42);
      float waveZ=cos(vPondWorld.z*7.1-vPondWorld.x*1.7+uPondTime*.31);
      float waveFilter=1.0-smoothstep(.1,.65,length(fwidth(vPondWorld.xz)));
      normal=normalize(normal+mat3(viewMatrix)*vec3(waveX*.008*waveFilter,0.0,waveZ*.006*waveFilter));
    `,
    );
  };
  material.customProgramCacheKey = () => "exterior-ponds-v1";
  return { material, time };
}
