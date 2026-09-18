import * as THREE from "three";
import { pilotRandom } from "../../utils/vegetationPilot";

let groundNoisePool: { texture: THREE.DataTexture; users: number } | null =
  null;
const groundNoiseOwners = new WeakMap<THREE.Material, THREE.DataTexture>();

export function groundNoiseForMaterial(material: THREE.Material) {
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
