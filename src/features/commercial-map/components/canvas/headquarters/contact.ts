import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Surface } from "./geometry";
import { FENASOJA_COMPLEX } from "../../../data/fenasojaComplexReconstruction";

const CONTACT_SURFACES = new Set<Surface>([
  "wall",
  "sideWall",
  "frame",
  "soffit",
  "trim",
  "sign",
  "concrete",
  "pedestal",
  "pot",
  "wood",
  "warmInterior",
  "interior",
]);
type Part = { key: Surface; geometry: THREE.BufferGeometry; lod: number };

/** Local geometric sky occlusion, calculated once. No sun direction, photo shadows,
 * screen-space AO, extra light, framebuffer or work during camera navigation. */
export function bakeArchitecturalContact(parts: Part[]) {
  const start = performance.now();
  const sources = parts.filter(
    (p) => p.lod === 0 && CONTACT_SURFACES.has(p.key),
  );
  const merged = mergeGeometries(
    sources.map((p) => p.geometry),
    false,
  )!;
  const bvh = new MeshBVH(merged, { maxLeafTris: 8 });
  const ray = new THREE.Ray(),
    normal = new THREE.Vector3(),
    tangent = new THREE.Vector3(),
    bitangent = new THREE.Vector3(),
    axis = new THREE.Vector3();
  const cache = new Map<string, number>(),
    rays = 8,
    maxDistance = 0.85;
  let sampled = 0;
  for (const part of parts) {
    const p = part.geometry.getAttribute("position"),
      n = part.geometry.getAttribute("normal"),
      values = new Float32Array(p.count).fill(1);
    if (CONTACT_SURFACES.has(part.key) && part.key !== "wall")
      for (let i = 0; i < p.count; i++) {
        normal.fromBufferAttribute(n, i).normalize();
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const key = [
          x.toFixed(3),
          y.toFixed(3),
          z.toFixed(3),
          normal.x.toFixed(2),
          normal.y.toFixed(2),
          normal.z.toFixed(2),
        ].join(",");
        let value = cache.get(key);
        if (value === undefined) {
          axis.set(
            0,
            Math.abs(normal.y) < 0.9 ? 1 : 0,
            Math.abs(normal.y) < 0.9 ? 0 : 1,
          );
          tangent.crossVectors(axis, normal).normalize();
          bitangent.crossVectors(normal, tangent);
          ray.origin.set(x, y, z).addScaledVector(normal, 0.014);
          let cover = 0;
          for (let j = 0; j < rays; j++) {
            const a = j * 2.399963,
              cos = Math.sqrt((j + 0.5) / rays),
              sin = Math.sqrt(1 - cos * cos);
            ray.direction
              .copy(normal)
              .multiplyScalar(cos)
              .addScaledVector(tangent, Math.cos(a) * sin)
              .addScaledVector(bitangent, Math.sin(a) * sin);
            const hit = bvh.raycastFirst(
              ray,
              THREE.DoubleSide,
              0.009,
              maxDistance,
            );
            if (hit) cover += 1 - Math.min(1, hit.distance / maxDistance) * 0.7;
          }
          value = 1 - (0.56 * cover) / rays;
          cache.set(key, value);
          sampled++;
        }
        values[i] = value;
      }
    part.geometry.setAttribute(
      "hqContact",
      new THREE.Float32BufferAttribute(values, 1),
    );
  }
  merged.dispose();
  return {
    durationMs: performance.now() - start,
    samples: sampled,
    rays,
    maxDistanceMeters: maxDistance,
  };
}

export function applyArchitecturalContact(
  material: THREE.MeshStandardMaterial,
  key: Surface,
) {
  if (!CONTACT_SURFACES.has(key)) return;
  material.onBeforeCompile = (shader) => {
    if (key === "wall") {
      const hq = FENASOJA_COMPLEX.headquarters,
        main = hq.volumes.main;
      shader.uniforms.hqFront = { value: main.center[1] + main.depth / 2 };
      shader.uniforms.hqRoof = {
        value: new THREE.Vector3(
          main.eave,
          main.width / 2 + main.overhang,
          Math.tan(main.pitch),
        ),
      };
      shader.uniforms.hqPanel = {
        value: new THREE.Vector2(hq.sign.bottom, hq.sign.width / 2),
      };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vHqPosition;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvHqPosition=position;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vHqPosition;\nuniform float hqFront;\nuniform vec3 hqRoof;\nuniform vec2 hqPanel;",
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
        float frontContact=smoothstep(hqFront-0.31,hqFront-0.07,vHqPosition.z);
        float roofDistance=max(0.0,hqRoof.x+(hqRoof.y-abs(vHqPosition.x))*hqRoof.z-vHqPosition.y);
        float panelContact=step(vHqPosition.y,hqPanel.x)*(1.0-smoothstep(hqPanel.y-0.09,hqPanel.y+0.09,abs(vHqPosition.x)))*exp(-max(0.0,hqPanel.x-vHqPosition.y)/0.22);
        float skyContact=1.0-frontContact*(0.17*exp(-roofDistance/0.23)+0.22*panelContact)-0.11*exp(-max(vHqPosition.y,0.0)/0.17);
        reflectedLight.indirectDiffuse*=clamp(skyContact,0.55,1.0);
      `,
        );
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float hqContact;\nvarying float vHqContact;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHqContact = hqContact;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vHqContact;",
      )
      .replace(
        "#include <aomap_fragment>",
        "#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= clamp(vHqContact, 0.44, 1.0);\nreflectedLight.indirectSpecular *= mix(1.0, vHqContact, 0.3);",
      );
  };
  material.customProgramCacheKey = () =>
    `fenasoja-local-geometric-contact-v2:${key === "wall" ? "wall" : "sampled"}`;
}
