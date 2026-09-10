import * as THREE from "three";
import { pilotRandom } from "../../utils/vegetationPilot";

let groundNoisePool: { texture: THREE.DataTexture; users: number } | null =
  null;
const groundNoiseOwners = new WeakMap<THREE.Material, THREE.DataTexture>();

function groundNoiseForMaterial(material: THREE.Material) {
  const existing = groundNoiseOwners.get(material);
  if (existing) return existing;
  if (!groundNoisePool) {
    const size = 256,
      data = new Uint8Array(size * size * 4),
      random = pilotRandom(77901);
    for (let i = 0; i < data.length; i += 4) {
      const value = Math.round(random() * 255);
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    texture.name = "pilot-ground-noise-256";
    groundNoisePool = { texture, users: 0 };
  }
  const pool = groundNoisePool;
  pool.users++;
  groundNoiseOwners.set(material, pool.texture);
  const release = () => {
    material.removeEventListener("dispose", release);
    groundNoiseOwners.delete(material);
    if (--pool.users === 0) {
      pool.texture.dispose();
      if (groundNoisePool === pool) groundNoisePool = null;
    }
  };
  material.addEventListener("dispose", release);
  return pool.texture;
}

/** One 256-square atlas, sixteen small leaves, baked vein/edge relief. Generated once per layer. */
export function createPilotLeafAtlas() {
  const size = 256,
    data = new Uint8Array(size * size * 4),
    random = pilotRandom(933);
  const leaves = Array.from({ length: 16 }, (_, i) => {
    const row = Math.floor(i / 2),
      side = i % 2 === 0 ? -1 : 1;
    return {
      x: 0.5 + side * (0.16 + random() * 0.07),
      y: 0.1 + row * 0.106 + (random() - 0.5) * 0.026,
      a: side * (0.45 + random() * 0.35),
      length: 0.125 + random() * 0.035,
      width: 0.075 + random() * 0.018,
      tone: 0.8 + random() * 0.18,
    };
  });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        o = (y * size + x) * 4;
      let alpha = 0,
        shade = 0.85;
      for (const l of leaves) {
        const dx = u - l.x,
          dy = v - l.y,
          c = Math.cos(l.a),
          s = Math.sin(l.a);
        const along = (dx * c + dy * s) / l.length,
          across = (-dx * s + dy * c) / l.width;
        const contour = Math.pow(Math.abs(along), 1.5) + across * across;
        if (contour < 1) {
          alpha = THREE.MathUtils.clamp((1 - contour) * 18, 0, 1);
          const vein = Math.exp(-Math.abs(across) * 44);
          const lateral =
            Math.pow(
              Math.max(0, Math.cos(along * 48 + Math.abs(across) * 16)),
              14,
            ) * 0.055;
          shade =
            l.tone *
            (0.76 +
              0.21 * (1 - across * 0.5) -
              0.12 * contour +
              vein * 0.11 -
              lateral);
          break;
        }
      }
      if (
        Math.abs(u - (0.5 + Math.sin(v * 4) * 0.016)) < 0.006 &&
        v > 0.04 &&
        v < 0.95
      ) {
        alpha = 1;
        shade = 0.62;
      }
      // Green edge dilation into transparent texels avoids black mip halos.
      data[o] = Math.round(245 * shade);
      data[o + 1] = Math.round(255 * shade);
      data[o + 2] = Math.round(212 * shade);
      data[o + 3] = Math.round(alpha * 255);
    }
  const t = new THREE.DataTexture(data, size, size);
  t.colorSpace = THREE.SRGBColorSpace;
  // Preserve cutout coverage in the mip chain, including the last texel. Otherwise
  // averaged alpha drops below the clip threshold and entire distant crowns vanish.
  const coverage =
    Array.from({ length: size * size }, (_, i) => data[i * 4 + 3]).filter(
      (a) => a >= 82,
    ).length /
    (size * size);
  const mipmaps = [{ data, width: size, height: size }];
  let previous = data,
    width = size;
  while (width > 1) {
    const nextWidth = width / 2,
      next = new Uint8Array(nextWidth * nextWidth * 4);
    for (let y = 0; y < nextWidth; y++)
      for (let x = 0; x < nextWidth; x++)
        for (let c = 0; c < 4; c++) {
          next[(y * nextWidth + x) * 4 + c] =
            (previous[(y * 2 * width + x * 2) * 4 + c] +
              previous[(y * 2 * width + x * 2 + 1) * 4 + c] +
              previous[((y * 2 + 1) * width + x * 2) * 4 + c] +
              previous[((y * 2 + 1) * width + x * 2 + 1) * 4 + c]) /
            4;
        }
    const alphas = Array.from(
      { length: nextWidth * nextWidth },
      (_, i) => next[i * 4 + 3],
    ).sort((a, b) => b - a);
    const cutoff = alphas[Math.max(0, Math.ceil(alphas.length * coverage) - 1)];
    const scale = 90 / Math.max(1, cutoff);
    for (let i = 3; i < next.length; i += 4)
      next[i] = Math.min(255, next[i] * scale);
    mipmaps.push({ data: next, width: nextWidth, height: nextWidth });
    previous = next;
    width = nextWidth;
  }
  t.mipmaps = mipmaps;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  t.name = "pilot-sixteen-leaf-twig-atlas";
  return t;
}

/** Private material hooks; never mutate a shared terrain/foliage material or ShaderChunk. */
export function createPilotFoliageMaterial(
  detail = false,
  grass = false,
  atlas: THREE.Texture | null = null,
) {
  const material = new THREE.MeshStandardMaterial({
    name: grass
      ? "pilot-grass"
      : detail
        ? "pilot-leaf-detail"
        : "pilot-leaf-core",
    vertexColors: true,
    roughness: grass ? 0.91 : 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
    map: atlas,
    alphaTest: atlas ? 0.32 : 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vPilotViewNormal;
      ${detail ? "attribute vec3 pilotLeafCenter;" : ""}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      `#include <defaultnormal_vertex>
      vPilotViewNormal = normalize(transformedNormal);`,
    );
    if (detail || grass)
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vec4 pilotCenter = modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
      float pilotFade = 1. - smoothstep(${grass ? "10., 28." : "14., 38."},distance(cameraPosition,pilotCenter.xyz));
      ${grass ? "transformed.y *= pilotFade;" : "transformed = mix(pilotLeafCenter,transformed,pilotFade);"}`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vPilotViewNormal;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
      // Thin-leaf back lighting tracks the existing sun and its intensity, including night.
      #if NUM_DIR_LIGHTS > 0
        float pilotBack = pow(max(0.,dot(normalize(vViewPosition),-directionalLights[0].direction)),3.);
        float pilotWrap = 0.3 + 0.7 * max(0.,dot(normalize(vPilotViewNormal),directionalLights[0].direction));
        reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * pilotBack * pilotWrap * ${grass ? "0.035" : "0.065"};
      #endif`,
    );
  };
  material.customProgramCacheKey = () =>
    `pilot-foliage-r170-v1-${detail}-${grass}`;
  return material;
}

export function createPilotBarkMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: "pilot-bark",
    vertexColors: true,
    roughness: 0.96,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vPilotBark;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvPilotBark=position;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vPilotBark;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float barkDistance = length(vViewPosition);
      float barkDetail = 1.-smoothstep(8.,30.,barkDistance);
      float barkRidge = sin(vPilotBark.x*331.+sin(vPilotBark.y*11.)*0.7+vPilotBark.z*283.);
      float barkFurrow = smoothstep(0.35,0.86,barkRidge);
      float barkGrain = sin(vPilotBark.x*773.+vPilotBark.y*189.+vPilotBark.z*937.);
      diffuseColor.rgb *= mix(1.,0.92+barkFurrow*0.13+barkGrain*0.035,barkDetail);
      diffuseColor.rgb *= 0.72+0.28*smoothstep(0.,0.36,vPilotBark.y);`,
    );
  };
  material.customProgramCacheKey = () => "pilot-bark-r170-v1";
  return material;
}

/** Nonperiodic world-space meadow detail; derivatives attenuate fine features before aliasing. */
export function applyPilotGroundMaterial(material: THREE.MeshStandardMaterial) {
  const noise = groundNoiseForMaterial(material);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pilotGroundNoise = { value: noise };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vPilotGround;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvPilotGround=(modelMatrix*vec4(position,1.)).xyz;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vPilotGround;
      uniform sampler2D pilotGroundNoise;
      float pilotNoise(vec2 p){return texture2D(pilotGroundNoise,(p+0.5)/256.).r;}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec2 p=vPilotGround.xz;
      float meadow=pilotNoise(p*0.66+vec2(pilotNoise(p*0.21)*2.));
      float clump=pilotNoise(p*4.2+meadow*3.);
      float fineFade=1.-smoothstep(0.018,0.075,length(fwidth(p)));
      float blade=pilotNoise(p*vec2(95.,31.)+clump*7.);
      diffuseColor.rgb *= mix(vec3(0.76,0.82,0.62),vec3(1.08,1.06,0.88),meadow);
      diffuseColor.rgb *= 0.86+clump*0.27;
      diffuseColor.rgb *= 1.+(blade-0.5)*0.26*fineFade;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      float grassRelief=blade;
      float reliefFade=1.-smoothstep(0.018,0.065,length(fwidth(vPilotGround.xz)));
      normal=normalize(normal+vec3(dFdx(grassRelief),dFdy(grassRelief),0.)*0.16*reliefFade);`,
    );
  };
  material.customProgramCacheKey = () => "pilot-ground-r170-v2-pooled-noise";
  material.needsUpdate = true;
  return material;
}
