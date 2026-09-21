import type * as THREE from "three";

/** Attribute scope keeps every other lot and all commercial highlight colours intact. */
export function applyExporuralTurfMaterial(
  material: THREE.MeshStandardMaterial,
) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
      attribute float exporuralTurf;
      varying float vExporuralTurf;
      varying vec3 vExporuralPosition;`,
      )
      .replace(
        "#include <project_vertex>",
        `
      vExporuralTurf=exporuralTurf*step(.8,abs(normal.y));
      vec4 exporuralPosition=vec4(transformed,1.);
      #ifdef USE_BATCHING
        exporuralPosition=batchingMatrix*exporuralPosition;
      #endif
      vExporuralPosition=(modelMatrix*exporuralPosition).xyz;
      #include <project_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying float vExporuralTurf;
      varying vec3 vExporuralPosition;
      float ruralGrain(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      if(vExporuralTurf>.5) {
        vec2 p=vExporuralPosition.xz;
        float blade=ruralGrain(floor(p*vec2(190.,75.)));
        float fade=1.-smoothstep(.015,.09,length(fwidth(p)));
        float mowing=sin(p.x*2.1+p.y*.45)*.016;
        diffuseColor.rgb*=1.+mowing+(blade-.5)*.16*fade;
      }`,
      );
  };
  material.customProgramCacheKey = () => "exporural-turf-v1";
}
