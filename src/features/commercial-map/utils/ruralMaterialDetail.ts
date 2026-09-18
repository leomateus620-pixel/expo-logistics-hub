import type { MeshStandardMaterial } from 'three';

const installed = new WeakSet<MeshStandardMaterial>();

/** Explicit material membership; buildings share batches with unrelated gates. */
export function ruralSurfaceKind(id:string,color:string) {
  if(id.startsWith('roof-') || id==='ridge')return 2;
  return color==='#94745a' || color==='#9c7c60' ? 1 : 0;
}

/** Brick courses in model units (~0.24 x 0.075m at the working .15 scale).
 * Derivative filtering removes distant moire. No texture, frame work or draw.
 * Composes after the existing infrastructure shader instead of replacing it.
 */
export function applyRuralMaterialDetail(material:MeshStandardMaterial) {
  if (installed.has(material)) return;
  installed.add(material);
  const previous=material.onBeforeCompile;
  const key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float ruralSurface;
varying float vRuralSurface;
varying vec3 vRuralPosition;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
vRuralSurface = ruralSurface;
vec4 ruralPoint = vec4(position, 1.0);
#ifdef USE_INSTANCING
  ruralPoint = instanceMatrix * ruralPoint;
#endif
vRuralPosition = ruralPoint.xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying float vRuralSurface;
varying vec3 vRuralPosition;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
if(vRuralSurface > 0.5 && vRuralSurface < 1.5) {
  float row = floor(vRuralPosition.y / 0.01125);
  vec2 uv = vec2((vRuralPosition.x + vRuralPosition.z) / 0.036 + mod(row,2.0)*0.5, vRuralPosition.y / 0.01125);
  vec2 fw = fwidth(uv);
  vec2 joints = 1.0-smoothstep(vec2(0.06),vec2(0.06)+fw,fract(uv));
  float visible = 1.0-smoothstep(0.35,1.1,max(fw.x,fw.y));
  float mortar = max(joints.x,joints.y)*visible;
  float grain = fract(sin(dot(floor(uv),vec2(12.9898,78.233)))*43758.5453);
  diffuseColor.rgb *= mix(1.0,mix(0.92,1.07,grain),visible);
  diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.39,0.35,0.29),mortar*0.48);
} else if(vRuralSurface > 1.5) {
  float u=vRuralPosition.z / 0.024;
  float visibility=1.0-smoothstep(0.4,1.0,fwidth(u));
  diffuseColor.rgb *= 1.0+sin(u*6.2831853)*0.07*visibility;
}`);
  };
  material.customProgramCacheKey=()=>`${key}:rural-courses-v1`;
  material.needsUpdate = true;
}
