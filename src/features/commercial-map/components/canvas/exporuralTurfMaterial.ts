import type * as THREE from 'three';

type TurfMaterial = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
const installations = new WeakMap<TurfMaterial, { detail: THREE.IUniform<number> }>();

/** World-space, derivative-filtered turf. The vertex mask is updated with status,
 * so blocked/legacy surfaces and every internal module retain their material.
 * Both public Basic and private Standard compose with existing shader hooks. */
export function applyExporuralTurfMaterial(material: TurfMaterial, reduced = false,
  { reuseExistingSurfaceDetail = false }: { reuseExistingSurfaceDetail?: boolean } = {}) {
  const installed = installations.get(material);
  if (installed) { installed.detail.value = reduced ? 0 : 1; return; }
  const detail = { value: reduced ? 0 : 1 };
  const upstream = material.onBeforeCompile;
  const upstreamKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    upstream.call(material, shader, renderer);
    shader.uniforms.uExternalTurfDetail = detail;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
      attribute float exporuralTurf;
      varying float vExporuralTurf;
      varying vec3 vExporuralPosition;`)
      .replace('#include <project_vertex>', `
      vExporuralTurf=exporuralTurf*step(.8,abs(normal.y));
      vec4 exporuralPosition=vec4(transformed,1.);
      #ifdef USE_BATCHING
        exporuralPosition=batchingMatrix*exporuralPosition;
      #endif
      vExporuralPosition=(modelMatrix*exporuralPosition).xyz;
      #include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
      uniform float uExternalTurfDetail;
      varying float vExporuralTurf;
      varying vec3 vExporuralPosition;
      float ruralLegacyGrain(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      ${reuseExistingSurfaceDetail ? '' : `
      float ruralGrain(vec2 p) {
        vec3 q=fract(vec3(p.xyx)*.1031);
        q+=dot(q,q.yzx+33.33);
        return fract((q.x+q.y)*q.z);
      }
      float ruralNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(ruralGrain(i),ruralGrain(i+vec2(1.,0.)),f.x),
          mix(ruralGrain(i+vec2(0.,1.)),ruralGrain(i+vec2(1.,1.)),f.x),f.y);
      }`}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      // Mode 2 preserves the pre-existing rural treatment for blocked/legacy lots.
      if(vExporuralTurf>1.5) {
        vec2 p=vExporuralPosition.xz;
        float blade=ruralLegacyGrain(floor(p*vec2(190.,75.)));
        float fade=1.-smoothstep(.015,.09,length(fwidth(p)));
        float mowing=sin(p.x*2.1+p.y*.45)*.016;
        diffuseColor.rgb*=1.+mowing+(blade-.5)*.16*fade;
      }${reuseExistingSurfaceDetail ? '' : ` else if(vExporuralTurf>.5 && uExternalTurfDetail>.5) {
        vec2 p=vExporuralPosition.xz;
        float fade=1.-smoothstep(.015,.09,length(fwidth(p)));
        float macro=(ruralNoise(p*2.7)-.5)*.065;
        float micro=(ruralNoise(p*64.)-.5)*.075*fade;
        diffuseColor.rgb*=1.+macro+micro;
      }`}`);
  };
  material.customProgramCacheKey = () => `${upstreamKey}|external-turf-r170-v4:${reuseExistingSurfaceDetail ? 'surface' : 'procedural'}`;
  material.needsUpdate = true;
  installations.set(material, { detail });
}
