import * as THREE from 'three';
import { EXTERNAL_LOT_PALETTE } from '../../utils/externalLotPresentation';

type TurfMaterial = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
const installations = new WeakMap<TurfMaterial, { detail: THREE.IUniform<number>; pixelRatio: THREE.IUniform<number> }>();

/** World-space, derivative-filtered turf. The vertex mask is updated with status,
 * so blocked/legacy surfaces and every internal module retain their material.
 * Both public Basic and private Standard compose with existing shader hooks. */
export function applyExporuralTurfMaterial(material: TurfMaterial, reduced = false,
  { reuseExistingSurfaceDetail = false, pixelRatio = 1 }: { reuseExistingSurfaceDetail?: boolean; pixelRatio?: number } = {}) {
  const installed = installations.get(material);
  if (installed) { installed.detail.value = reduced ? 0 : 1; installed.pixelRatio.value = pixelRatio; return; }
  const detail = { value: reduced ? 0 : 1 };
  const statusPixelRatio = { value: pixelRatio };
  const upstream = material.onBeforeCompile;
  const upstreamKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    upstream.call(material, shader, renderer);
    shader.uniforms.uExternalTurfDetail = detail;
    shader.uniforms.uExternalStatusPixelRatio = statusPixelRatio;
    shader.uniforms.uExternalStatusOpen = { value: new THREE.Color(EXTERNAL_LOT_PALETTE.open) };
    shader.uniforms.uExternalStatusSold = { value: new THREE.Color(EXTERNAL_LOT_PALETTE.sold) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
      attribute float exporuralTurf;
      attribute vec2 externalLotStatus;
      attribute float externalLotPitch;
      varying vec2 vExternalLotStatus;
      varying float vExternalLotPitch;
      varying float vExporuralTurf;
      varying vec3 vExporuralPosition;`)
      .replace('#include <project_vertex>', `
      vExporuralTurf=exporuralTurf*step(.8,abs(normal.y));
      // Only upward horizontal faces, never the bottom, bevel or extrusion.
      vExternalLotStatus=externalLotStatus*step(.999,normal.y);
      vExternalLotPitch=externalLotPitch;
      vec4 exporuralPosition=vec4(transformed,1.);
      #ifdef USE_BATCHING
        exporuralPosition=batchingMatrix*exporuralPosition;
      #endif
      vExporuralPosition=(modelMatrix*exporuralPosition).xyz;
      #include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
      uniform float uExternalTurfDetail;
      uniform float uExternalStatusPixelRatio;
      uniform vec3 uExternalStatusOpen;
      uniform vec3 uExternalStatusSold;
      varying vec2 vExternalLotStatus;
      varying float vExternalLotPitch;
      varying float vExporuralTurf;
      varying vec3 vExporuralPosition;
      // Integral of a periodic stripe, valid for negative world coordinates too.
      // The pixel footprint is integrated analytically, then converges to its
      // mean below resolution rather than disappearing or generating moire.
      float externalStripeIntegral(float p, float duty) {
        return floor(p)*duty+min(fract(p),duty);
      }
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
      }`}`)
      .replace('#include <tonemapping_fragment>', `#include <tonemapping_fragment>
      // Evaluate derivatives before the status branch. Phase and direction are
      // fixed to the world lattice, including BatchedMesh's presentation lift.
      float externalStripeCoord=dot(vExporuralPosition.xz,vec2(.70710678,.70710678))/max(vExternalLotPitch,.0000001);
      float externalStripePixel=max(fwidth(externalStripeCoord),.0001);
      if(vExternalLotStatus.x>.5) {
        // About 2 CSS pixels where resolvable; the lot-relative duty cap always
        // leaves green gaps and prevents a thin parcel becoming solid paint.
        float duty=clamp(2.*uExternalStatusPixelRatio*externalStripePixel,.25,.29);
        float stripePhase=fract(externalStripeCoord);
        float coverage=(externalStripeIntegral(stripePhase+externalStripePixel*.5,duty)
          -externalStripeIntegral(stripePhase-externalStripePixel*.5,duty))/externalStripePixel;
        coverage=mix(clamp(coverage,0.,1.),duty,smoothstep(.2,.8,externalStripePixel));
        vec3 statusColor=vExternalLotStatus.x>1.5 ? uExternalStatusSold : uExternalStatusOpen;
        // Status alone bypasses lighting/tone mapping; the grass keeps all its
        // existing light, texture and shadows. Depth, fog and opacity still apply.
        gl_FragColor.rgb=mix(gl_FragColor.rgb,statusColor,coverage*vExternalLotStatus.y);
      }`);
  };
  material.customProgramCacheKey = () => `${upstreamKey}|external-turf-r170-v5-status-lines:${reuseExistingSurfaceDetail ? 'surface' : 'procedural'}`;
  material.needsUpdate = true;
  installations.set(material, { detail, pixelRatio: statusPixelRatio });
}
