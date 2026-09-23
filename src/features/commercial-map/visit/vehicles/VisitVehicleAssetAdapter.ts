import type { Group, Mesh, Object3D, Texture } from 'three';
import { visitVehicleNoPick } from './VisitVehicleVisuals';

export type VisitVehicleAssetKind = 'cart' | 'helicopter';
export interface VisitVehicleAssetAudit {
  triangles: number;
  drawCalls: number;
  materials: number;
  textures: number;
  largestTextureSide: number;
}
export interface VisitCartAssetRig {
  kind: 'cart';
  scene: Group;
  wheelSteer: [Object3D, Object3D];
  wheelSpin: [Object3D, Object3D, Object3D, Object3D];
  audit: VisitVehicleAssetAudit;
}
export interface VisitHelicopterAssetRig {
  kind: 'helicopter';
  scene: Group;
  mainRotor: Object3D;
  tailRotor: Object3D;
  audit: VisitVehicleAssetAudit;
}
export type VisitVehicleAssetRig = VisitCartAssetRig | VisitHelicopterAssetRig;

/**
 * GLB authoring contract (metres, +Y up, nose toward -Z, landing gear on Y=0):
 * cart: steer_front_left/right > wheel_front_left/right, plus wheel_rear_left/right;
 * helicopter: rotor_main and rotor_tail. Physics/camera use controller poses,
 * never GLB bounds, so a revised final asset cannot change navigation behavior.
 */
const CART_NODES = ['steer_front_left', 'steer_front_right', 'wheel_front_left', 'wheel_front_right', 'wheel_rear_left', 'wheel_rear_right'] as const;
const HELICOPTER_NODES = ['rotor_main', 'rotor_tail'] as const;

function auditAsset(scene: Group): VisitVehicleAssetAudit {
  let triangles = 0, drawCalls = 0, largestTextureSide = 0;
  const materials = new Set<unknown>(), textures = new Set<Texture>();
  scene.traverse(object => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    mesh.raycast = visitVehicleNoPick;
    mesh.castShadow = true;
    drawCalls += Array.isArray(mesh.material) ? Math.max(1, mesh.geometry.groups.length) : 1;
    const geometry = mesh.geometry;
    triangles += (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && (value as Texture).isTexture) textures.add(value as Texture);
      }
    }
  });
  for (const texture of textures) {
    const image = texture.image as { width?: number; height?: number } | undefined;
    largestTextureSide = Math.max(largestTextureSide, image?.width ?? 0, image?.height ?? 0);
  }
  return { triangles: Math.round(triangles), drawCalls, materials: materials.size, textures: textures.size, largestTextureSide };
}

function requiredNode(scene: Group, name: string) {
  const node = scene.getObjectByName(name);
  if (!node) throw new Error(`Asset de veículo sem nó obrigatório: ${name}`);
  return node;
}

/** Called only if a future definitive GLB URL is configured; loader stays out of the normal map bundle. */
export async function loadVisitVehicleAsset(url: string, kind: 'cart'): Promise<VisitCartAssetRig>;
export async function loadVisitVehicleAsset(url: string, kind: 'helicopter'): Promise<VisitHelicopterAssetRig>;
export async function loadVisitVehicleAsset(url: string, kind: VisitVehicleAssetKind): Promise<VisitVehicleAssetRig> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { scene } = await new GLTFLoader().loadAsync(url);
  try {
    const audit = auditAsset(scene);
    // Defensive production budgets, independent of adaptive visual quality.
    const budget = kind === 'cart' ? { triangles: 20_000, drawCalls: 28 } : { triangles: 32_000, drawCalls: 32 };
    if (audit.triangles > budget.triangles || audit.drawCalls > budget.drawCalls || audit.largestTextureSide > 2048) {
      throw new Error(`Asset ${kind} excede o orçamento 3D: ${JSON.stringify(audit)}`);
    }
    if (kind === 'cart') {
      const nodes = CART_NODES.map(name => requiredNode(scene, name));
      return { kind, scene, wheelSteer: [nodes[0], nodes[1]], wheelSpin: [nodes[2], nodes[3], nodes[4], nodes[5]], audit };
    }
    const nodes = HELICOPTER_NODES.map(name => requiredNode(scene, name));
    return { kind, scene, mainRotor: nodes[0], tailRotor: nodes[1], audit };
  } catch (error) {
    disposeVisitVehicleScene(scene);
    throw error;
  }
}

/** A loaded asset has one owner; release GPU resources on vehicle/session teardown. */
function disposeVisitVehicleScene(scene: Group) {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Mesh['material']>();
  scene.traverse(object => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    geometries.add(mesh.geometry);
    materials.add(mesh.material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => {
    for (const item of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(item)) if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose();
      item.dispose();
    }
  });
}
export function disposeVisitVehicleAsset(rig: VisitVehicleAssetRig) { disposeVisitVehicleScene(rig.scene); }
