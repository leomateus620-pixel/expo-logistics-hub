import * as T from "three";
import { commercialMapSunriseDirection } from "/src/features/commercial-map/data/commercialMapEnvironment.ts";
import { resolveGrove } from "./bosque.mjs";
const direction = new T.Vector3(...commercialMapSunriseDirection(14));
const materialBank = new Map();
const assigned = new WeakSet();
export function vegetationClass(object) {
  const sample = [object.name, object.material?.name].join(" ").toLowerCase();
  if (/sombra|shadow|contato|contact|tree-pit|caminho-do-bosque|canopy-structure/.test(sample)) return "";
  if (/canop|foliag|folhagem|copas|leaf-detail|folhas|tree-[0-9]|etnias-adjacent-trees|copa[s-]|sub-bosque|follaje/.test(sample))
    return "leaf";
  if (/trunk|tronco|bark|galhos|pilot-wood/.test(sample)) return "wood";
  if (/grass|lawn|gramad|parkinteriorground|solo-vegetal|pilot-ground|capim/.test(sample)) return "grass";
  return "";
}
function detailMaterial(mat, kind) {
  const key = mat.uuid + kind;
  if (materialBank.has(key)) return materialBank.get(key);
  const out = mat.clone();
  out.name = mat.name + " (filme " + kind + ")";
  out.onBeforeCompile = (sh, r) => {
    mat.onBeforeCompile.call(out, sh, r);
    sh.vertexShader =
      "varying vec3 filmNaturePoint;\n" +
      sh.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
    vec4 filmOrigin=vec4(transformed,1.);
    #ifdef USE_BATCHING
       filmOrigin=batchingMatrix*filmOrigin;
    #endif
    #ifdef USE_INSTANCING
       filmOrigin=instanceMatrix*filmOrigin;
    #endif
    filmNaturePoint=(modelMatrix*filmOrigin).xyz;`,
      );
    const code =
      kind === "wood"
        ? `
    float barkFilm=filmN(filmNaturePoint*vec3(34.,3.1,34.));
    diffuseColor.rgb*=vec3(1.018,.985,.955)*(.84+.27*barkFilm);`
        : kind === "grass"
          ? `
    vec3 dirtP=filmNaturePoint*vec3(3.1,.5,3.1);
    float tuftMacro=filmN(dirtP*.39),tuftMeso=filmN(dirtP*2.5);
    vec3 blades=filmNaturePoint*vec3(72.,.8,37.);
    float grassMicro=(filmN(blades)-.5)*clamp(1.-max(length(dFdx(blades)),length(dFdy(blades)))*.43,0.,1.);
    diffuseColor.rgb*=mix(vec3(.88,.91,.78),vec3(1.11,1.04,1.02),tuftMacro)*(.84+.28*tuftMeso+.33*grassMicro);`
          : `
    vec3 leafP=filmNaturePoint*vec3(6.4,7.6,6.4);
    float cluster=filmN(leafP*.63),fol=filmN(leafP*2.55);
    vec3 fineP=leafP*7.6;
    float leafMicro=(filmN(fineP)-.5)*clamp(1.-.32*max(length(dFdx(fineP)),length(dFdy(fineP))),0.,1.);
    diffuseColor.rgb*=mix(vec3(.70,.79,.71),vec3(1.12,1.09,.92),cluster)*(.78+.45*fol+.22*leafMicro);`;
    sh.fragmentShader =
      `varying vec3 filmNaturePoint;
  float filmH(vec3 p){p=fract(p*.1031);p+=dot(p,p.yxz+19.19);return fract((p.x+p.y)*p.z);}
  float filmN(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(filmH(i),filmH(i+vec3(1,0,0)),f.x),mix(filmH(i+vec3(0,1,0)),filmH(i+vec3(1,1,0)),f.x),f.y),mix(mix(filmH(i+vec3(0,0,1)),filmH(i+vec3(1,0,1)),f.x),mix(filmH(i+vec3(0,1,1)),filmH(i+vec3(1,1,1)),f.x),f.y),f.z);}
  ` + sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n" + code);
  };
  out.customProgramCacheKey = () => mat.customProgramCacheKey() + "-film-v2-" + kind;
  out.userData.filmNature = kind;
  materialBank.set(key, out);
  return out;
}

export function prepareNature(scene) {
  const stems = [];
  scene.traverse((o) => {
    if (o.name.startsWith("pilot-trunks-")) stems.push(o);
  });
  stems.forEach(resolveGrove);
  scene.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    if (!assigned.has(o)) {
      const kind = vegetationClass(o);
      assigned.add(o);
      if (kind && (o.material.isMeshStandardMaterial || o.material.isMeshBasicMaterial))
        o.material = detailMaterial(o.material, kind);
    }
    if (o.name.startsWith("pilot-leaf-detail-")) o.visible = true;
  });
  const sun = scene.getObjectByName("CommercialMapAuthoritativeSunLight");
  if (sun) {
    const distance = sun.position.distanceTo(sun.target.position);
    sun.position.copy(sun.target.position).addScaledVector(direction, distance);
    sun.color.set("#ffdfba");
    sun.updateMatrixWorld();
    sun.shadow.needsUpdate = true;
  }
  const sky = scene.getObjectByName("CommercialMapPhysicalSunriseSky");
  if (sky?.material?.uniforms?.sunPosition) sky.material.uniforms.sunPosition.value.copy(direction);
}
