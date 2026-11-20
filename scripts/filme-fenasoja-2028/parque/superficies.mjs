import * as T from "three";
import { ROAD_MATERIAL_COLORS, ROAD_SURFACE_PROFILE } from "/src/features/commercial-map/constants.ts";
import { LACTALIS_STAGE_LAYOUT } from "/src/features/commercial-map/utils/lactalisStage.ts";

// Tile de luminância dos levantamentos CC0 da Poly Haven, na ordem RGB:
// https://polyhaven.com/a/grass_ground · https://polyhaven.com/a/bark_brown_02 · https://polyhaven.com/a/asphalt_04
// Só o renderizador offline carrega este arquivo; os materiais originais continuam definindo cores e marcas.
const roadColor = new T.Color(ROAD_MATERIAL_COLORS.asphalt);
const stageRoof = new T.Color(LACTALIS_STAGE_LAYOUT.palette.roof);
export const filmTime = { value: 0 };
export const scannedDetail = { value: null };

export async function loadSurfaces(renderer) {
  const texture = await new T.TextureLoader().loadAsync(new URL("./superficies.webp", import.meta.url).href);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  scannedDetail.value = texture;
}

export function hardSurface(object) {
  const material = object.material;
  if (!material?.isMeshStandardMaterial) return "";
  if (material.color.equals(roadColor) && material.roughness === ROAD_SURFACE_PROFILE.asphaltRoughness)
    return "asphalt";
  if (material.transparent) return "";
  if (object.name === "arena-roof-canonical" || material.customProgramCacheKey().endsWith("|roof")) return "roof";
  if (object.parent?.name === "palco-cultural-lactalis-architecture" && material.color.equals(stageRoof)) return "roof";
  if (/asphalt|asfalto/i.test(`${object.name} ${material.map?.name ?? ""}`)) return "asphalt";
  return "";
}

export const roadDetail = `
  vec2 roadUv = filmNaturePoint.xz * 4.2;
  float aggregate = texture2D(filmSurface, roadUv).b - 0.5;
  float patches = texture2D(filmSurface, roadUv * .19 + vec2(.126, .361)).b - .5;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.145, .159, .165), .77) * (1. + .98 * aggregate + .33 * patches);`;

// A ondulação perde contraste quando a chapa ocupa menos de um pixel, inclusive durante o voo.
export const roofDetail = `
  float flute = filmNaturePoint.z * 53.5;
  float resolved = 1. - smoothstep(.12, .70, fwidth(flute));
  float bead = cos(6.283185 * flute) * resolved;
  float sheet = filmNaturePoint.x * 3.4;
  float lap = (1. - smoothstep(.013, .05 + fwidth(sheet), abs(fract(sheet) - .5))) * (1. - smoothstep(.28, .9, fwidth(sheet)));
  float zinc = texture2D(filmSurface, filmNaturePoint.xz * 2.1).b - .5;
  diffuseColor.rgb *= 1. + .13 * bead + .14 * zinc - .12 * lap;`;
