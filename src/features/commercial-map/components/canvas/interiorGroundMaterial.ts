import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { QUADRAS_AB_SPATIAL_REFERENCE } from '../../data/quadrasABEnvironment';
import { createInteriorGroundReferenceAtlas } from './interiorGroundReference';
import { groundNoiseForMaterial } from './groundNoiseTexture';
import { INTERNAL_GROUND_OWNERSHIP_RINGS } from '../../data/internalGroundCoverage';

type Scope = 'all' | 'internal-base' | 'access-grass';
type Atlas = ReturnType<typeof createInteriorGroundReferenceAtlas>;
let pool: { atlas: Atlas; users: number } | undefined;
const installed = new WeakSet<THREE.MeshStandardMaterial>();
// React Fast Refresh can retain a Three material after this module's WeakSet
// is replaced. Tag the installed hook itself to avoid injecting GLSL twice.
const HOOK_MARKER = Symbol.for('commercial-map.interior-ground-hook');
type GroundHook = THREE.MeshStandardMaterial['onBeforeCompile'] & { [HOOK_MARKER]?: true };
const materials = new Map<string, { material: THREE.MeshStandardMaterial; users: number }>();

function acquireAtlas(material: THREE.MeshStandardMaterial) {
  const current = pool ??= { atlas: createInteriorGroundReferenceAtlas(), users: 0 };
  current.users++;
  const release = () => {
    material.removeEventListener('dispose', release);
    installed.delete(material);
    if (--current.users === 0) {
      Object.values(current.atlas).forEach(texture => texture.dispose());
      if (pool === current) pool = undefined;
    }
  };
  material.addEventListener('dispose', release);
  return current.atlas;
}

const bounds = (ring: readonly (readonly [number, number])[]) => {
  const x = ring.map(p => p[0]), z = ring.map(p => p[1]);
  return new THREE.Vector4(Math.min(...x), Math.min(...z), Math.max(...x) - Math.min(...x), Math.max(...z) - Math.min(...z));
};
const quadraA = bounds(QUADRAS_AB_SPATIAL_REFERENCE.quadraA.polygon);
const quadraB = bounds(QUADRAS_AB_SPATIAL_REFERENCE.quadraB.polygon);

const number = (value: number) => value.toFixed(8);
const ownershipMask = INTERNAL_GROUND_OWNERSHIP_RINGS.map((ring, ringIndex) => {
  const feather = ringIndex === 0 || ringIndex === INTERNAL_GROUND_OWNERSHIP_RINGS.length - 1;
  const points = ring.slice(0, ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? -1 : undefined);
  const box = bounds(points);
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return `edgeDistance=min(edgeDistance,interiorSegmentDistance(p,vec2(${number(a[0])},${number(a[1])}),vec2(${number(b[0])},${number(b[1])})));`;
  }).join('\n');
  // Most of the shared plane is exterior: reject its fragments before testing
  // polygon edges or evaluating the inward parking transition.
  return `if (weight < 1. && p.x >= ${number(box.x)} && p.y >= ${number(box.y)} && p.x <= ${number(box.x + box.z)} && p.y <= ${number(box.y + box.w)}) {
    bool inside = false; ${points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    if (a[1] === b[1]) return '';
    return `if ((p.y > ${number(a[1])}) != (p.y > ${number(b[1])})) {
      if (p.x < ${number(a[0])} + (p.y - ${number(a[1])}) * ${number((b[0] - a[0]) / (b[1] - a[1]))}) inside = !inside;
    }`;
  }).join('\n')} if (inside) { ${feather ? `float edgeDistance=1.e6; ${edges}` : ''}
    weight = max(weight, ${feather ? 'smoothstep(0., 1.1, edgeDistance)' : '1.'}); } }`;
}).join('\n');

const sample = `
uniform sampler2D interiorAlbedo;
uniform sampler2D interiorNormal;
uniform sampler2D interiorRoughness;
uniform sampler2D interiorNoise;
uniform vec4 interiorQuadraA;
uniform vec4 interiorQuadraB;
varying vec3 vInteriorGround;
vec2 interiorMirror(vec2 uv) { return 1. - abs(mod(uv, 2.) - 1.); }
vec2 interiorAtlasUv(vec2 uv, float tile) {
  return vec2((clamp(uv.x * 256., .5, 255.5) + tile * 256.) / 512., clamp(uv.y * 256., .5, 255.5) / 256.);
}
vec4 interiorSample(sampler2D atlas, vec2 p) {
  vec2 a = interiorMirror((p - interiorQuadraA.xy) / interiorQuadraA.zw);
  vec2 b = (p - interiorQuadraB.xy) / interiorQuadraB.zw;
  vec2 outsideB = max(max(-b, b - 1.), 0.) * interiorQuadraB.zw;
  float blendB = 1. - smoothstep(0., 1., length(outsideB));
  vec4 referenceA = texture2D(atlas, interiorAtlasUv(a, 0.));
  if (blendB <= 0.) return referenceA;
  return mix(referenceA, texture2D(atlas, interiorAtlasUv(b, 1.)), blendB);
}
float interiorRandom(vec2 p) { return texture2D(interiorNoise, (p + .5) / 256.).r; }
float interiorSegmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab=b-a; return length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),1.e-8),0.,1.));
}
float interiorOwned(vec2 p) { float weight=0.; ${ownershipMask} return weight; }
`;

/** Same A/B texels, original pilot detail and physical world phase on every mesh.
 * A mixed owner only overrides explicitly owned fragments; upstream exterior,
 * soil and paving shaders remain byte-for-byte active everywhere else.
 */
export function applyInteriorGroundMaterial(material: THREE.MeshStandardMaterial, scope: Scope = 'all') {
  if (installed.has(material) || (material.onBeforeCompile as GroundHook)[HOOK_MARKER]) return material;
  const atlas = acquireAtlas(material);
  const noise = groundNoiseForMaterial(material);
  const upstream = material.onBeforeCompile;
  const upstreamKey = material.customProgramCacheKey();
  material.userData.interiorGround = { reference: 'quadras-ab-pilot', scope };
  material.onBeforeCompile = (shader, renderer) => {
    upstream.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      interiorAlbedo: { value: atlas.map }, interiorNormal: { value: atlas.normalMap },
      interiorRoughness: { value: atlas.roughnessMap }, interiorNoise: { value: noise },
      interiorQuadraA: { value: quadraA }, interiorQuadraB: { value: quadraB },
    });
    const attribute = scope === 'access-grass';
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vInteriorGround;\n${attribute ? 'attribute float interiorGrass; varying float vInteriorGrass;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvInteriorGround=(modelMatrix*vec4(position,1.)).xyz;\n${attribute ? 'vInteriorGrass=interiorGrass;' : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${sample}\n${attribute ? 'varying float vInteriorGrass;' : ''}`);
    const mask = scope === 'all' ? '1.' : attribute ? 'clamp(vInteriorGrass,0.,1.)' : 'interiorOwned(vInteriorGround.xz)';
    shader.fragmentShader = shader.fragmentShader.replace('#include <logdepthbuf_fragment>', `#include <logdepthbuf_fragment>
      float interiorWeight = ${mask};`);
    if (scope === 'internal-base') {
      // Fully internal fragments never need the old regional fBm, three map
      // samples and roughness variation that the reference would overwrite.
      // Keep the entire original path for the exterior and the inward feather.
      const start = shader.fragmentShader.indexOf('float interiorWeight =');
      const from = shader.fragmentShader.indexOf(';', start) + 1;
      const to = shader.fragmentShader.indexOf('#include <metalnessmap_fragment>', from);
      const legacy = shader.fragmentShader.slice(from, to)
        .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace('float roughnessFactor =', 'roughnessFactor ='));
      shader.fragmentShader = shader.fragmentShader.slice(0, from)
        + `\nfloat roughnessFactor = roughness;\nif (interiorWeight < 1.) {\n${legacy}\n}\n`
        + shader.fragmentShader.slice(to);
    }
    // This point follows every upstream albedo/roughness enhancer. No legacy
    // tint can multiply the reference a second time inside the owned region.
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      bool usesInteriorGround = interiorWeight > 0.;
      vec2 interiorP = vInteriorGround.xz;
      float interiorFootprint = length(fwidth(interiorP));
      float interiorBlade = 0.;
      if (usesInteriorGround) {
        vec3 priorColor=diffuseColor.rgb;
        float priorRoughness=roughnessFactor;
        float meadow=interiorRandom(interiorP*.66+vec2(interiorRandom(interiorP*.21)*2.));
        float clump=interiorRandom(interiorP*4.2+meadow*3.);
        interiorBlade=interiorRandom(interiorP*vec2(95.,31.)+clump*7.);
        diffuseColor.rgb=interiorSample(interiorAlbedo,interiorP).rgb;
        diffuseColor.rgb*=mix(vec3(.76,.82,.62),vec3(1.08,1.06,.88),meadow);
        diffuseColor.rgb*=.86+clump*.27;
        diffuseColor.rgb*=1.+(interiorBlade-.5)*.26*(1.-smoothstep(.018,.075,interiorFootprint));
        diffuseColor.rgb=mix(priorColor,diffuseColor.rgb,interiorWeight);
        roughnessFactor=mix(priorRoughness,.96*interiorSample(interiorRoughness,interiorP).g,interiorWeight);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      if (interiorWeight < 1.) {
        #include <normal_fragment_maps>
      }
      if (usesInteriorGround) {
        vec3 priorNormal=normal;
        vec3 detailNormal=interiorSample(interiorNormal,interiorP).xyz*2.-1.;
        detailNormal.xy*=.22;
        vec3 q0=dFdx(-vViewPosition), q1=dFdy(-vViewPosition);
        vec2 st0=dFdx(interiorP), st1=dFdy(interiorP);
        vec3 baseNormal=nonPerturbedNormal;
        vec3 q1perp=cross(q1,baseNormal), q0perp=cross(baseNormal,q0);
        vec3 tangent=q1perp*st0.x+q0perp*st1.x;
        vec3 bitangent=q1perp*st0.y+q0perp*st1.y;
        float scale=inversesqrt(max(max(dot(tangent,tangent),dot(bitangent,bitangent)),1.e-12));
        normal=normalize(mat3(tangent*scale,bitangent*scale,baseNormal)*detailNormal);
        normal=normalize(normal+vec3(dFdx(interiorBlade),dFdy(interiorBlade),0.)*.16*(1.-smoothstep(.018,.065,interiorFootprint)));
        normal=normalize(mix(priorNormal,normal,interiorWeight));
      }`);
  };
  material.customProgramCacheKey = () => `${upstreamKey}:park-interior-quadras-ab-v1:${scope}`;
  (material.onBeforeCompile as GroundHook)[HOOK_MARKER] = true;
  installed.add(material);
  material.needsUpdate = true;
  return material;
}

export function acquireInteriorGroundMaterial(parameters: { opacity?: number; polygonOffsetFactor?: number; polygonOffsetUnits?: number; depthWrite?: boolean; transparent?: boolean } = {}) {
  const opacity = parameters.opacity ?? 1;
  const factor = parameters.polygonOffsetFactor ?? 0;
  const units = parameters.polygonOffsetUnits ?? 0;
  const depthWrite = parameters.depthWrite ?? opacity >= .999;
  const transparent = parameters.transparent ?? opacity < .999;
  const key = JSON.stringify([opacity, factor, units, depthWrite, transparent]);
  let entry = materials.get(key);
  if (!entry) {
    const material = applyInteriorGroundMaterial(new THREE.MeshStandardMaterial({
      name: 'ParkInteriorGround:quadras-ab', color: '#ffffff', roughness: .96, metalness: 0,
      opacity, transparent, depthWrite,
      polygonOffset: factor !== 0 || units !== 0, polygonOffsetFactor: factor, polygonOffsetUnits: units,
    }));
    material.userData.presentationOnly = true;
    entry = { material, users: 0 }; materials.set(key, entry);
  }
  entry.users++;
  return entry.material;
}
export function releaseInteriorGroundMaterial(material: THREE.MeshStandardMaterial) {
  for (const [key, entry] of materials) if (entry.material === material) {
    if (--entry.users === 0) { materials.delete(key); material.dispose(); }
    return;
  }
}
export function useInteriorGroundMaterial(opacity = 1, polygonOffsetFactor = 0, polygonOffsetUnits = 0, depthWrite = opacity >= .999, transparent = opacity < .999) {
  const material = useMemo(() => acquireInteriorGroundMaterial({opacity,polygonOffsetFactor,polygonOffsetUnits,depthWrite,transparent}), [opacity,polygonOffsetFactor,polygonOffsetUnits,depthWrite,transparent]);
  useEffect(() => () => releaseInteriorGroundMaterial(material), [material]);
  return material;
}
